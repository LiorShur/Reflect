# v1 scope

The canonical list of what ships in v1. Anything not on this list is
explicitly out of scope for v1. Use this as the source of truth when
prioritizing work and reviewing PRs.

## v1 hypothesis

**AI moderation actually makes couples' conflict conversations
better.** Until this is validated, nothing downstream matters.

## v1 deliverables

### Foundation

- [ ] **F1.** React Native scaffold (iOS + Android, TypeScript strict)
- [ ] **F2.** Firebase project setup (Auth + RTDB + Cloud Functions)
- [ ] **F3.** Cloud Functions orchestrator skeleton (TypeScript)
- [ ] **F4.** GitHub Actions CI: typecheck, lint, unit tests, deploy
      to staging
- [ ] **F5.** Anthropic API integration with prompt registry loading

### Auth and onboarding

- [ ] **A1.** Email + Google + Apple sign-in via Firebase Auth
- [ ] **A2.** User profile creation + edit
- [ ] **A3.** Partner pairing flow (one partner generates code, other
      enters it)
- [ ] **A4.** Quick-exit button on every screen, accessible from
      settings

### Safety screening

- [ ] **S1.** Per-user screening flow (separate device, before pairing
      complete)
- [ ] **S2.** 11-question battery (see `07-safety-screening.md`)
- [ ] **S3.** Tier computation (low / moderate / high)
- [ ] **S4.** Tier-based feature gating
- [ ] **S5.** Resources by region (US, UK, AU, CA, IL minimum)
- [ ] **S6.** Re-screening after 4 weeks for moderate tier
- [ ] **S7.** In-session disclosure detector (LLM-based on speaker
      drafts)

### Session lifecycle (conflict mode)

- [ ] **C1.** Session creation (one partner initiates)
- [ ] **C2.** Pre-session check-in screen (per partner, separate)
- [ ] **C3.** Topic intake + agreement
- [ ] **C4.** Speaker compose screen
- [ ] **C5.** Translator review screen with three actions (send
      softened / edit / send original)
- [ ] **C6.** Listener mirroring screen with content + feeling fields
- [ ] **C7.** Speaker confirmation screen with four options
- [ ] **C8.** Floor swap state with brief AI summary
- [ ] **C9.** Wrap-up screen with two summaries and three next-action
      options
- [ ] **C10.** Pause / 20-min cooldown screen
- [ ] **C11.** Manual floor passing only (auto-detection deferred)

### AI roles

- [ ] **AI1.** Moderator fast-path Cloud Function (lexical + scoring)
      — see `10-moderator-fastpath.md`
- [ ] **AI2.** Moderator escalation prompt (Claude) for tier 2
      ambiguous cases
- [ ] **AI3.** Translator prompt (Claude) with speaker review flow
- [ ] **AI4.** Wrap-up summarizer prompt (Claude)
- [ ] **AI5.** Speaker baseline tracking for activation deltas
- [ ] **AI6.** Per-user cost cap ($5/day)

### Friendship layer

- [ ] **R1.** Daily appreciation flow (single screen, send to feed)
- [ ] **R2.** Appreciation feed view (90-day history, scrollable)
- [ ] **R3.** Push notification at user-chosen time
- [ ] **R4.** Specificity nudge for generic appreciations
- [ ] **R5.** Recent-conflict suppression (no appreciation prompt
      within 4 hours of conflict mode)

### Data model and security

- [ ] **D1.** RTDB schema as specified in `03-data-model.md`
- [ ] **D2.** Security rules deployed and tested
- [ ] **D3.** Security rules unit tests (using
      `@firebase/rules-unit-testing`)
- [ ] **D4.** State machine enforcement in orchestrator

### Eval and observability

- [ ] **E1.** Prompt registry loading from `/prompts/*.yaml`
- [ ] **E2.** Trace logging (anonymized inputs by default)
- [ ] **E3.** User feedback capture on translator rejections
- [ ] **E4.** Eval datasets (translator: 50 cases, moderator: 100
      cases, wrap-up: 30 cases)
- [ ] **E5.** Eval CLI runner
- [ ] **E6.** Cost monitoring dashboard

## v1 acceptance criteria

The MVP is shippable when all of the following are true:

1. Two partners can pair and complete the screening flow on separate
   devices.
2. They can complete a full conflict-mode session end-to-end (check-in
   → topic → IN_TURN with 2+ turns → wrap-up).
3. The moderator fast-path catches all tier 3 contempt patterns in
   the test set with zero false positives on the clean test cases.
4. The translator produces softened versions that pass eval qualities
   on 80%+ of the curated test set.
5. Daily appreciation works: send, partner sees in feed, history view
   shows last 30 days.
6. Security rules pass the unit test suite (no cross-partner reads
   possible).
7. Pause/cooldown enforces the 20-min timer; resume requires fresh
   check-in.
8. All quick-exit buttons work and clear recent activity.
9. App passes basic accessibility audit (screen reader navigable,
   Dynamic Type supported).
10. Privacy: no raw input retention without opt-in, 24-hour TTL on
    default trace records.

## Suggested implementation order

Roughly milestone-shaped. Each milestone should produce something
demonstrable.

### Milestone 1: Foundation (week 1–2)
- F1, F2, F3, F4, F5
- A1, A2
- D1 (schema only, no rules yet)
- Skeleton React Native app with auth and a placeholder home screen

### Milestone 2: Pairing and screening (week 2–3)
- A3, A4
- S1, S2, S3, S4, S5
- D2, D3 (security rules with tests)

### Milestone 3: Conflict mode core loop (week 3–6)
- C1, C2, C3, C4
- AI1, AI3 (moderator fast-path + translator)
- C5 (translator review screen — the highest-novelty UX)
- C6, C7
- D4 (state machine enforcement)
- AI2 (moderator escalation)

### Milestone 4: Full session lifecycle (week 6–8)
- C8, C9, C10, C11
- AI4, AI5
- E1, E2

### Milestone 5: Friendship layer (week 8–9)
- R1, R2, R3, R4, R5
- S6, S7

### Milestone 6: Eval, polish, beta (week 9–12)
- E3, E4, E5, E6
- AI6
- Bug bash, accessibility audit, security review
- Closed beta with friendly users

## Definition of done (per task)

A task is done when:
- Code is written and reviewed
- Unit tests pass (where applicable)
- Manual QA pass on iOS and Android
- For UI: screenshot or recording in PR
- For AI behavior: at least 5 manual test inputs run through
- For security-sensitive code: rules tests + manual penetration
  attempt
- Documentation updated if behavior diverges from spec

## Out of scope for v1 (deferred to v2 or later)

- Voice mode (anywhere)
- Auto floor-passing
- Quality checker AI
- Interpreter AI
- Love maps
- Stress-reducing conversation mode
- Weekly state-of-the-union
- Bid recognition training
- Biometric flooding detection (HealthKit / Google Fit)
- Therapist dashboards
- Multi-language support
- Async / messaging mode
- Disguised app icon
- Voice memos in appreciation
- Animation polish beyond basic transitions
- Public sharing or community features

## Risks and unknowns

- **DV specialist review.** Required before public launch (not before
  closed beta). May force changes to screening logic and resource
  routing.
- **Moderator tuning.** Word lists are starting points. Real user data
  will surface false positives and negatives that need iteration.
- **Translator quality.** May need 2–3 prompt iterations before
  acceptance rate is acceptable. Plan for this in the timeline.
- **Two-device sync edge cases.** Reconnection, presence, and floor
  token races have a long tail of edge cases. Allocate buffer.
- **Anthropic API cost variance.** Per-session cost may exceed
  estimates if users have very long conversations. The $5/day cap
  prevents catastrophe but UX during cap-hit needs design.

## Open questions to resolve during build

- Final project name (working name "Reflect")
- App icon and brand identity
- Pricing model (free / freemium / paid)
- Closed beta recruitment strategy
- App store positioning copy
- Privacy policy and terms of service
