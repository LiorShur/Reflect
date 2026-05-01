import {
  canCreateConflictSession,
  canProposeTopic,
  canRespondToTopic,
  decideCheckInTransition,
  isValidFloodingScore,
} from './session-utils';

describe('canCreateConflictSession', () => {
  it('low + low → ok', () => {
    expect(
      canCreateConflictSession({ selfTier: 'low', partnerTier: 'low' }),
    ).toEqual({ ok: true });
  });

  it.each([null, undefined as unknown as null])(
    'self tier %p → blocks',
    (selfTier) => {
      const r = canCreateConflictSession({
        selfTier,
        partnerTier: 'low',
      });
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.reason).toMatch(/check-in first/);
    },
  );

  it('partner not screened → blocks', () => {
    const r = canCreateConflictSession({
      selfTier: 'low',
      partnerTier: null,
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch(/partner/);
  });

  it.each(['moderate', 'high'] as const)(
    'self tier %s → blocks (joint mode disabled)',
    (tier) => {
      const r = canCreateConflictSession({
        selfTier: tier,
        partnerTier: 'low',
      });
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.reason).toMatch(/paused/);
    },
  );

  it.each(['moderate', 'high'] as const)(
    'partner tier %s → blocks (joint mode disabled)',
    (tier) => {
      const r = canCreateConflictSession({
        selfTier: 'low',
        partnerTier: tier,
      });
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.reason).toMatch(/partner/);
    },
  );
});

describe('decideCheckInTransition', () => {
  const ok = { flooding_score: 4, ready: true };
  const flooding = { flooding_score: 9, ready: true };
  const incomplete = { flooding_score: 4 }; // not ready
  const noScore = { ready: true }; // missing score

  it('both partners ready + low → TOPIC_INTAKE', () => {
    expect(decideCheckInTransition(ok, ok)).toEqual({
      advance: 'TOPIC_INTAKE',
    });
  });

  it('only one partner submitted → wait', () => {
    expect(decideCheckInTransition(ok, null)).toEqual({ wait: true });
    expect(decideCheckInTransition(null, ok)).toEqual({ wait: true });
  });

  it('one partner not ready → wait', () => {
    expect(decideCheckInTransition(ok, incomplete)).toEqual({ wait: true });
  });

  it('one partner missing score → wait (incomplete)', () => {
    expect(decideCheckInTransition(ok, noScore)).toEqual({ wait: true });
  });

  it('one partner flooding → PAUSED immediately even if other unsubmitted', () => {
    expect(decideCheckInTransition(flooding, null)).toEqual({
      advance: 'PAUSED',
      reason: 'flooding',
    });
    expect(decideCheckInTransition(null, flooding)).toEqual({
      advance: 'PAUSED',
      reason: 'flooding',
    });
  });

  it('both flooding → PAUSED', () => {
    expect(decideCheckInTransition(flooding, flooding)).toEqual({
      advance: 'PAUSED',
      reason: 'flooding',
    });
  });

  it.each([7, 6, 5, 1])('score %i counts as ready (≤ 7 threshold)', (score) => {
    expect(
      decideCheckInTransition({ flooding_score: score, ready: true }, ok),
    ).toEqual({ advance: 'TOPIC_INTAKE' });
  });

  it.each([8, 9, 10])(
    'score %i counts as flooding (≥ 8 threshold)',
    (score) => {
      expect(
        decideCheckInTransition({ flooding_score: score, ready: true }, ok),
      ).toEqual({ advance: 'PAUSED', reason: 'flooding' });
    },
  );
});

describe('isValidFloodingScore', () => {
  it.each([1, 5, 10])('accepts %i', (n) => {
    expect(isValidFloodingScore(n)).toBe(true);
  });

  it.each([0, 11, -1, 1.5, '5', null, undefined, NaN, {}])(
    'rejects %p',
    (v) => {
      expect(isValidFloodingScore(v)).toBe(false);
    },
  );
});

describe('canProposeTopic / canRespondToTopic', () => {
  it('canProposeTopic only in TOPIC_INTAKE', () => {
    expect(canProposeTopic('TOPIC_INTAKE')).toBe(true);
    expect(canProposeTopic('CHECK_IN')).toBe(false);
    expect(canProposeTopic('TOPIC_AGREE')).toBe(false);
    expect(canProposeTopic('IN_TURN')).toBe(false);
    expect(canProposeTopic(undefined)).toBe(false);
  });

  it('canRespondToTopic only in TOPIC_AGREE', () => {
    expect(canRespondToTopic('TOPIC_AGREE')).toBe(true);
    expect(canRespondToTopic('TOPIC_INTAKE')).toBe(false);
    expect(canRespondToTopic('IN_TURN')).toBe(false);
  });
});
