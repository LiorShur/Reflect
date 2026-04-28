# 08 — Prompt evaluation and versioning

## Why this exists

The AI behavior is the product. Subtle prompt changes meaningfully
shift user experience, and bad prompt drift is invisible without
explicit measurement. This doc covers how prompts are versioned,
evaluated, and rolled out.

## Prompt registry

All prompts live as YAML files in `/prompts/`, one per role. Each
file has a header with metadata:

```yaml
role: translator
version: 1.0.0
status: active            # active | deprecated | draft
rollout_pct: 100
model: claude-sonnet-4-5
temperature: 0.4
max_tokens: 600
```

The orchestrator loads these on Cloud Function cold start, caches in
memory, and keys traces by `(role, version)`.

**Versioning:** Semantic versions for breaking changes, minor for
behavior tweaks, patch for typo fixes. Bumping version means a new
trace key and new eval run.

## Trace logging

Every AI call produces a trace record in Firestore at
`telemetry/traces/{traceId}`:

```typescript
interface TraceRecord {
  trace_id: string;            // ULID
  session_id_hash: string;     // salted hash of session ID
  role: string;
  prompt_version: string;
  model: string;
  input_hash: string;          // salted hash of input
  raw_input?: string;          // ONLY if user opted in to retention
  output: string;              // structured output (JSON)
  latency_ms: number;
  user_feedback?: {
    accepted: boolean;
    feedback_type?: 'wrong_meaning' | 'too_soft' | 'too_strong' | 'other';
    free_text?: string;
  };
  created_at: Timestamp;
  ttl: Timestamp;              // 24h default, 90d if user opted in
}
```

**Privacy posture:**
- Default: `raw_input` not stored, only hash. 24-hour TTL.
- Opt-in (per session): `raw_input` stored, 90-day TTL.
- Aggregate metrics (acceptance rate, feedback distribution) are
  always retained, never linked to message content after TTL.

## Eval per role

### Translator eval

The eval is **qualities-based**, not exact-output. Build a curated set
of 50–100 input statements representing the spectrum: mild complaint,
harsh criticism, contempt, already-soft, ambiguous.

Eval runs as an LLM-as-judge call (using Claude with a strict rubric).
For each input, score:

| Quality | Scale |
|---|---|
| Preserves emotional weight | 1–3 |
| Uses I-statement | yes/no |
| Adds facts not in original | yes/no — **critical fail if yes** |
| In softened complaint format | yes/no |
| Length under 1.5x original | yes/no |
| Matches speaker register | 1–3 |

Run new prompt version, compare quality distribution to baseline
(currently active version). Any case where new < baseline gets human
review.

### Moderator eval

Classification: each test input has an expected tier (0/1/2/3). Compute
precision, recall, and confusion matrix per tier.

**Asymmetry:** tier 1 false positives are acceptable (over-suggesting a
softer wording on something fine), but tier 3 false positives are
unacceptable (hard-blocking a non-contempt message). Weight loss
function accordingly.

Test set composition target:
- 30% clean (no flags expected)
- 30% tier 1 (mild markers)
- 25% tier 2 (multiple or moderate markers)
- 15% tier 3 (clear contempt or character attacks)

### Quality checker eval (v2)

Ground truth from clinical examples. If video annotations from Gottman
training programs are unavailable, hand-curate 30–50 examples with two
annotators (Cohen's kappa to confirm agreement) and use as hold-out.

Evaluate AI scores against expert scores per dimension (cleanliness,
content, feeling, validation).

### Wrap-up summarizer eval

LLM-as-judge with rubric:

- Captures what each partner said (1–3)
- Avoids interpretation beyond what was said (yes/no — critical)
- Avoids solution-suggestion (yes/no — critical)
- Avoids framing either partner as the problem (yes/no — critical)
- Length appropriate (yes/no)

## Eval harness structure

```
/eval/
  datasets/
    translator-cases.jsonl       # input + expected qualities
    moderator-cases.jsonl        # input + expected tier
    wrap-up-cases.jsonl
    quality-checker-cases.jsonl  # v2
  judges/
    translator-judge-prompt.yaml
    moderator-judge-prompt.yaml
    wrap-up-judge-prompt.yaml
  runner.ts                      # CLI: run prompt vs dataset
  baseline-results/              # results per prompt version
  scripts/
    run-eval.ts
    compare-versions.ts
    summarize.ts
```

CLI usage:

```bash
# Run a specific prompt version against its dataset
pnpm eval translator 1.1.0

# Compare two versions
pnpm eval-compare translator 1.0.0 1.1.0

# Output: aggregate metrics, per-case scores, regressions flagged
```

## A/B testing flow

1. Author new prompt version: `prompts/translator.yaml`, version
   `1.1.0`, status `draft`, rollout_pct `0`
2. Run eval: `pnpm eval translator 1.1.0`
3. If eval shows no regression on critical qualities: set status
   `active`, rollout_pct `5`
4. Orchestrator now sends 5% of translator calls to v1.1.0, 95% to
   v1.0.0
5. Monitor for 1–2 weeks on three signals:
   - Speaker rejection rate (rejected translations / total)
   - Retry rate (mirror retries triggered after this translation)
   - Session completion rate
6. If new version holds or improves on all three: ramp to 100%, set
   v1.0.0 to `deprecated`
7. If any metric degrades: rollback to 0%, investigate

The rollout selection is deterministic per session (hash of
session_id) so that a session always sees the same prompt version end
to end.

## User feedback capture

When a speaker rejects a translation (clicks "use original" or "edit"):
optional 1-tap feedback popup:

- "Wrong meaning"
- "Too soft"
- "Too strong"
- "Just preferred mine"

These map to `user_feedback.feedback_type` in the trace record. They're
the highest-signal data for prompt improvement.

When the speaker confirms they were "not heard" after a mirror: same
pattern, mapped to a quality-checker feedback record.

## Adversarial / red-team eval

Run periodically (monthly):

- Contemptuous statements written to evade lexical detector
- Speakers gaming the translator to make the partner sound worse
- Attempts to elicit problem-solving from the moderator
- Disclosures of abuse hidden in seemingly normal statements
- Prompt-injection attempts in user input

Synthetic generation of hard cases works well:

```bash
pnpm gen-adversarial translator 50
# Uses Claude to generate 50 examples of harsh startup
# that don't contain absolutism words
```

Add adversarial cases to the dataset over time. Eval should always run
on the union of curated + adversarial cases.

## Cost monitoring

Each Cloud Function logs token usage per call. Aggregate dashboard:

- Cost per session (rolling 7-day avg)
- Cost per active user (rolling 30-day avg)
- Per-role cost breakdown
- Spike alerts (any session >$2 → flag for review)

Per-user cost cap: $5/day hard limit. If a user hits this, AI features
disabled with a soft message until midnight UTC.

## Prompt caching

Anthropic API supports prompt caching. The translator system prompt is
~300 tokens and reused across thousands of calls per day — cache it.
Estimated savings: ~30% on translator costs.

Configure via the Anthropic SDK's `cache_control` parameter on the
system prompt block.
