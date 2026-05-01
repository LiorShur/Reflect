import {
  IllegalTransitionError,
  nextState,
  type SessionEvent,
  type SessionState,
} from './state-machine';

describe('nextState — happy-path session lifecycle', () => {
  it('walks INIT → CHECK_IN → TOPIC_INTAKE → TOPIC_AGREE → IN_TURN', () => {
    expect(nextState('INIT', 'BOTH_PARTNERS_PRESENT').next).toBe('CHECK_IN');
    expect(nextState('CHECK_IN', 'BOTH_CHECKED_IN_LOW').next).toBe(
      'TOPIC_INTAKE',
    );
    expect(nextState('TOPIC_INTAKE', 'TOPIC_SUBMITTED').next).toBe(
      'TOPIC_AGREE',
    );
    expect(nextState('TOPIC_AGREE', 'TOPIC_ACCEPTED').next).toBe('IN_TURN');
  });

  it('IN_TURN → FLOOR_SWAP → IN_TURN on heard + ack', () => {
    expect(nextState('IN_TURN', 'TURN_HEARD').next).toBe('FLOOR_SWAP');
    expect(nextState('FLOOR_SWAP', 'TURN_SWAP_ACKNOWLEDGED').next).toBe(
      'IN_TURN',
    );
  });

  it('FLOOR_SWAP → WRAP_UP → ENDED', () => {
    expect(nextState('FLOOR_SWAP', 'SESSION_DONE_AGREED').next).toBe('WRAP_UP');
    expect(nextState('WRAP_UP', 'WRAP_UP_CONFIRMED').next).toBe('ENDED');
  });
});

describe('nextState — branches and loops', () => {
  it('IN_TURN → IN_TURN on retry (listener mirror loop)', () => {
    expect(nextState('IN_TURN', 'TURN_RETRY').next).toBe('IN_TURN');
  });

  it('TOPIC_AGREE → TOPIC_INTAKE on reframe request', () => {
    expect(nextState('TOPIC_AGREE', 'TOPIC_REFRAMED').next).toBe(
      'TOPIC_INTAKE',
    );
  });

  it('CHECK_IN → PAUSED on flooding decline', () => {
    expect(nextState('CHECK_IN', 'CHECK_IN_FLOODING').next).toBe('PAUSED');
  });
});

describe('nextState — flooding can fire from any active state', () => {
  const activeStates: SessionState[] = [
    'CHECK_IN',
    'TOPIC_INTAKE',
    'TOPIC_AGREE',
    'IN_TURN',
    'FLOOR_SWAP',
    'WRAP_UP',
  ];

  it.each(activeStates)('%s + FLOODING_DETECTED → PAUSED', (state) => {
    expect(nextState(state, 'FLOODING_DETECTED').next).toBe('PAUSED');
  });

  it('INIT cannot enter PAUSED via flooding (no session yet)', () => {
    expect(() => nextState('INIT', 'FLOODING_DETECTED')).toThrow(
      IllegalTransitionError,
    );
  });

  it('PAUSED cannot enter PAUSED via flooding (already there)', () => {
    expect(() => nextState('PAUSED', 'FLOODING_DETECTED')).toThrow(
      IllegalTransitionError,
    );
  });

  it('ENDED cannot transition on flooding', () => {
    expect(() => nextState('ENDED', 'FLOODING_DETECTED')).toThrow(
      IllegalTransitionError,
    );
  });
});

describe('nextState — illegal transitions throw IllegalTransitionError', () => {
  const cases: Array<[SessionState, SessionEvent]> = [
    ['INIT', 'BOTH_CHECKED_IN_LOW'],
    ['CHECK_IN', 'TOPIC_SUBMITTED'],
    ['TOPIC_INTAKE', 'TOPIC_ACCEPTED'],
    ['IN_TURN', 'WRAP_UP_CONFIRMED'],
    ['WRAP_UP', 'TURN_HEARD'],
    ['ENDED', 'BOTH_PARTNERS_PRESENT'],
    ['ENDED', 'WRAP_UP_CONFIRMED'],
  ];

  it.each(cases)('%s + %s → throws', (state, event) => {
    expect(() => nextState(state, event)).toThrow(IllegalTransitionError);
  });
});

describe('nextState — PAUSED resume', () => {
  it('returns PAUSED on PAUSE_TIMER_EXPIRED — caller restores state_before_pause', () => {
    // The pure machine cannot know which state to resume to without
    // reading the side-effect-only meta/state_before_pause. Returning
    // PAUSED is the contract: orchestrator reads state_before_pause
    // and writes the resumed state itself.
    expect(nextState('PAUSED', 'PAUSE_TIMER_EXPIRED').next).toBe('PAUSED');
  });

  it('non-pause events from PAUSED throw', () => {
    expect(() => nextState('PAUSED', 'TURN_HEARD')).toThrow(
      IllegalTransitionError,
    );
  });
});

describe('IllegalTransitionError', () => {
  it('carries from + event in the message', () => {
    try {
      nextState('INIT', 'TURN_HEARD');
      throw new Error('expected to throw');
    } catch (err) {
      expect(err).toBeInstanceOf(IllegalTransitionError);
      expect((err as Error).message).toContain('INIT');
      expect((err as Error).message).toContain('TURN_HEARD');
    }
  });
});
