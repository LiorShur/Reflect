import {
  generateCode,
  isExpired,
  isValidCodeFormat,
  PAIR_CODE_TTL_MS,
  wouldSelfPair,
} from './code-utils';

describe('isValidCodeFormat', () => {
  it.each(['000000', '123456', '999999'])('accepts %s', (code) => {
    expect(isValidCodeFormat(code)).toBe(true);
  });

  it.each([
    ['12345', 'too short'],
    ['1234567', 'too long'],
    ['12345a', 'non-digit'],
    ['12 456', 'whitespace'],
    ['', 'empty'],
  ])('rejects "%s" (%s)', (code) => {
    expect(isValidCodeFormat(code)).toBe(false);
  });

  it.each([null, undefined, 123456, {}])(
    'rejects non-string input %p',
    (input) => {
      expect(isValidCodeFormat(input)).toBe(false);
    },
  );
});

describe('isExpired', () => {
  it('returns false strictly before expiry', () => {
    expect(isExpired(1000, 999)).toBe(false);
  });

  it('returns true at the expiry instant (defensive)', () => {
    expect(isExpired(1000, 1000)).toBe(true);
  });

  it('returns true after expiry', () => {
    expect(isExpired(1000, 1001)).toBe(true);
  });
});

describe('wouldSelfPair', () => {
  it('flags identical uids', () => {
    expect(wouldSelfPair('alice', 'alice')).toBe(true);
  });

  it('does not flag distinct uids', () => {
    expect(wouldSelfPair('alice', 'bob')).toBe(false);
  });
});

describe('generateCode', () => {
  it('always returns a 6-digit string', () => {
    const fixedRandom = () => 0.0001;
    expect(generateCode(fixedRandom)).toMatch(/^\d{6}$/);
  });

  it('zero-pads small numbers', () => {
    const r = () => 0; // floor(0 * 1e6) = 0
    expect(generateCode(r)).toBe('000000');
  });

  it('uses the full 6-digit range', () => {
    const r = () => 0.9999999; // floor → 999999
    expect(generateCode(r)).toBe('999999');
  });

  it('produces format-valid codes from real randomness', () => {
    for (let i = 0; i < 100; i++) {
      expect(isValidCodeFormat(generateCode())).toBe(true);
    }
  });
});

describe('PAIR_CODE_TTL_MS', () => {
  it('is 10 minutes', () => {
    expect(PAIR_CODE_TTL_MS).toBe(10 * 60 * 1000);
  });
});
