import { computeCostUsd, DAILY_CAP_USD, isOverCap, todayKey } from './cost-cap';

describe('computeCostUsd', () => {
  it('prices a typical translator call (1k input, 200 output) under a cent', () => {
    const cost = computeCostUsd('claude-sonnet-4-5', {
      input_tokens: 1000,
      output_tokens: 200,
    });
    // 1000 * 3 / 1M + 200 * 15 / 1M = 0.003 + 0.003 = 0.006
    expect(cost).toBeCloseTo(0.006, 6);
  });

  it('zero usage costs zero', () => {
    expect(
      computeCostUsd('claude-sonnet-4-5', {
        input_tokens: 0,
        output_tokens: 0,
      }),
    ).toBe(0);
  });

  it('Opus is roughly 5x Sonnet for the same usage', () => {
    const usage = { input_tokens: 1000, output_tokens: 200 };
    const sonnet = computeCostUsd('claude-sonnet-4-5', usage);
    const opus = computeCostUsd('claude-opus-4-7', usage);
    expect(opus / sonnet).toBeCloseTo(5, 1);
  });

  it('throws on unknown model — forces explicit pricing-table updates', () => {
    expect(() =>
      computeCostUsd('claude-something-new', {
        input_tokens: 100,
        output_tokens: 100,
      }),
    ).toThrow(/Unknown model/);
  });
});

describe('isOverCap', () => {
  it('false when under cap', () => {
    expect(isOverCap(0)).toBe(false);
    expect(isOverCap(DAILY_CAP_USD - 0.01)).toBe(false);
  });

  it('true at the cap (defensive — block at the threshold)', () => {
    expect(isOverCap(DAILY_CAP_USD)).toBe(true);
  });

  it('true past the cap', () => {
    expect(isOverCap(DAILY_CAP_USD + 0.01)).toBe(true);
  });
});

describe('todayKey', () => {
  it('returns ISO YYYY-MM-DD in UTC', () => {
    const d = new Date('2026-05-01T12:34:56Z');
    expect(todayKey(d)).toBe('2026-05-01');
  });

  it('rolls over at UTC midnight regardless of local time', () => {
    expect(todayKey(new Date('2026-05-01T23:59:59Z'))).toBe('2026-05-01');
    expect(todayKey(new Date('2026-05-02T00:00:00Z'))).toBe('2026-05-02');
  });
});

describe('DAILY_CAP_USD', () => {
  it('is the documented $5/day default', () => {
    expect(DAILY_CAP_USD).toBe(5.0);
  });
});
