# 01 — Project overview

## The clinical foundation

Reflect is built around Gottman's research-validated **speaker-listener
technique**, with the structural addition of AI moderation. The core
mechanic of a session:

1. One partner holds the floor and makes a statement
2. The other partner reflects back what they heard, including the
   underlying feeling
3. The speaker confirms whether they felt heard, or asks the listener to
   try again
4. Once the speaker feels heard, the floor passes
5. The listener becomes the speaker on the same topic

The discipline is that the listener cannot respond, defend, or counter —
only reflect — until the speaker feels heard. This is the move that
breaks the escalation cycle in conflict conversations.

Gottman's research on harsh startup, the Four Horsemen (criticism,
contempt, defensiveness, stonewalling), and the 5:1 ratio of positive to
negative interactions in healthy relationships drives the AI's
moderation logic.

## The role of AI

The AI plays four distinct roles, of which v1 ships two:

**v1:**
- **Moderator** (always on) — enforces turn-taking, catches harsh
  startup, detects flooding, suggests breaks
- **Translator** (always on, with speaker approval) — offers softened
  versions of statements before the partner sees them

**v2:**
- **Quality checker** — scores whether mirrors actually captured what
  was said, coaches the listener when they don't
- **Interpreter** — surfaces the underlying feeling beneath the words

## The two-device sync model

Each partner uses their own device. Session state lives on the server
(Firebase RTDB), and the floor token is server-authoritative. The
non-floor partner cannot:

- See what the floor-holder is composing
- Send a message
- See AI suggestions intended for the floor-holder

Drafts on each side are private; only delivered content crosses the
partner boundary.

## Beyond the conflict mode

Conflict is the high-stakes feature, but it isn't the daily one.
Couples don't have hard conversations every week — they need rituals
that maintain the friendship layer underneath.

**v1 ships one friendship ritual: daily appreciation.** It's the
simplest to build, has clinical value standalone, and gives users a
reason to come back to the app between conflict sessions.

**v2 expands** to love maps, stress-reducing conversation, weekly
state-of-the-union, and bid recognition.

See `09-friendship-rituals.md`.

## What's explicitly out of scope

These are tempting to build but are wrong for this product or wrong for
this stage:

- **Therapist replacement.** Reflect supplements therapy or supports
  couples between sessions. It is not a substitute for a clinician,
  especially for couples with significant relationship distress, mental
  health concerns, or any history of abuse.

- **Crisis support.** If the AI detects disclosures of self-harm,
  imminent violence, or coercive control, the response is to surface
  region-appropriate crisis resources, not to handle it within the
  session.

- **Automated diagnosis or matching.** The app does not label users with
  attachment styles, communication archetypes, or relationship
  diagnoses.

- **Public sharing or community features.** Sessions are private to the
  two participants. There is no leaderboard, no social feed, no
  public-facing content.

- **Voice mode in v1.** Voice adds 3–5x engineering complexity (latency,
  STT errors, prosody analysis). v1 validates the core hypothesis in
  text mode first.

## Roadmap summary

**v1 (8–12 weeks):** Safety screening, two-device sync, text-only
conflict mode, moderator + translator, manual floor passing, daily
appreciation, wrap-up summaries.

**v2:** Voice mode, interpreter + quality checker, auto floor-passing,
love maps, stress-reducing conversation, weekly state-of-the-union,
biometric opt-in.

**v3+:** Therapist dashboards, multi-language, async/messaging mode,
longitudinal insights.

See `v1-scope.md` for the canonical v1 list.

## Critical principle: speaker autonomy

Across every AI feature, the speaker (or partner using the feature)
retains final authority over their own words. The "use original" button
is never hidden behind a menu. The mirror "send anyway" override is
always available. The moderator's coaching is offered as suggestions,
not commands. This is both a clinical commitment (couples are not
incompetent) and a trust commitment (the AI earns its role by being
useful, not by being mandatory).
