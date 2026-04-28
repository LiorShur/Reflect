# First Claude Code session — scaffolding the project

This is a script for the first Claude Code session in the empty repo.
Hand this to Claude Code and walk through it step by step.

## Goal

Bootstrap the project to the point where:

- Monorepo workspaces are set up (`mobile`, `functions`, `eval`)
- Firebase project is configured (live + emulator)
- A skeleton React Native app launches and shows a placeholder home
  screen
- Cloud Functions emulator runs and a stub orchestrator function
  responds to RTDB writes
- Security rules from `firebase/database.rules.json` are deployed and
  pass a basic unit test
- CI pipeline runs typecheck, lint, and test on every PR

This is roughly milestone 1 from `docs/v1-scope.md`.

## Step 1 — Read the project context

Before writing any code, ask Claude Code to:

1. Read `CLAUDE.md`
2. Read `docs/01-overview.md` and `docs/02-architecture.md`
3. Read `docs/v1-scope.md` (especially Milestone 1)

## Step 2 — Set up the workspace structure

Have Claude Code:

1. Initialize git: `git init`
2. Run `npm install` at the root (uses the existing `package.json`)
3. Create the `mobile/`, `functions/`, and `eval/` workspaces as empty
   workspaces with their own `package.json` files

## Step 3 — Initialize the React Native app

In `mobile/`:

1. Use Expo SDK (latest stable) for faster initial setup. Can eject
   later if native modules require it.
2. TypeScript strict mode
3. Install React Navigation
4. Set up Firebase SDK (`@react-native-firebase/app`,
   `@react-native-firebase/auth`, `@react-native-firebase/database`)
5. Create a placeholder `App.tsx` with a single screen that shows
   "Reflect" and the user's auth state

## Step 4 — Initialize Cloud Functions

In `functions/`:

1. `firebase init functions` — TypeScript, ESLint
2. Set up the orchestrator file structure:
   ```
   functions/src/
     index.ts                  # exports
     orchestrator/
       state-machine.ts        # state transition logic
       triggers.ts             # RTDB onWrite triggers
     moderator/
       fast-path.ts            # imports from patterns.ts and score.ts
       patterns.ts             # the regex/word lists from docs/10
       score.ts                # the scoreFastPath function
       escalation.ts           # Claude-based escalation
     translator/
       translate.ts
     summarizer/
       wrap-up.ts
     prompts/
       registry.ts             # loads /prompts/*.yaml at cold start
     anthropic/
       client.ts               # wraps Anthropic SDK
     telemetry/
       trace.ts
   ```
3. Implement the moderator fast-path (`patterns.ts` and `score.ts`)
   from `docs/10-moderator-fastpath.md`
4. Add unit tests for the fast-path scoring (test cases from the doc)
5. Stub out the other modules to throw `not implemented` errors

## Step 5 — Deploy security rules

1. Copy `firebase/database.rules.json` to the Firebase project
2. Set up the Firebase emulator: `firebase init emulators` (database,
   auth, functions)
3. Write rules unit tests using `@firebase/rules-unit-testing` —
   especially:
   - Speaker can read own speaker_draft, listener cannot
   - Listener can read own listener_draft, speaker cannot
   - Neither partner can write to `delivered` directly
   - Neither partner can write to `meta`
   - Translation `approved` field writable only by speaker
4. Run rules tests in CI

## Step 6 — Set up CI

GitHub Actions workflow at `.github/workflows/ci.yml`:

```yaml
name: CI
on: [push, pull_request]
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
      - run: npm ci
      - run: npm run typecheck
      - run: npm run lint
      - run: npm test
      - run: npm run rules:test
```

## Step 7 — Verify the skeleton works

Manual checks:

1. `npm run typecheck` passes
2. `npm run lint` passes
3. `npm test` passes (including moderator fast-path tests)
4. Mobile app launches in Expo Go and shows the placeholder screen
5. Firebase emulator runs locally
6. Rules tests pass against the emulator

## Step 8 — Commit and push

1. Create a private GitHub repo (or use an existing one)
2. Push initial commit: `chore: initial project scaffold`
3. Set up branch protection on `main`
4. First PR is the scaffold itself, for review

## What NOT to do in the first session

- Do NOT implement actual conflict mode screens yet. That's Milestone
  3 work.
- Do NOT implement actual Anthropic API calls yet. Stub the client.
- Do NOT implement the screening flow yet. That's Milestone 2.
- Do NOT push without a passing CI run.
- Do NOT commit any secrets. Use `.env.example` as the template; real
  `.env.local` files are gitignored.

## Subsequent session prompts

After scaffold is in place, future sessions can be triggered with
prompts like:

- "Implement Milestone 2: pairing and screening flow. Read
  `docs/07-safety-screening.md` first."
- "Implement the translator review screen (C5). Read `docs/04-screens.md`
  for the spec."
- "Add eval harness for the translator. Read `docs/08-prompt-eval.md`."

Each session should start with reading the relevant doc(s), pulling
the latest from main, and creating a feature branch.

## When to ask the human for input

- Choosing libraries that aren't specified in the docs (e.g., state
  management, form library)
- UI design decisions where the spec is ambiguous
- Anything touching the safety screening logic
- Anything that would commit to a paid service
- Anything that changes the documented architecture

When in doubt, ask. The clinical and safety stakes are real.
