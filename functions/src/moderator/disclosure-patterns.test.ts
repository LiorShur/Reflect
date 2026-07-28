import { detectDisclosure } from './disclosure-patterns';

describe('detectDisclosure (S7 light scaffold)', () => {
  // The seed ships with an EMPTY pattern list — DV specialist adds
  // phrases in consultation with the team. Guarantee here: with an
  // empty list, the pipeline degrades to a no-op (never a false
  // positive that surprises testers).
  it('returns null for any input when no patterns are configured', () => {
    expect(detectDisclosure('hello')).toBeNull();
    expect(detectDisclosure("I'm scared of him")).toBeNull();
    expect(detectDisclosure('')).toBeNull();
  });

  // Sanity: once a phrase is added, the helper matches.
  // Kept as a documentation test — do not enable phrases without
  // clinical review. This test uses a placeholder pattern injected
  // via internal wiring so the seed itself stays empty.
  it('matches when a phrase is present (demonstration)', () => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const mod = require('./disclosure-patterns') as {
      DISCLOSURE_PATTERNS: RegExp[];
      detectDisclosure: typeof detectDisclosure;
    };
    mod.DISCLOSURE_PATTERNS.push(/\bplaceholder-test-phrase\b/i);
    try {
      expect(
        mod.detectDisclosure('I want to say the placeholder-test-phrase here'),
      ).toMatchObject({ index: expect.any(Number) });
      expect(mod.detectDisclosure('nothing to see')).toBeNull();
    } finally {
      // Clean up so the empty-list invariant holds for other tests.
      mod.DISCLOSURE_PATTERNS.length = 0;
    }
  });
});
