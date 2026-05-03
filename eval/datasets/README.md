# Eval datasets

Curated test cases for the v1 prompts. The runner in
`eval/scripts/run-eval.ts` loads these JSON files, runs each case
through the corresponding prompt, and produces a pass/fail report.

## Schemas

### Translator (`translator.json`)

Each case:

```json
{
  "id": "T-001",
  "input": {
    "RAW_STATEMENT": "...",
    "TOPIC": "...",
    "FEELING_OR_NULL": "null"
  },
  "expect": {
    "already_soft": false,
    "cannot_soften": false,
    "must_contain": ["I felt"],
    "must_not_contain": ["you always", "you never"]
  },
  "notes": "Why this case matters."
}
```

`must_contain` / `must_not_contain` are case-insensitive substring
checks against the `softened` field. Use them to assert hard rules
(e.g., I-statements present, second-person attacks absent).

### Moderator fast-path (`moderator-fastpath.json`)

Each case:

```json
{
  "id": "M-001",
  "input": "Your text here.",
  "expect": {
    "tier": "tier_3",
    "must_have_flag_types": ["name_calling"]
  },
  "notes": "..."
}
```

Runs through `scoreFastPath` directly (no Claude). The runner walks
this dataset synchronously since it's pure code.

### Moderator escalation (`moderator-escalation.json`)

Each case:

```json
{
  "id": "ME-001",
  "input": {
    "RAW_MESSAGE": "...",
    "FLAGS": "[\"absolutism\"]",
    "TURN_COUNT": "0"
  },
  "expect": {
    "tier": 2,
    "suggestion_must_be_present": true
  }
}
```

### Wrap-up summarizer (`wrap-up.json`)

Each case:

```json
{
  "id": "W-001",
  "input": {
    "TOPIC": "...",
    "TURN_HISTORY": "Turn 1 (Partner A speaking):\n  Partner A said: ...\n  Partner B reflected: ...",
    "PARTNER_A_NAME": "Partner A",
    "PARTNER_B_NAME": "Partner B"
  },
  "expect": {
    "partner_a_summary_must_contain": ["..."],
    "must_not_suggest_solutions": true
  }
}
```

## Targets (per docs/v1-scope § E4)

- Translator: 50 cases (currently seeded with 8)
- Moderator fast-path: 100 cases (currently seeded with ~15)
- Wrap-up summarizer: 30 cases (currently seeded with 3)

The seed cases cover the major scenarios; the team should expand
each set toward the targets before closed beta. Each batch should
be reviewed by the clinical advisor.
