# 07 — Safety screening

> **Important context:** This doc is a starting point, not a final
> protocol. Before public launch, this entire flow should be reviewed
> by a domestic violence specialist. The screening logic and tier
> response are areas where a bad call can cause direct harm, and the
> experts in this space have seen failure modes that we would not
> predict.

## Why this exists

Reflective listening is **contraindicated in relationships with abuse
or coercive control.** It can actively harm the abused partner by
forcing them to validate the abuser's framing.

The goal of this screen is to:
1. Detect users who shouldn't be using the joint conflict mode
2. Surface appropriate resources discreetly
3. Avoid signaling to the partner that something happened
4. Avoid making non-abusive couples feel suspected

## Critical principles

1. **Screen each partner separately, on their own device, before
   pairing.** A screen done with the partner watching is meaningless.
2. **Frame as universal calibration, not abuse detection.** "We ask
   everyone these questions" — not "are you being abused?".
3. **Tier the response, don't binary-gate.** A positive screen
   shouldn't lock the user out — that can endanger them by signaling
   to the partner that something happened.
4. **Quick-exit on every screen.** Discreet button that closes the app
   and clears recent activity from the task switcher.
5. **No screening data shared with the partner, ever.**

## Question battery (v1 starting set)

Adapted from validated instruments (HITS, WEB, Partner Violence
Screen). To be reviewed by DV specialist before launch.

Each question rated on a 5-point Likert scale: never / rarely /
sometimes / often / always.

### Block A — Direct conflict
1. How often does your partner physically hurt you?
2. How often does your partner insult you or talk down to you?
3. How often does your partner threaten you with harm?
4. How often does your partner scream or curse at you?

### Block B — Coercive control
5. How often does your partner make most of the major decisions
   without consulting you?
6. How often have you stopped seeing friends or family because of
   conflict with your partner?
7. How often do you avoid certain topics because of how your partner
   might react?
8. How often does your partner check or monitor your phone, location,
   or activity?
9. How often does your partner control your access to money?

### Block C — Subjective safety
10. Do you feel afraid of your partner?
11. Do you feel free to disagree with your partner?

## Tier computation

Score each Likert response 0–4 (never=0, always=4).

| Tier | Block A score | Block B score | Block C |
|---|---|---|---|
| Low | All 0–1 | All 0–1 | "Free to disagree" yes, no fear |
| Moderate | Any item 2 | Any 2+ items at 2 | Any concern flagged |
| High | Any item 3+ | Any item 3+ | "Afraid" or "not free to disagree" |

The "max tier" across blocks determines the user's tier.

**Q1 (physical harm) at any non-zero score → automatic high tier.**

## Tier responses

### Low tier (most users)
- Joint conflict mode: enabled
- Friendship rituals: enabled
- Resources visible in settings menu (always available, never hidden)
- No special UI flags

### Moderate tier
- Joint conflict mode: **disabled** with a generic-sounding reason
  ("we recommend starting with the individual reflection exercises
  first")
- Friendship rituals: enabled (these are lower-risk and have
  standalone clinical value)
- Resources surfaced more prominently (top of settings, banner
  occasionally)
- Re-screen offered after 4 weeks
- Partner sees nothing different on their side

### High tier
- Joint conflict mode: never appears in UI
- Friendship rituals: optional, but de-emphasized
- Resources: surfaced immediately on completion of screening, with
  region-appropriate hotlines
- Quick-exit emphasized
- Discreet "you may want to use this app from a different device"
  guidance

## Resources by region

The app surfaces a region-appropriate primary resource. Detected via
device locale; user can override.

| Region | Primary | Secondary |
|---|---|---|
| US | National DV Hotline: 1-800-799-7233 | thehotline.org |
| UK | Refuge: 0808 2000 247 | refuge.org.uk |
| AU | 1800RESPECT: 1800 737 732 | 1800respect.org.au |
| CA | ShelterSafe.ca | sheltersafe.ca |
| IL | WIZO Hotline: 1-800-353-3000 | (verify and update) |
| EU (default) | Local emergency: 112 + Women Against Violence Europe wave-network.org | |
| Default | International: nomoredirectory.org | |

**Note:** This list needs verification and expansion before launch. Add
new regions as user base grows.

## Quick-exit pattern

Every screen in the screening flow (and in resource pages) has a small
"Leave now" button.

When tapped:
1. App immediately closes
2. Recent activity is cleared from the task switcher (iOS:
   `UIApplication.shared.endBackgroundTask` and immediate exit;
   Android: `finishAndRemoveTask()`)
3. App icon and recent screens not visible in task switcher
4. Push notifications disabled until explicitly re-enabled

Available from settings on every screen of the app, not just
screening.

## Stealth features

For users in unsafe relationships:

- **PIN/biometric lock:** required to open the app
- **Disguised app icon (v2):** option to display as a calculator,
  notes, or weather app
- **No notification previews:** lock screen never shows message text
- **Background blur:** when app goes to background, content is blurred
- **Browser-style "private session" mode (v2):** session not saved to
  history

## Disclosures during sessions

Even after passing screening, a user may disclose abuse, self-harm, or
imminent violence during a session. The orchestrator runs a separate
detector for these disclosures (LLM-based, runs on every speaker
draft).

When detected:
- Session does NOT continue normally
- Disclosing user sees a private resource screen (partner does not see
  this)
- Resources include the relevant hotlines for their disclosed
  situation
- Session can be ended or paused at user's choice

This detector is intentionally separate from the moderator. The
moderator handles communication patterns; this handles content.

## Re-screening

- Triggered: every 4 weeks for moderate tier; every 12 weeks for low
  tier
- Voluntary re-screen always available in settings
- A user moving from moderate → low unlocks joint conflict mode
- A user moving from low → moderate triggers a soft message ("based
  on your latest check-in, we recommend pausing joint sessions for
  now"); existing scheduled sessions are not auto-cancelled but joint
  mode disappears from new session creation

## Privacy

- Screening data lives in `users/{uid}/screening` (private to user)
- Never written to session-scoped paths
- Never shared with partner
- Never used for any purpose other than tier determination
- Excluded from any aggregate analytics
- User-deletable

## What this doc does NOT cover

- Crisis intervention protocols (the app doesn't do crisis
  intervention; it surfaces resources)
- Mandated reporting (the app is not a clinician and has no mandated
  reporting role)
- Therapist-supervised use cases (v3+)
- Specifics of the in-session disclosure detector (separate doc when
  built)
