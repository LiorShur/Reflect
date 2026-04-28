# 09 — Friendship layer rituals

## Why these matter

Couples who only do conflict work plateau. Couples who tend the
friendship-and-fondness layer underneath have conflict work that
actually sticks. The rituals in this doc are not nice-to-haves —
they're the soil the conflict mode grows in.

The economics matter too: couples don't have hard conversations every
week, but they do (ideally) connect every day. The friendship layer is
what generates retention, not the conflict mode.

## v1: Daily appreciation only

Ship one ritual in v1: **daily appreciation.** It's the simplest to
build, has the largest standalone clinical value, and gives users a
reason to come back to the app between conflict sessions.

### Flow

1. Push notification at user's chosen time (default 7–9pm)
2. Single screen, single prompt: *"What did [partner] do today that
   you appreciated?"*
3. Single text input
4. Optional category chips: helped with X, made me laugh, showed up
   for Y, was patient with Z
5. (v2) Optional 10–30s voice memo
6. Send button
7. Confirmation: "they'll see this when they next open the app"

### Three constraints, enforced in UI

**Specificity.** Soft inline prompt if input is generic ("you're
amazing"): "what specifically today?" Not blocking, just nudging.
Generic appreciation has near-zero relationship effect; specific
appreciation has measurable effect.

**Recency.** Today only. UI is anchored to "today" and input is
soft-validated for present-tense / today-referent language.

**Cadence.** Daily, not weekly. Gottman's 5:1 ratio research is a
*daily* ratio.

### History view

The durable artifact. A scrollable stack of appreciations *received*,
last 90 days. This is the feature that retains: read your partner's
last 30 days of noticing you.

### Edge cases

- **Missed days:** soft prompt ("anything from this week?"), never a
  guilt-trip
- **Asymmetric usage:** never surfaced comparatively to the consistent
  partner; nudge the inconsistent partner directly without comparison
- **Recent conflict use (within 4 hours):** suppress today's prompt.
  Forced appreciation right after a fight is poisoned and feels false.
- **Empty days:** "didn't have one today" is a valid answer. No
  fishing.

### Data shape

```
appreciation_feed/{recipient_uid}/{entryId}/
  from_uid: <uid>
  content: string
  tags: [string]
  voice_url?: string          # v2
  created_at: timestamp
  reaction?: 'heart' | 'thanks' | 'more' | null
```

### Anti-patterns to resist

- **Streaks.** Tempting, but turns the relationship into a chore.
  Once a streak breaks, users abandon. The right loop is curiosity and
  reward of being noticed, not gamified pressure.
- **Reminders that escalate.** One push notification per day, polite
  copy. No "you haven't appreciated [partner] in 3 days!" — that's
  pressure dressed as encouragement.
- **Comparing partners.** Never display "you appreciated 5 times this
  week, your partner appreciated 2 times" — competitive metrics
  poison the ritual.
- **Public sharing.** This is private to the couple. No social feed,
  no shareable cards, no community.

## v2: Love maps

Question deck about each other's inner world.

### Categories
- **Current life:** work, friends, stressors, sleep
- **Inner world:** fears, dreams, values, what they're processing
- **Tastes:** food, music, films, places
- **Shared history:** memories, stories, milestones

### Mechanics
- 3–5 questions/week
- Both partners answer separately in the app
- On a chosen reveal day: side-by-side answers appear with reaction
  options ("I had no idea," "I knew that," "tell me more")

### Depth gradient (relationship-age aware)

| Phase | Depth |
|---|---|
| Week 1–4 | Light: "their go-to comfort food" |
| Month 2–6 | Medium: "their biggest current stressor" |
| Month 6+ | Deeper: "a fear they're sitting with" |
| Year+ unlocked | Vulnerable: "a regret," "a way they've changed" |

### Sensitive categories (opt-in only)
Sex, past relationships, family of origin, religion, politics. Never
default-on. Couple should be 100+ days in before any of these surface.

### Anti-patterns
- Don't gamify with streaks or scores
- Don't weight points or rank "knowledge level"
- Don't enforce reveal days — couples should choose

## v2: Stress-reducing conversation

A 20-minute structured ritual where one partner vents about external
stressors (work, family, traffic — explicitly NOT the relationship)
while the other listens supportively without problem-solving. Then
switch.

Reuses the speaker-listener machinery from conflict mode, with the
rules inverted:

- Moderator's job: prevent relationship topics from intruding ("this
  sounds like an us-thing — want to save it for the relationship
  mode?")
- Moderator also prevents problem-solving from listener (catches "have
  you tried..." and offers to convert it to a question)
- 10 minutes per partner, switch, end
- No quality checker (lighter touch)
- No translator (the speaker is venting about externals, no need for
  softening)

### Why this works clinically
Gottman's research: this single ritual differentiates couples who stay
close from couples who drift apart over years. The supportive
listening reaffirms partnership without requiring conflict resolution.

## v2: Weekly state-of-the-union

A 30-minute scheduled ritual with four sections:

1. **This week's wins** (each partner shares 1–2)
2. **One small adjustment** to suggest, framed positively (each)
3. **What's coming up next week**
4. **One appreciation each**

App is timekeeper and structure-keeper. Critical role: this is the
**bridge surface** where unresolved conflict-mode topics resurface —
"you flagged the in-laws topic three weeks ago and didn't finish it;
want to schedule a session?"

## v2: Bid recognition

Hardest to instrument honestly. Real bid recognition happens in the
wild, not in an app. App's role is education + consciousness-raising.

### Components
- Short training module: what bids look like (a comment, a touch, a
  "look at this" moment)
- One-week practice: consciously notice bids
- Self-report each evening: how many bids did you notice today? How
  many did you turn toward?
- No surveillance, no automatic detection

### Why this matters
Gottman's research: happy couples turn toward 86% of bids; couples who
divorce turn toward 33%. Awareness alone has measurable effect.

## v3+: Possible future rituals

Listed for context, not prioritized:

- **Repair attempts inventory:** identifying signals to use in conflict
  ("I need a break," "I love you," "let's start over")
- **The Magic Five Hours:** Gottman's specific 5-hour-per-week framework
  of small daily actions
- **Conflict log review:** quarterly review of recurring perpetual
  topics
- **Anniversary rituals:** scheduled deep conversations on milestones

## Ordering rationale

Why ship daily appreciation first and not, say, love maps?

- Lowest engineering complexity (one screen, one data path)
- Asynchronous (no scheduling friction)
- Standalone clinical value (doesn't require both partners to engage
  to provide value to one)
- Gives the orchestrator a non-conflict reason to send push
  notifications, building user habit before joint sessions
- The history view is a high-retention durable artifact

Love maps and stress-reducing conversation are higher complexity and
benefit from learning that the simpler ritual works first.

## Onboarding flow

The conflict mode is NOT the front door of the app. The arc:

1. Screening (per partner, separate)
2. Pairing (link with partner)
3. Onboarding to daily appreciation (start here)
4. After 1–2 weeks of appreciation use: introduce conflict mode
5. (v2) After more time: love maps, stress-reducing conversation
   unlock

This sequence builds trust in the AI's voice through low-stakes
interactions before the user has a hard conversation with it.
