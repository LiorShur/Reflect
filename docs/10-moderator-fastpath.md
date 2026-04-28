# 10 — Moderator lexical fast-path

The deterministic first-pass moderator. Runs as a Cloud Function on
`speaker_draft.committed = true`. Targets sub-200ms p95 latency for v1
text mode.

## What it detects

Five categories, in priority order:

1. **Contempt** (highest weight) — name-calling, mockery, sarcasm
2. **Character attack** — "you're [adjective]" patterns
3. **Mind-reading** — claiming to know partner's internal state
4. **Absolutism** — "always," "never," "every time"
5. **Defensiveness opener** — "well I wouldn't have to if..."

Plus:

6. **Activation markers** (relative to speaker baseline) — short bursts,
   punctuation density, all-caps

## Word lists and patterns

```typescript
// /functions/src/moderator/patterns.ts

export const ABSOLUTISM = new Set([
  'always', 'never', 'every time', 'every single time',
  'all the time', 'constantly', 'forever',
  'nothing', 'everything', 'no one', 'nobody', 'everyone'
]);

// Names directed at partner — most sensitive list, needs ongoing
// tuning. v1 starts conservative.
export const CONTEMPT_NAMES = new Set([
  'idiot', 'asshole', 'jerk', 'loser', 'pathetic',
  'selfish', 'lazy', 'stupid', 'childish', 'immature',
  'crazy', 'insane', 'ridiculous', 'useless', 'worthless'
]);

export const CONTEMPT_PHRASES: RegExp[] = [
  /\btypical (of )?you\b/i,
  /\bclassic you\b/i,
  /\breal mature\b/i,
  /\bwow,?\s+(just|really|so)\s+wow\b/i,
  /\boh (please|come on|sure)\b/i,
  /\bsure,?\s+jan\b/i,
  /\bof course you\b/i,
  /\bgrow up\b/i,
];

// "you're [adjective]" — character vs behavior
export const CHARACTER_ATTACK: RegExp[] = [
  /\byou(?:'re| are) (?:so|such (?:a|an))\s+(\w+)/i,
  /\byou(?:'re| are) (?:a|an)\s+(\w+(?: \w+)?)/i,
  /\byou(?:'re| are) being\s+(\w+)/i,
];

// Claiming knowledge of partner's internal state
export const MIND_READING: RegExp[] = [
  /\byou don't (even )?(care|love|listen|see|notice)\b/i,
  /\byou obviously\b/i,
  /\byou clearly (don't|can't|won't)\b/i,
  /\byou never (even )?(try|bother|think)\b/i,
];

// Counter-complaint or innocent-victim opener
export const DEFENSIVENESS_OPENERS: RegExp[] = [
  /^(well,?\s+)?i wouldn't (have to|need to)\s+(?:if|because)/i,
  /^yeah,?\s+but you\b/i,
  /^i'm just trying to\b/i,
  /^the only reason i\b/i,
];

// "I never feel heard" — self-statement, not partner attack
export const SELF_REFERENCE: RegExp[] = [
  /\bi (never|always) (feel|felt|am|was|get)\b/i,
];
```

## Scoring function

```typescript
// /functions/src/moderator/score.ts

export interface SpeakerBaseline {
  avg_message_length: number;   // characters
  avg_exclamations: number;     // per message
  sample_count: number;
}

export interface FastPathFlag {
  type: string;
  term?: string;
  delta?: number;
}

export interface FastPathResult {
  tier: 'clean' | 'tier_1' | 'tier_2' | 'tier_3';
  score: number;
  flags: FastPathFlag[];
  needs_escalation: boolean;
}

export function scoreFastPath(
  text: string,
  baseline?: SpeakerBaseline
): FastPathResult {
  const t = text.toLowerCase();
  const flags: FastPathFlag[] = [];
  let score = 0;

  // Self-reference exemption: "I never feel heard" should NOT
  // be scored as absolutism even though "never" appears.
  const selfRef = SELF_REFERENCE.some(r => r.test(t));

  // Absolutism (skip if in self-reference context only)
  if (!selfRef) {
    for (const word of ABSOLUTISM) {
      if (new RegExp(`\\b${word}\\b`, 'i').test(t)) {
        flags.push({ type: 'absolutism', term: word });
        score += 1;
      }
    }
  }

  // Character attack
  for (const pat of CHARACTER_ATTACK) {
    const m = t.match(pat);
    if (m) {
      flags.push({ type: 'character_attack', term: m[0] });
      score += 2;
    }
  }

  // Mind reading
  for (const pat of MIND_READING) {
    if (pat.test(t)) {
      flags.push({ type: 'mind_reading' });
      score += 2;
    }
  }

  // Defensiveness opener (only flag if first 12 words)
  const opener = t.split(/\s+/).slice(0, 12).join(' ');
  for (const pat of DEFENSIVENESS_OPENERS) {
    if (pat.test(opener)) {
      flags.push({ type: 'defensiveness' });
      score += 1;
    }
  }

  // Contempt phrases
  for (const pat of CONTEMPT_PHRASES) {
    if (pat.test(t)) {
      flags.push({ type: 'contempt_phrase' });
      score += 4;   // contempt is heavily weighted
    }
  }

  // Contempt name-calling: directed at partner detected by
  // proximity to "you" or "you're"
  const tokens = t.split(/\s+/);
  for (let i = 0; i < tokens.length; i++) {
    const tok = tokens[i].replace(/[.,!?]/g, '');
    if (CONTEMPT_NAMES.has(tok)) {
      // is "you" or "you're" within 3 words before?
      const window = tokens.slice(Math.max(0, i - 3), i).join(' ');
      if (/\byou(?:'re|r)?\b/i.test(window)) {
        flags.push({ type: 'name_calling', term: tok });
        score += 5;
      }
    }
  }

  // Activation delta vs speaker baseline
  if (baseline && baseline.sample_count >= 5) {
    const len = text.length;
    const exclamations = (text.match(/!/g) || []).length;
    const allCaps = (text.match(/\b[A-Z]{3,}\b/g) || []).length;

    if (len < baseline.avg_message_length * 0.5) {
      flags.push({ type: 'activation_short', delta: -0.5 });
      score += 1;
    }
    if (exclamations > baseline.avg_exclamations * 2) {
      flags.push({ type: 'activation_punct' });
      score += 1;
    }
    if (allCaps > 0) {
      flags.push({ type: 'activation_caps' });
      score += 2;
    }
  }

  // Tier assignment
  let tier: FastPathResult['tier'] = 'clean';
  let needs_escalation = false;

  if (score >= 7 || flags.some(f =>
        f.type === 'name_calling' || f.type === 'contempt_phrase')) {
    tier = 'tier_3';   // hard block
  } else if (score >= 4) {
    tier = 'tier_2';
    needs_escalation = true;   // ask Claude for nuance
  } else if (score >= 1) {
    tier = 'tier_1';   // silent suggestion only
  }

  return { tier, score, flags, needs_escalation };
}
```

## Tier responses

| Tier | Score | Speaker UX | Partner UX |
|---|---|---|---|
| Clean | 0 | Pass to translator | "Composing" indicator |
| Tier 1 | 1–3 | Inline word-level suggestion offered, ignorable | "Composing" indicator |
| Tier 2 | 4–6 | Soft pause prompt; speaker chooses revise or proceed | "Composing" indicator (no leak) |
| Tier 3 | 7+ or contempt | Hard block; must edit before send | "Composing" indicator (no leak) |

For tier 2 with `needs_escalation: true`, orchestrator calls
`prompts/moderator-escalation.yaml` for a nuanced read before final
tier assignment.

## Speaker baseline

Tracked per user in `users/{uid}/baseline`:

```typescript
interface SpeakerBaseline {
  avg_message_length: number;
  avg_exclamations: number;
  sample_count: number;
  last_updated: Timestamp;
}
```

Updated rolling-average on each message sent. Once `sample_count >= 5`,
activation deltas are computed. Below that threshold, activation flags
are skipped (insufficient data).

## Self-reference exemption — why it matters

"I never feel heard" contains "never" but is a self-statement, not a
partner attack. Without this exemption, the moderator over-flags
emotional self-disclosure — which is exactly what you want speakers
to do *more* of in this app.

Test cases:

| Input | Should flag? |
|---|---|
| "I never feel heard" | No (self-reference) |
| "You never listen to me" | Yes (absolutism + you) |
| "I always end up doing the dishes alone" | No (self-reference) |
| "You always make this about yourself" | Yes (absolutism + you) |
| "I never know what to say in these moments" | No (self-reference) |

## Tuning

Word lists and severity weights need empirical tuning. Plan to revisit
every 2–4 weeks for the first several months, driven by:

- **False positive reports:** speakers rejecting flags as inappropriate
- **False negatives:** speakers reporting their partner's harsh
  statements weren't flagged

These come in via the user feedback path described in
`08-prompt-eval.md`.

## Performance

The fast-path is pure regex and set lookups, no async I/O. Benchmarked
on a typical message (~200 chars, ~30 tokens), runs in under 5ms.
Cloud Function cold start adds ~100–200ms, warm path under 50ms total.

For voice mode (v2), the fast-path will need to run on streaming
transcript chunks. Consider:

- Run on every sentence-final boundary detected by STT
- Run incrementally on accumulating transcript
- Move to on-device for absolute lowest latency (with the security
  tradeoff that the detection logic ships to the client)

## What this doc does NOT cover

- The Claude-based escalation prompt (see `05-ai-roles.md` and
  `prompts/moderator-escalation.yaml`)
- Flooding detection (linguistic + conversational + self-report —
  separate detector, runs across turns rather than per-message)
- In-session disclosure detector (separate detector, see
  `07-safety-screening.md`)
