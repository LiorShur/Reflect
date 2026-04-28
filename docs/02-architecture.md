# 02 — Architecture

## High-level shape

```
[Partner A device]              [Partner B device]
  React Native                    React Native
       \                              /
        \                            /
         \                          /
          ---> Firebase RTDB <-----
           (session state, floor,
            drafts, presence)
                   |
                   | RTDB triggers
                   v
            Cloud Functions
            (orchestrator)
            /     |      \
           /      |       \
          v       v        v
   Anthropic   Fast      Telemetry
   API       moderator   + prompt
   (Claude)  classifier  registry
                          (Firestore)
```

## Component responsibilities

### React Native clients
- Render UI per session state
- Write drafts to private RTDB paths
- Subscribe to delivered/mirror/state changes
- Handle local presence (composing indicator)
- Never call AI APIs directly

### Firebase Realtime Database
- Source of truth for live session state
- Server-authoritative floor token
- Security rules enforce partner-boundary reads/writes
- See `03-data-model.md` for full schema

### Cloud Functions (orchestrator)
- Triggered by RTDB writes
- Routes to AI roles based on state
- Calls Anthropic API with appropriate prompts (server-side keys)
- Writes AI outputs back to RTDB
- Manages state transitions
- Archives turns to history
- Emits telemetry to Firestore

### Anthropic API
- Translator (Claude Sonnet) — softens speaker statements
- Moderator escalation (Claude Sonnet) — nuanced harsh-startup judgment
- Wrap-up summary (Claude Sonnet) — generates session summaries
- Quality checker (v2)
- Interpreter (v2)

### Fast moderator classifier
- Lexical pattern matching on draft text
- Runs as a Cloud Function (sub-200ms target for v1)
- See `10-moderator-fastpath.md`
- Escalates ambiguous cases to Anthropic API

### Telemetry + prompt registry (Firestore)
- Versioned prompts (loaded by orchestrator on cold start, cached)
- Trace logs (anonymized, hashed inputs)
- Eval results
- See `08-prompt-eval.md`

## Why this layout

**Orchestrator behind the database, not between client and database.**
Clients write directly to RTDB; orchestrator triggers fire on changes.
This means realtime UX (typing indicators, floor changes, presence) goes
through RTDB pub/sub with no orchestrator latency. Orchestrator failures
don't kill the realtime layer.

**Two-tier moderator.** Lexical pass handles ~80% of harsh-startup flags
in <200ms. Ambiguous cases (score 4–6) escalate to Claude for nuanced
read. This keeps voice path latency manageable in v2 while giving us
Claude's judgment on hard cases.

**Versioned prompts in registry, not hardcoded.** A/B testing of new
prompt versions without code deploys. Trace logs tag every output with
the prompt version that produced it.

## Latency budgets

### Text mode (v1)
- Client write to RTDB: <50ms
- Cloud Function trigger latency: 50–200ms (depending on cold/warm)
- Fast moderator lexical pass: <100ms
- Anthropic API call (translator): 1–3s
- Total: speaker hits "send" → translation review screen in 1.5–3.5s

### Voice mode (v2 target)
- Streaming STT: 200–300ms behind speech
- Fast moderator on transcript: <100ms
- Decision (no flag): 0ms
- Decision (flag, escalation): up to 400ms
- Total intervention latency target: <600ms speaker-stops to AI-feedback

## Security posture

- API keys (Anthropic, STT, TTS) live in Cloud Functions environment
  config, never in client code
- All AI calls authenticated via Firebase Auth (orchestrator verifies the
  user is a participant of the session before processing)
- Per-user rate limits and cost caps in orchestrator
- Security rules are the second line of defense for partner-boundary
  enforcement; client logic is the first
- No raw transcript retention by default; opt-in TTL for debug

## Privacy posture

- Sessions belong to the two participants. No third party (including
  Anthropic) sees identifiers tied to user accounts.
- Anonymized session IDs (salted hashes) in trace logs
- 24-hour TTL on raw inputs in trace logs unless user opts in to longer
  retention
- Aggregate metrics (mirror scores, intervention rates) stored long-term
  but not linked to message content
- User-deletable account; deletion cascades to remove all session data

## Tech stack rationale

| Choice | Why |
|---|---|
| React Native | Cross-platform iOS/Android with one codebase. Strong Firebase ecosystem. |
| Firebase RTDB | Sub-100ms realtime sync; simpler security rules than Firestore for this use case. |
| Firebase Auth | First-party with RTDB; handles email/Google/Apple sign-in. |
| Cloud Functions (Node.js, TS) | Serverless, scales to zero, integrates with Firebase. |
| TypeScript | Type safety for state transitions and security-sensitive code. |
| Anthropic Claude | High-quality nuanced text generation, tool-friendly API, strong for the translator role. |
| GitHub | Source, CI, issues, milestones in one place. |

## Scaling considerations (later)

For v1, none of these matter. Listed here so they don't get
re-discovered as crises later:

- RTDB has connection limits; if you need >100k concurrent users, will
  need to shard or migrate to Firestore
- Cloud Functions cold starts can be mitigated with min-instances
  config
- Anthropic API costs scale with usage; per-user cost caps prevent
  abuse
- Long-term archival of session history should move to cheaper storage
  (BigQuery, GCS) after a retention period
