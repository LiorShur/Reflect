// Server-authoritative session state machine. All transitions are
// pure functions over (current state, event); the orchestrator
// invokes nextState() and writes the result to RTDB on RTDB-trigger
// dispatch.
//
// States and triggers come VERBATIM from docs/06-state-machine.md.
// Any change must be flagged for human review (CLAUDE.md safety
// rail #4 — bypass-screening logic lives downstream of this state
// machine).

export type SessionState =
  | 'INIT'
  | 'CHECK_IN'
  | 'TOPIC_INTAKE'
  | 'TOPIC_AGREE'
  | 'IN_TURN'
  | 'FLOOR_SWAP'
  | 'PAUSED'
  | 'WRAP_UP'
  | 'ENDED';

// Events that drive transitions. Each maps to a single line of
// docs/06 § Transition triggers.
export type SessionEvent =
  | 'BOTH_PARTNERS_PRESENT'
  | 'BOTH_CHECKED_IN_LOW' // both ready, both flooding ≤ 7
  | 'CHECK_IN_FLOODING' // either ≥ 8, partner declined override
  | 'TOPIC_SUBMITTED' // raiser submitted topic
  | 'TOPIC_ACCEPTED' // responder accepted
  | 'TOPIC_REFRAMED' // responder asked to reframe
  | 'TURN_HEARD' // speaker confirmation: yes / mostly (status='heard')
  | 'TURN_RETRY' // speaker confirmation: retry (or 'more' — both stay IN_TURN)
  | 'TURN_SWAP_ACKNOWLEDGED' // both partners ack'd FLOOR_SWAP summary
  | 'SESSION_DONE_AGREED' // both agreed session is done from FLOOR_SWAP
  | 'WRAP_UP_CONFIRMED' // both partners confirmed wrap-up summaries
  | 'FLOODING_DETECTED' // mid-session flooding (any active state)
  | 'PAUSE_TIMER_EXPIRED'; // 20-min timer + both re-checked-in low

export interface TransitionResult {
  next: SessionState;
}

export class IllegalTransitionError extends Error {
  constructor(from: SessionState, event: SessionEvent) {
    super(`Illegal transition: ${from} on ${event}`);
    this.name = 'IllegalTransitionError';
  }
}

// States from which FLOODING_DETECTED can transition to PAUSED.
// docs/06 § Pause and resume.
const ACTIVE_STATES: ReadonlySet<SessionState> = new Set([
  'CHECK_IN',
  'TOPIC_INTAKE',
  'TOPIC_AGREE',
  'IN_TURN',
  'FLOOR_SWAP',
  'WRAP_UP',
]);

// Computes the next state. PAUSED → previous-state resume is handled
// by the caller (it must read meta/state_before_pause); this function
// only knows about pure (state, event) → state.
export function nextState(
  from: SessionState,
  event: SessionEvent,
): TransitionResult {
  // Flooding can fire from any active state; check this branch first.
  if (event === 'FLOODING_DETECTED') {
    if (ACTIVE_STATES.has(from)) {
      return { next: 'PAUSED' };
    }
    throw new IllegalTransitionError(from, event);
  }

  switch (from) {
    case 'INIT':
      if (event === 'BOTH_PARTNERS_PRESENT') return { next: 'CHECK_IN' };
      break;

    case 'CHECK_IN':
      if (event === 'BOTH_CHECKED_IN_LOW') return { next: 'TOPIC_INTAKE' };
      if (event === 'CHECK_IN_FLOODING') return { next: 'PAUSED' };
      break;

    case 'TOPIC_INTAKE':
      if (event === 'TOPIC_SUBMITTED') return { next: 'TOPIC_AGREE' };
      break;

    case 'TOPIC_AGREE':
      if (event === 'TOPIC_ACCEPTED') return { next: 'IN_TURN' };
      if (event === 'TOPIC_REFRAMED') return { next: 'TOPIC_INTAKE' };
      break;

    case 'IN_TURN':
      if (event === 'TURN_HEARD') return { next: 'FLOOR_SWAP' };
      if (event === 'TURN_RETRY') return { next: 'IN_TURN' };
      break;

    case 'FLOOR_SWAP':
      if (event === 'TURN_SWAP_ACKNOWLEDGED') return { next: 'IN_TURN' };
      if (event === 'SESSION_DONE_AGREED') return { next: 'WRAP_UP' };
      break;

    case 'WRAP_UP':
      if (event === 'WRAP_UP_CONFIRMED') return { next: 'ENDED' };
      break;

    case 'PAUSED':
      if (event === 'PAUSE_TIMER_EXPIRED') {
        // Caller must restore from meta/state_before_pause; this
        // function can't determine the target from inputs alone.
        // Returning PAUSED is intentional — the caller is responsible
        // for reading state_before_pause and writing the actual
        // resumed state directly.
        return { next: 'PAUSED' };
      }
      break;

    case 'ENDED':
      break;
  }

  throw new IllegalTransitionError(from, event);
}
