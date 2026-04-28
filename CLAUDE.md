# CLAUDE.md

This file gives Claude Code persistent context about the Reflect project.
Read this first in any new session.

> **Working name:** "Reflect" is a placeholder. Find-and-replace once final
> name is chosen.

## Project mission

Reflect is a mobile app that helps couples have better conversations using
Gottman's speaker-listener technique with AI moderation. Two partners on
two devices participate in synchronous, structured conversations. The AI's
job is to:

- **Moderate** — enforce turn-taking, catch harsh startup, detect flooding
- **Translate** — offer softened versions of statements (with speaker
  approval before partner sees)
- **Check** (v2) — score whether mirrors actually captured what was said
- **Interpret** (v2) — surface the underlying feeling beneath the words

The core hypothesis to validate in v1: *AI moderation actually makes
couples' conflict conversations better.* Until that is validated, nothing
downstream matters.

## Status

**Pre-v1.** We are building the MVP. See `docs/v1-scope.md` for the
canonical scope of what ships in v1.

## Tech stack

- **Mobile:** React Native (cross-platform iOS/Android)
- **Realtime sync:** Firebase Realtime Database (RTDB)
- **Auth:** Firebase Auth
- **Backend orchestration:** Firebase Cloud Functions (Node.js, TypeScript)
- **LLM:** Anthropic API (Claude)
- **Speech (v2 only, NOT v1):** TBD streaming STT + TTS
- **Source:** GitHub
- **CI/CD:** GitHub Actions

We chose RTDB over Firestore for lower latency on conversational state
changes. Firestore is acceptable for archival data (history, telemetry).

## Repo layout

```
/CLAUDE.md             - This file
/README.md             - Public README
/.claudeignore         - Files to keep out of Claude Code context
/docs/                 - Design specs (READ THESE for any feature work)
/prompts/              - Versioned LLM prompt definitions (YAML)
/firebase/             - Firebase config and security rules
/functions/            - Cloud Functions (orchestrator, AI calls)
/mobile/               - React Native app
/eval/                 - Prompt evaluation harness
```

## Critical conventions

### Code style
- TypeScript strict mode for all new code
- Functional React components with hooks (no class components)
- ESLint + Prettier (configs to be added in initial scaffold)
- File naming: kebab-case for files, PascalCase for components

### Commits
- Conventional Commits: `feat:`, `fix:`, `docs:`, `chore:`, `refactor:`, `test:`
- One logical change per commit
- Reference issue numbers: `feat(translator): handle already-soft case (#42)`

### Branches and PRs
- `main` is protected; all changes via PR
- Branch naming: `feat/short-name`, `fix/short-name`
- PR template includes: scope, test plan, screenshots/recordings for UI

### Testing
- Unit tests for all orchestrator logic (especially: moderator fast-path
  scoring, state machine transitions, security rule simulation)
- Integration tests for state transitions
- Manual QA scripts for screen flows (in `/eval`)

## Safety rails — things that must never happen

These are non-negotiable. If a request would violate any of these, **stop
and ask before proceeding.**

1. **Never expose API keys client-side.** All Anthropic, STT, TTS calls go
   through Cloud Functions, with the device authenticated via Firebase
   Auth.

2. **Never log raw conversation content by default.** Trace logs use
   hashed input keys. Raw retention is opt-in per session with TTL.
   See `docs/08-prompt-eval.md`.

3. **Never read across the partner boundary.** Security rules enforce:
   - Speaker drafts are private to the speaker
   - Listener drafts are private to the listener
   - Check-in scores are private to that partner
   - Only orchestrator-mediated content (`current_turn/delivered`,
     `current_turn/mirror`) crosses the partner boundary, and only after
     explicit approval.

4. **Never bypass the safety screening flow.** New users must complete the
   screening before joint mode unlocks. Logic lives in
   `docs/07-safety-screening.md`.

5. **Never auto-deliver translated text without speaker approval.** The
   speaker reviews and approves every translation. The "use original"
   override must always be available with equal visual weight to the
   "use softened" option.

6. **Never apply conflict-mode prompts to friendship-mode contexts or
   vice versa.** Stress-reducing conversation has different rules (no
   problem-solving, external stressors only). The orchestrator must route
   by session mode.

7. **Never share content from the moderator/translator's reasoning with
   the partner.** The translator's `changes_made` field is shown to the
   speaker only, never the partner. Same for any moderator coaching.

## AI roles overview

In v1: **Moderator** (always on) + **Translator** (always on, with
approval). Interpreter and Quality Checker deferred to v2.

See `docs/05-ai-roles.md` for full prompt templates and `prompts/` for
the versioned YAML definitions.

## Working agreement with Claude Code

- **Read `docs/v1-scope.md` before any feature work.** It defines what's
  in scope and what isn't.

- **Confirm before creating new top-level files or directories.** The
  repo structure is intentional.

- **For any change touching prompts, AI behavior, or safety logic:** open
  a PR for human review rather than committing directly to main.

- **For UI changes:** produce a screenshot or short recording in the PR.
  UI decisions are subtle and the design specs are not exhaustive.

- **When in doubt, ask.** The clinical stakes are real; over-confident
  shipping is more dangerous here than in a typical app.

- **If a feature spec seems wrong or incomplete:** flag it. The specs
  were written by humans before code, and may have gaps the
  implementation surfaces.

## Pointers to detailed specs

| Topic | File |
|---|---|
| Project overview | `docs/01-overview.md` |
| Architecture | `docs/02-architecture.md` |
| Data model + security rules | `docs/03-data-model.md` |
| Screens | `docs/04-screens.md` |
| AI roles + prompts | `docs/05-ai-roles.md` |
| State machine | `docs/06-state-machine.md` |
| Safety screening | `docs/07-safety-screening.md` |
| Prompt eval | `docs/08-prompt-eval.md` |
| Friendship rituals | `docs/09-friendship-rituals.md` |
| Moderator fast-path | `docs/10-moderator-fastpath.md` |
| **v1 scope (canonical)** | `docs/v1-scope.md` |

## How to start a new Claude Code session

1. `cd` into the repo root (so this CLAUDE.md is loaded)
2. Open a new session: `claude` or via the IDE plugin
3. Ask Claude Code to read `docs/v1-scope.md` and pick up the next open
   task from the issue tracker
4. If working on an unfamiliar area, ask Claude Code to read the
   relevant `docs/` file(s) first
