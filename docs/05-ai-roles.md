# 05 — AI roles and prompts

This doc covers the four AI roles, their prompts, and how the
orchestrator routes between them. Versioned prompts live in
`/prompts/*.yaml` — this doc has the templates and rationale.

## Summary

| Role | v1? | Latency budget | Model |
|---|---|---|---|
| Moderator (fast-path) | Yes | <200ms | Lexical, no LLM |
| Moderator (escalation) | Yes | 1–2s | Claude Sonnet |
| Translator | Yes | 1–3s | Claude Sonnet |
| Wrap-up summarizer | Yes | 2–4s | Claude Sonnet |
| Quality checker | v2 | 1–2s | Claude Sonnet |
| Interpreter | v2 | 1–2s | Claude Sonnet |

## Moderator (fast-path)

See `10-moderator-fastpath.md` for the lexical pattern matching, regex,
and scoring function. Runs first, deterministic. Outputs a tier and
either routes to the translator (clean / tier 1) or escalates.

## Moderator (escalation)

For tier-2 cases where lexical detection found *something* but isn't
sure of severity. Asks Claude to read the message as a partner would
and assign a final tier.

```yaml
# prompts/moderator-escalation.yaml (excerpt)
role: moderator_escalation
version: 1.0.0
status: active
model: claude-sonnet-4-5
temperature: 0.2
max_tokens: 300

system: |
  You are reading a message that one partner is about to send to the
  other in a couples therapy session. The lexical pre-screen flagged
  it as potentially harsh but not clearly contemptuous.

  Decide: how would the partner most likely receive this message?

  Tier 1: a small wording suggestion would help, but the message is
    fundamentally fine to send.
  Tier 2: this is likely to put the partner on the defensive. Worth
    flagging to the speaker for revision.
  Tier 3: this contains contempt, name-calling, or a character attack
    severe enough to require revision before sending.

  Consider context: a self-statement ("I never feel heard") is not a
  partner attack. A specific complaint about behavior is healthier
  than a character attack.

  Return JSON:
  {
    "tier": 1 | 2 | 3,
    "reason": "1-2 sentences explaining why",
    "suggestion": "specific rewrite hint, or null"
  }

user: |
  Message: """{{RAW_MESSAGE}}"""
  Lexical flags: {{FLAGS}}
```

**Routing:** Tier 1 → speaker sees a soft inline suggestion before the
translator runs. Tier 2 → speaker sees a soft pause prompt; can choose
to revise or proceed. Tier 3 → hard block; speaker must revise before
sending.

## Translator

The highest-leverage AI in v1. The full prompt template:

```yaml
# prompts/translator.yaml
role: translator
version: 1.0.0
status: active
model: claude-sonnet-4-5
temperature: 0.4
max_tokens: 600

system: |
  You are helping a partner in a couples therapy session restate their
  message using Gottman's softened complaint format.

  Convert the input to softened complaint format:
    1. I-statement that owns the feeling ("I feel..." or "I felt...")
    2. About a SPECIFIC situation or behavior, not a character trait
    3. Ending with a POSITIVE need (what would help), not a complaint
       about what went wrong

  Hard rules:
    - Preserve the emotional weight. If they are angry, the softened
      version must still read as angry — soften the form, not the
      content.
    - Do not add facts, history, or motivations they did not state.
    - Match their vocabulary and register. Do not therapize their
      voice — if they wrote "I felt like shit" don't return "I
      experienced significant distress."
    - Maximum 1.5x the original word count.
    - If the original is ALREADY in softened complaint form, set
      already_soft=true and return the original unchanged.
    - If you cannot soften without losing the message, set
      cannot_soften=true and explain in changes_made.

  Return JSON only, no preamble:
  {
    "softened": "...",
    "already_soft": boolean,
    "cannot_soften": boolean,
    "changes_made": "1-2 sentence plain explanation for the speaker
                     so they understand what shifted and can edit"
  }

user: |
  The speaker said: """{{RAW_STATEMENT}}"""

  Session topic: {{TOPIC}}
  Speaker's underlying feeling (if known): {{FEELING_OR_NULL}}
```

**Examples** (also used in eval — see `08-prompt-eval.md`):

*Input:* "You never listen to me. I came home and started telling you
about the meeting and you just kept scrolling."

*Output:*
```json
{
  "softened": "I felt invisible tonight when I was telling you about
  the meeting and you kept scrolling. I really need to feel like you're
  with me when I'm decompressing from work.",
  "already_soft": false,
  "cannot_soften": false,
  "changes_made": "Replaced 'never listen' with the specific moment,
  and added what would help instead of what went wrong."
}
```

*Input:* "I've been feeling like we're drifting and I want to figure
out what's going on."

*Output:*
```json
{
  "softened": "I've been feeling like we're drifting and I want to
  figure out what's going on.",
  "already_soft": true,
  "cannot_soften": false,
  "changes_made": "This is already in softened complaint form — no
  changes needed."
}
```

## Wrap-up summarizer

Generates two short summaries — one per partner — at the end of a
session.

```yaml
# prompts/wrap-up-summarizer.yaml
role: wrap_up_summarizer
version: 1.0.0
status: active
model: claude-sonnet-4-5
temperature: 0.3
max_tokens: 500

system: |
  You are summarizing what each partner said in a couples therapy
  session, so they can confirm they were heard.

  Produce one short summary per partner, ~3 lines each, in their own
  voice as much as possible. Capture:
    - What they were experiencing
    - What they need or want
    - The specific situation, if relevant

  Do NOT:
    - Suggest solutions
    - Editorialize about the relationship
    - Add interpretations beyond what was said
    - Frame either partner as the problem

  Return JSON:
  {
    "partner_a_summary": "...",
    "partner_b_summary": "..."
  }

user: |
  Topic: {{TOPIC}}

  Turns:
  {{TURN_HISTORY}}

  Partner A is {{PARTNER_A_NAME}}.
  Partner B is {{PARTNER_B_NAME}}.
```

## Quality checker (v2)

Scores listener mirrors on four dimensions: cleanliness (binary,
gating), content capture (0–3), feeling capture (0–3), validation
(binary).

The output drives the post-submit coaching banner. The listener never
sees the score; only the coaching language.

See full prompt in `prompts/quality-checker.yaml` (v2).

## Interpreter (v2)

Surfaces the underlying feeling beneath a statement. Two surfaces:

- **Speaker-side (default):** offered to the speaker before they
  finalize. "It sounds like the deeper feeling here might be loneliness
  — does that fit?"
- **Listener-side (optional):** offered to the listener as context to
  help them mirror more empathically.

See full prompt in `prompts/interpreter.yaml` (v2).

## Orchestration sequence (v1)

```
1. Speaker writes draft to RTDB
2. Speaker hits "send" → speaker_draft.committed = true
3. Trigger fires Cloud Function: scoreFastPath(text, baseline)
   - Tier 3: write moderator flag, block draft, return coaching to speaker
   - Tier 2 + needsEscalation: call moderator-escalation prompt
     - Final tier 3: block
     - Final tier 2: speaker sees soft pause, can override
     - Final tier 1: pass to translator
   - Tier 1: pass to translator (with soft suggestion shown)
   - Clean: pass to translator
4. Translator runs, writes to current_turn/translation
5. Speaker sees review screen, approves or edits
6. Speaker writes translation.approved = true
7. Trigger copies softened text to current_turn/delivered
8. Listener sees delivered text, composes mirror, submits
9. Listener writes to current_turn/mirror
10. v1: Mirror goes straight to speaker
    v2: Quality checker runs first, may trigger coaching
11. Speaker sees mirror, hits "yes" / "more" / "try again"
12. If "yes" / "more": archive turn, transition to FLOOR_SWAP
    If "try again": return to listener mirroring with optional hint
```

## Cost estimation (rough)

Per session (assume 6 turns, both directions):

- 12 translator calls (1 per turn × 2 partners): ~$0.10–0.30
- 0–6 moderator escalations: ~$0.01–0.05
- 1 wrap-up summary: ~$0.02
- 0–12 quality checker calls (v2): ~$0.05–0.15
- **Total per session:** ~$0.15–0.50

At scale, prompt caching on the translator system prompt cuts this
~30%.

## Versioning and rollout

All prompts live in `/prompts/*.yaml`, version-controlled. The registry
loads from these files on Cloud Function cold start.

A/B testing: each prompt has a `rollout_pct` field. New version starts
at 5%, monitored on user feedback rate, retry rate, and session
completion. Ramps to 100% if metrics hold for 1–2 weeks.

See `08-prompt-eval.md` for the full eval harness.
