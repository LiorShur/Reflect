// Stub — milestone 3 (D4). Authoritative state transitions for a
// conflict-mode session. Full state diagram in docs/06-state-machine.md.

export type SessionState =
  | 'idle'
  | 'check_in'
  | 'topic_intake'
  | 'in_turn'
  | 'wrap_up'
  | 'paused';

export interface StateTransition {
  from: SessionState;
  to: SessionState;
  reason: string;
}

export function nextState(
  _from: SessionState,
  _event: string,
): SessionState {
  throw new Error('not implemented: orchestrator/state-machine.nextState');
}
