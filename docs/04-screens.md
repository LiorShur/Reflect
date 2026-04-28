# 04 — Screens

This doc spec'es the screens needed for v1, plus a few v2 screens for
context. Each spec is structured: purpose → layout → behavior →
edge cases.

## v1 screens

### Onboarding screening

**Purpose:** Per-user safety screening before joint mode unlocks. See
`07-safety-screening.md` for the question battery and tier logic.

**Layout:** Multi-step form, one question per screen. Plain language.
A discreet "leave now" button on every screen. Progress indicator at top.

**Behavior:**
- One partner can complete screening even if the other hasn't
- Answers stored in `users/{uid}/screening` (private to user)
- On completion, tier is computed and stored
- Joint conflict mode only unlocks if both partners are tier "low"
- Joint friendship-layer features (appreciation) unlock for tier "low"
  and "moderate"
- Tier "high" routes to resources, no joint mode at all

**Edge cases:**
- User abandons mid-screening → resume on next launch from same point
- User wants to retake → settings option, but flagged for review
- Quick-exit on any screen → app closes, recent activity cleared from
  task switcher

---

### Session start: pairing and topic intake

**Purpose:** Speaker raises a topic; partner agrees this is the topic.

**Layout (raiser):** Single screen with a text input. Prompt: *"What
would you like to talk about? One sentence is best."* Soft examples
shown below.

**Layout (responder):** A card showing "Your partner wants to talk
about: '[topic]'". Two buttons: *Yes, I'm in* / *Suggest a different
framing*.

**Behavior:**
- Topic is reframed by the moderator if it's already a personal attack
  ("he never helps" → suggested: "how we share housework")
- Both partners must agree on the topic before pre-session check-in
- Either partner can decline the session entirely (returns to home)

---

### Pre-session check-in

**Purpose:** Each partner self-rates emotional state before the session
begins. Calibration, not paperwork.

**Layout:**
- Top: short why-line ("before we start — quick check on where you
  are.")
- Slider, 1–10, anchored at 1, 5, 9 with words: *calm*, *activated*,
  *overwhelmed*. Don't put words at 1, 5, 10 — users avoid extreme
  endpoints.
- Optional one-line context field: "anything you want to flag about
  your headspace right now?"
- Begin button, conditionally styled:
  - Score 1–5: green, "begin"
  - Score 6–7: amber, "begin (you might want to wait)"
  - Score 8+: muted, primary action becomes "wait 20 min"; small
    "begin anyway" link below

**Behavior:**
- Each partner does this independently, on their own device
- Score and context are written to `sessions/{sid}/checkins/{uid}`
  (private to that uid)
- Partner sees only the derived state: "ready" / "thinking" / "suggests
  starting later"
- If a partner suggests waiting, the other can accept (session paused
  20 min) or send a soft "ask to start anyway" notification

**Edge cases:**
- One partner takes >5 minutes — soft "your partner is still checking
  in" indicator
- Both partners select 8+ — session auto-pauses 20 min before any IN_TURN
  state can be reached

---

### Speaker compose + translator review

**Purpose:** The novel-UX heart of the app. Speaker drafts a statement,
AI offers a softened version, speaker reviews and approves.

**Two-stage layout:**

*Stage 1 — Compose:*
- Topic visible at top (small, muted)
- Single text input area
- Send button (disabled until non-empty)

*Stage 2 — Review:*
- Original message in muted styling, smaller, sunken background, labeled
  "you wrote"
- Softened version as visual hero: prominent placement, info-tinted
  background, larger
- *changes_made* explainer in italic between them
- Three buttons:
  - "Send softened version" (primary, full-width)
  - "Edit" (drops softened version into editable field)
  - "Send original" (override, equal visual weight to "edit")

**Behavior:**
- Stage 1 → "Send" writes to `current_turn/speaker_draft.committed = true`
- Orchestrator runs moderator fast-path
  - Tier 3: hard block, return to compose with coaching
  - Tier 2: soft suggest, can override
  - Tier 0–1: pass to translator
- Translator returns softened version, stored in
  `current_turn/translation`
- Stage 2 renders from this data
- User clicks "Send softened" → writes
  `current_turn/translation.approved = true`
- Orchestrator copies to `current_turn/delivered` (now visible to
  partner)

**Edge cases:**
- Translation marked `already_soft: true` → skip stage 2, deliver
  directly with a small "your message looked good as-is" toast
- Translation marked `cannot_soften: true` → show explanation,
  speaker decides to send original or edit
- Network drop mid-translation → on reconnect, show same translation
  (don't regenerate)

See the mockup in the design discussion for visual reference.

---

### Listener mirroring

**Purpose:** Listener reflects back what they heard.

**Layout:**
- Top header: "Reflect back what you heard" / "your turn after"
- Partner's delivered statement as visual hero — large, info-tinted
  background. Re-read affordance.
- Two text inputs:
  - "what you heard them say" (content)
  - "what they were feeling" (feeling)
- Single "Reflect back" button
- Footer reminder: "Just paraphrase for now — your response comes after
  they feel heard."

**Behavior:**
- Listener writes to `current_turn/listener_draft` as they type
  (private to listener)
- On submit, content + feeling are concatenated into the mirror text and
  written to `current_turn/mirror`
- (v2) Quality checker scores; if low, soft coaching banner with "try
  again" or "send anyway"
- (v1) No quality check; mirror goes straight to speaker

**Critical rule:** The listener must NOT see "your turn coming up" UI.
The screen is single-purpose: reflect. Their turn happens after the
floor swap.

**Edge cases:**
- Listener types something that's clearly a response, not a mirror —
  v2 quality checker catches this. v1: just trust the listener.
- Voice mode (v2): replay button replays the audio of the partner's
  statement

See the mockup in the design discussion for visual reference.

---

### Speaker confirmation

**Purpose:** Speaker indicates whether they felt heard.

**Layout:**
- The mirror text in a quoted block at top
- Question: "Did you feel heard?"
- Four options:
  - *Yes* (primary)
  - *Mostly* (with optional add-on field)
  - *Not quite — let me say more* (continues turn, speaker keeps floor)
  - *Not quite — could you try again?* (returns to listener)

**Behavior:**
- Yes → archive turn, transition to FLOOR_SWAP
- Mostly → archive turn, transition to FLOOR_SWAP
- Let me say more → return to speaker compose, same topic continues
- Try again → return to listener mirroring, with optional speaker hint

**Edge cases:**
- Speaker repeatedly chooses "try again" (>3 retries on same statement)
  — moderator suggests a brief pause or that the speaker rephrase the
  original statement

---

### Pause / cooldown

**Purpose:** Enforced 20-minute physiological self-soothing break when
flooding is detected.

**Layout:**
- Calm visual treatment (no urgency)
- Title: "Let's take a breather"
- 20-minute countdown timer
- Brief text: why the break helps (sympathetic nervous system needs
  ~20 min to clear)
- Self-soothing options: breathing exercise, ambient audio, walk
  suggestion
- "Skip the wait" button at the bottom in muted text (override, but
  with a confirmation: "the research shows 20 min helps; sure?")

**Behavior:**
- Triggered by orchestrator when either partner crosses flooding
  threshold
- `meta/state: "PAUSED"`, `meta/paused_until` set to now + 20 min
- Both partners see this screen
- After timer, both partners re-confirm flooding score before resuming
- Resume returns to whichever state preceded the pause

---

### Wrap-up

**Purpose:** Session close. Understanding without forcing resolution.

**Layout:**
- Title: "Here's what I heard you both say"
- Two summary cards, one per partner, ~3 lines each
- Each card has buttons: "this captures it" / "let me adjust"
- Below summaries, three options:
  - *"This was about understanding — leave it here for now."* (default)
  - *"Schedule a problem-solving session for [topic]."*
  - *"Add this to our recurring topics."*
- Optional appreciation prompt: "one thing you appreciated about how
  [partner] showed up in this conversation" (single text field, optional)
- Final "End session" button

**Behavior:**
- Orchestrator generates summaries from session history at WRAP_UP
- Adjustments trigger re-summarization
- Appreciation, if provided, posts to partner's appreciation feed
- Session ends, both partners return to home

**Critical rule:** No "now resolve this" prompt. Understanding and
solving are separate sessions. The wrap-up explicitly offers to defer
solving to another time.

---

### Daily appreciation

**Purpose:** Single-screen ritual for the friendship layer.

**Layout:**
- Single prompt: "What did [partner] do today that you appreciated?"
- Single text field
- Optional category chips (helped with X, made me laugh, was patient
  with Y)
- (v2) Optional 10–30s voice memo
- Send button

**Behavior:**
- Soft inline nudge if input is generic ("what specifically today?")
- On send, writes to `appreciation_feed/{partner_uid}/{entryId}`
- Partner sees the entry as a card in their feed when they next open
  the app
- History tab shows scrollable stack of received appreciations (last
  90 days)

**Edge cases:**
- Recent conflict mode use within last 4 hours → suppress today's
  prompt (forced appreciation right after a fight feels false)
- Asymmetric usage → never surfaced comparatively to the consistent
  partner. Just nudge the inconsistent partner directly.
- Empty days → "didn't have one today" is a valid answer, no fishing

---

## Common UI patterns

- **Composing indicator:** small typing dots, derived from
  `presence/{uid}/composing`. Both partners see this when the other is
  drafting.
- **Floor token visual:** subtle visual cue (e.g., colored bar at top of
  screen) showing whose turn it is. Avoid heavy icons; this is ambient.
- **Network state:** non-intrusive toast for connection issues.
  Optimistic UI for own actions, sync confirms.
- **Quick-exit:** discreet "leave now" button accessible from settings
  on every screen. Closes the app and clears recent activity from the
  task switcher.

## Accessibility

- All flows must be navigable with screen readers
- Support iOS Dynamic Type and Android font scaling
- Color is never the only differentiator (don't rely on red/green alone
  for state)
- Voice memos (v2) auto-transcribe for partners who prefer reading
- High-contrast mode supported

## Out of scope for v1

- Voice memos in appreciation
- Voice mode in conflict
- Auto floor-passing
- Quality checker coaching banner
- Interpreter prompts
- Animation polish (basic transitions only)
