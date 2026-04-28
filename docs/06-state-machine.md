# 06 — State machine

The session state machine. All transitions are server-authoritative,
managed by the orchestrator.

## States

| State | Description |
|---|---|
| `INIT` | Session created, no participants joined yet |
| `CHECK_IN` | Both partners doing pre-session flooding self-rating |
| `TOPIC_INTAKE` | Raiser proposing the topic |
| `TOPIC_AGREE` | Other partner accepting/refining the topic |
| `IN_TURN` | Active speaker-listener loop |
| `FLOOR_SWAP` | Brief between-turn state, AI summarizes what each said |
| `PAUSED` | Flooding-triggered 20-min cooldown |
| `WRAP_UP` | Both partners reviewing AI-generated summary |
| `ENDED` | Session complete, archived |

## Valid transitions

```
INIT
  ↓ (both partners join)
CHECK_IN
  ↓ (both submit, both ready)         ↓ (either >7, partner declines)
TOPIC_INTAKE                          PAUSED
  ↓ (raiser submits topic)              ↓ (timer expires, recheck)
TOPIC_AGREE                           [back to previous state]
  ↓ (responder agrees)
IN_TURN  ←──────┐
  ↓             │ (try again)
  │  ↓ (heard / more)
  ↓             │
FLOOR_SWAP      │
  ↓             │
IN_TURN ────────┘
  ↓ (both partners finished)
WRAP_UP
  ↓ (both confirm)
ENDED
```

`PAUSED` is reachable from any active state (CHECK_IN, TOPIC_INTAKE,
TOPIC_AGREE, IN_TURN, FLOOR_SWAP, WRAP_UP) on flooding detection.

## Transition triggers

| From | To | Trigger |
|---|---|---|
| INIT | CHECK_IN | Both partners present |
| CHECK_IN | TOPIC_INTAKE | Both `checkins.{uid}.ready === true`, both score ≤ 7 |
| CHECK_IN | PAUSED | Either score ≥ 8 and partner declines override |
| TOPIC_INTAKE | TOPIC_AGREE | Raiser submits topic |
| TOPIC_AGREE | IN_TURN | Responder accepts |
| TOPIC_AGREE | TOPIC_INTAKE | Responder suggests reframing |
| IN_TURN | FLOOR_SWAP | `speaker_confirmation.status === "heard" \|\| "more"` |
| IN_TURN | IN_TURN | `speaker_confirmation.status === "retry"` (loops back to listener mirror) |
| IN_TURN | PAUSED | Flooding detected (linguistic, conversational, or self-report) |
| FLOOR_SWAP | IN_TURN | Both partners acknowledge the swap summary |
| FLOOR_SWAP | WRAP_UP | Both partners agree session is done |
| PAUSED | [previous] | 20-min timer + both re-check-in |
| WRAP_UP | ENDED | Both partners confirm summaries (or skip) |

## Per-state UI mapping

| State | Speaker UI | Listener UI |
|---|---|---|
| CHECK_IN | Pre-session check-in | Pre-session check-in |
| TOPIC_INTAKE | Topic input | "Waiting for partner" |
| TOPIC_AGREE | "Waiting for partner" | Topic confirmation |
| IN_TURN (compose) | Speaker compose / translator review | "Partner is composing" |
| IN_TURN (delivered) | "Partner is reflecting" | Listener mirroring |
| IN_TURN (mirror submitted) | Speaker confirmation | "Partner is reviewing" |
| FLOOR_SWAP | Floor swap summary | Floor swap summary |
| PAUSED | Cooldown screen | Cooldown screen |
| WRAP_UP | Wrap-up | Wrap-up |
| ENDED | Home | Home |

## Floor token rotation

Within `IN_TURN`, the floor swap is a discrete sub-state, not just a
transition. Sequence:

1. Speaker writes `speaker_confirmation.status: "heard"`
2. Orchestrator function fires
3. Orchestrator:
   a. Generates turn ID
   b. Copies `current_turn` fields into `history/{turnId}/`
   c. Resets `current_turn`, swaps `speaker_uid` ↔ `listener_uid`
   d. Sets `meta/state: "FLOOR_SWAP"`
   e. Generates brief swap summary, writes to `current_turn/floor_swap_summary`
4. Both partners see the swap summary screen with "ready to continue" button
5. When both have acknowledged, orchestrator sets `meta/state: "IN_TURN"`

Why a discrete state and not just a transition: it gives the listener
(now becoming speaker) a moment to digest before composing. Forcing
immediate role-flip is a known failure mode.

## Pause and resume

Pause is initiated by orchestrator when:

- Either partner self-reports flooding score ≥ 8 mid-session (mid-session
  check-ins happen every 4–5 turns)
- Linguistic activation markers cross threshold (see
  `10-moderator-fastpath.md`)
- Either partner explicitly requests a break

When `PAUSED`:
- `meta/state: "PAUSED"`
- `meta/paused_until: now + 20 min`
- Previous state stored in `meta/state_before_pause`
- Both partners see cooldown screen
- All draft writes are blocked by security rules (state must be
  `IN_TURN` to write drafts)

Resume:
- Timer expires
- Both partners re-submit flooding check-in
- If both ≤ 7: orchestrator restores `meta/state` to
  `state_before_pause`
- If either still ≥ 8: stays paused, prompts for additional break or
  ending the session

## Reconnection handling

If a partner disconnects (presence timeout):

- After 60s offline: orchestrator sets `meta/state: "PAUSED"` with a
  flag that this is a connectivity pause, not a flooding pause
- Other partner sees "[name] stepped away — paused for now"
- On reconnect: state resumes from where it was, both re-confirm
  flooding score before continuing

## Append-only history guarantee

`history/{turnId}/` writes are restricted by security rules to be
write-once. Once a turn is archived, it cannot be modified. This is
the durable record of what was said and reflected. Wrap-up summaries
are generated from this history.

## Edge case: speaker abandons mid-compose

If the speaker stops typing for >5 min during draft composition (in
voice: stops speaking with no sentence-final intonation), the
orchestrator does NOT auto-time-out. The session stays in IN_TURN.

The other partner sees "[name] is composing" with a soft heartbeat. If
the other partner is concerned, they can manually request a pause.

This is deliberate. Long pauses to compose are normal in difficult
conversations; auto-timing out would be impatient and clinically wrong.
