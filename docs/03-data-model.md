# 03 — Data model and security rules

## Schema overview

All session-related state lives in Firebase Realtime Database under
`/sessions/{sessionId}/`. User-level data lives under `/users/{uid}/`.

```
users/
  {uid}/
    profile/                       # readable by self only
      created_at: timestamp
      display_name: string
      partner_uid: string | null   # set after pairing (orchestrator-written)
      paired_at: timestamp         # set after pairing (orchestrator-written)
    screening/                     # readable by self only — orchestrator-written
      completed_at: timestamp
      tier: "low" | "moderate" | "high"
      flags: [<question_id_with_severity>, ...]   # e.g. ["q1_physical_harm", "q10_afraid"]
      # NOTE: raw answers are NEVER stored. The flags array records which
      # questions contributed to the tier so we can re-evaluate logic
      # without retaining the answer text. See docs/07-safety-screening.md
      # § Privacy.
    settings/                      # readable by self only
      notifications: {...}
      voice_enabled: boolean       # v2
    baseline/                      # speaker baseline for moderator
      avg_message_length: number
      avg_exclamations: number
      sample_count: number

pair_codes/                        # server-only — never client readable/writable
  {code}/                          # 6-digit numeric, server-generated
    creator_uid: <uid>
    created_at: timestamp
    expires_at: timestamp          # 10-min TTL

meta/                              # server-only — orchestrator + cap tracking
  anthropic_cost/
    {YYYY-MM-DD}: number           # accumulated USD spent that day

telemetry/                         # server-only — anonymized trace logs
  traces/
    {YYYY-MM-DD}/
      {push_id}/
        prompt_role: string
        prompt_version: string
        model: string
        input_hash: string         # SHA-256, never raw text (CLAUDE.md rail #2)
        output_hash: string | null
        session_id_hash: string | null
        latency_ms: number
        cost_usd: number | null
        created_at: timestamp

sessions/
  {sessionId}/
    meta/
      partnerA: <uid>
      partnerB: <uid>
      mode: "conflict" | "stress_reducing" | "appreciation"
      state: "CHECK_IN" | "TOPIC_INTAKE" | "TOPIC_AGREE" |
             "IN_TURN" | "FLOOR_SWAP" | "PAUSED" | "WRAP_UP" | "ENDED"
      floor_holder: <uid> | null
      floor_mode: "explicit" | "auto"
      topic: string
      started_at: timestamp
      paused_until: timestamp | null
      turn_count: int

    checkins/
      {uid}/                       # private to that uid
        flooding_score: 1-10
        context: string
        ready: boolean
        submitted_at: timestamp

    current_turn/
      speaker_uid: <uid>
      listener_uid: <uid>

      speaker_draft/               # private to speaker_uid
        raw: string
        committed: boolean

      translation/                 # written by orchestrator
        softened: string
        changes_made: string
        already_soft: boolean
        cannot_soften: boolean
        approved: boolean          # speaker writes this field only
        prompt_version: string

      delivered/                   # readable by both
        text: string
        delivered_at: timestamp

      listener_draft/              # private to listener_uid
        content_field: string
        feeling_field: string
        committed: boolean

      mirror/                      # readable by both, written on commit
        text: string
        score: { content, feeling, cleanliness, validation }
        submitted_at: timestamp

      speaker_confirmation/        # written by speaker_uid only
        status: "heard" | "more" | "retry"
        hint: string

    history/
      {turnId}/                    # append-only, both can read
        speaker_uid, listener_uid
        delivered_text
        mirror_text
        confirmation_status
        timestamps

    flags/
      {flagId}/                    # moderator interventions, both can read
        type: "harsh_startup" | "flooding" | "topic_drift"
        severity: 1 | 2 | 3
        target_uid: <uid>
        created_at: timestamp

    presence/
      {uid}/                       # own only
        online: boolean
        composing: boolean
        last_seen: timestamp

    summary/                       # written by orchestrator on WRAP_UP
      partner_a_summary: string
      partner_b_summary: string
      partner_a_confirmed: boolean
      partner_b_confirmed: boolean
      next_action: "leave" | "schedule_solving" | "add_to_perpetual"

appreciation_feed/
  {uid}/                           # private to recipient
    {entryId}/
      from_uid: <uid>
      content: string
      tags: [...]
      voice_url: string | null     # v2
      created_at: timestamp
      reaction: "heart" | "thanks" | "more" | null
```

## Critical privacy boundaries

Any of these being violated is a P0 bug:

| Path | Readable by | Writable by |
|---|---|---|
| `users/{uid}/profile/display_name` | self | self |
| `users/{uid}/profile/created_at` | self | self |
| `users/{uid}/profile/partner_uid` | self | orchestrator (after pairing) |
| `users/{uid}/profile/paired_at` | self | orchestrator (after pairing) |
| `pair_codes/{code}` | none (server-only) | none (server-only) |
| `users/{uid}/screening` | self | orchestrator (after screening) |
| `users/{uid}/baseline` | self | orchestrator |
| `sessions/{sid}/meta` | both partners | orchestrator |
| `sessions/{sid}/checkins/{uid}` | uid only | uid only |
| `sessions/{sid}/current_turn/speaker_draft` | speaker_uid | speaker_uid |
| `sessions/{sid}/current_turn/translation` (most fields) | both | orchestrator only |
| `sessions/{sid}/current_turn/translation/approved` | both | speaker_uid |
| `sessions/{sid}/current_turn/delivered` | both | orchestrator |
| `sessions/{sid}/current_turn/listener_draft` | listener_uid | listener_uid |
| `sessions/{sid}/current_turn/mirror` | both | listener_uid (once) |
| `sessions/{sid}/current_turn/speaker_confirmation` | both | speaker_uid |
| `sessions/{sid}/history/*` | both | orchestrator (append) |
| `sessions/{sid}/flags/*` | both | orchestrator |
| `sessions/{sid}/presence/{uid}` | both | uid |

## Security rules

The complete security rules file lives at `firebase/database.rules.json`.
Key patterns:

```javascript
{
  "rules": {
    "users": {
      "$uid": {
        ".read": "auth.uid === $uid",
        "profile": { ".write": "auth.uid === $uid" },
        "settings": { ".write": "auth.uid === $uid" },
        "screening": { ".write": false },
        "baseline": { ".write": false }
      }
    },

    "sessions": {
      "$sid": {
        ".read": "auth != null && (
          data.child('meta/partnerA').val() === auth.uid ||
          data.child('meta/partnerB').val() === auth.uid)",

        "meta": { ".write": false },

        "checkins": {
          "$uid": {
            ".read": "auth.uid === $uid",
            ".write": "auth.uid === $uid &&
              root.child('sessions/' + $sid + '/meta/state').val() === 'CHECK_IN'"
          }
        },

        "current_turn": {
          "speaker_draft": {
            ".read": "auth.uid === data.parent().child('speaker_uid').val()",
            ".write": "auth.uid === data.parent().child('speaker_uid').val()"
          },
          "translation": {
            "approved": {
              ".write": "auth.uid === data.parent().parent().child('speaker_uid').val()"
            },
            "softened":     { ".write": false },
            "changes_made": { ".write": false },
            "already_soft": { ".write": false }
          },
          "delivered": { ".write": false },
          "listener_draft": {
            ".read": "auth.uid === data.parent().child('listener_uid').val()",
            ".write": "auth.uid === data.parent().child('listener_uid').val()"
          },
          "mirror": {
            ".write": "auth.uid === data.parent().child('listener_uid').val() &&
                       !data.exists()"
          },
          "speaker_confirmation": {
            ".write": "auth.uid === data.parent().child('speaker_uid').val()"
          }
        },

        "history": {
          "$turnId": { ".write": false }
        },
        "flags": { ".write": false },
        "presence": {
          "$uid": { ".write": "auth.uid === $uid" }
        },
        "summary": {
          "partner_a_confirmed": {
            ".write": "auth.uid === data.parent().parent().child('meta/partnerA').val()"
          },
          "partner_b_confirmed": {
            ".write": "auth.uid === data.parent().parent().child('meta/partnerB').val()"
          }
        }
      }
    }
  }
}
```

## State transitions enforced in rules vs orchestrator

**In rules:** Path-level ACL (who can read/write what).

**In orchestrator:** State machine transitions, atomic operations
involving multiple paths (e.g., archiving a turn to history while
resetting current_turn), AI calls, telemetry.

**Belt-and-suspenders:** Client logic should also gate writes by state,
but rules are the security boundary.

## Floor token and turn rotation

Floor token transitions are **always** orchestrator-mediated. The
sequence:

1. Speaker writes `speaker_confirmation/status: "heard"`
2. Orchestrator function fires on this write
3. Orchestrator:
   - Generates a turn ID (e.g., timestamp + counter)
   - Copies relevant fields from `current_turn` into
     `history/{turnId}/`
   - Resets `current_turn`: swaps `speaker_uid` ↔ `listener_uid`
   - Sets `meta/state: "FLOOR_SWAP"`
   - Generates a brief "what each said" summary, writes to
     `current_turn/floor_swap_summary`
   - After both partners acknowledge, sets `meta/state: "IN_TURN"`

This is too much logic for rules; it lives in `functions/orchestrator/`.

## Pairing flow

Pair codes are short-lived, single-use credentials minted by an
authenticated user (creator) and redeemed out-of-band by the partner.
Both endpoints are HTTPS callable Cloud Functions; clients never read
or write `/pair_codes` directly.

```
1. createPairCode(auth=A) →
     - precondition: A.profile.partner_uid does not exist
     - generates a 6-digit code (retry on collision)
     - writes pair_codes/{code} = { creator_uid: A, expires_at: now+10m }
     - returns { code }

2. redeemPairCode({ code }, auth=B) →
     - precondition: B.profile.partner_uid does not exist
     - precondition: code exists, not expired, creator_uid !== B
     - transaction: deletes pair_codes/{code} (claim)
     - multi-path update:
         users/A/profile/partner_uid = B
         users/A/profile/paired_at  = now
         users/B/profile/partner_uid = A
         users/B/profile/paired_at  = now
     - returns { partner_uid: A }
```

Codes are 10-minute TTL so an unused code can't sit indefinitely. The
TTL is enforced inside `redeemPairCode`; expired entries are also
swept by a scheduled cleanup function (TBD in a follow-up).

## Screening flow

Per-user, on-device, completed before pairing per docs/07. Answers
never reach RTDB; only the computed tier + the IDs of questions that
contributed to that tier are persisted.

```
1. submitScreening({answers}, auth=A) →
     - precondition: A.profile.partner_uid does not exist
       (screening must complete before pairing)
     - validates: all 11 question IDs present, each score 0..4
     - server-side tier computation (orchestrator):
         * Q1 > 0 → high (overrides everything)
         * Block A (Q1-Q4): max item score → high (≥3) / moderate (2) / low
         * Block B (Q5-Q9): high if any ≥3, moderate if 2+ items at ≥2
         * Block C (Q10 afraid, Q11 free-to-disagree, reverse-scored):
             high if Q10≥3 OR Q11≤1; moderate if Q10=2 OR Q11=2
         * final tier = max(blockA, blockB, blockC, q1_override)
     - writes users/{uid}/screening = { completed_at, tier, flags }
     - returns { tier }
```

Tier is then used client-side to gate features (joint conflict mode
disabled for moderate/high; resources surfaced more prominently for
moderate; explicit stealth + resources for high). See docs/07
§ Tier responses.

Re-screening (S6) and the in-session disclosure detector (S7) are
deferred to follow-up PRs.

## Indexes

For RTDB:

```json
{
  "rules": {
    "sessions": {
      ".indexOn": ["meta/partnerA", "meta/partnerB"]
    },
    "appreciation_feed": {
      "$uid": {
        ".indexOn": ["created_at"]
      }
    }
  }
}
```

This lets clients query "my active sessions" and "my appreciation feed
sorted by date" efficiently.
