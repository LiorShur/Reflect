// Pure helpers for the pairing flow. Side-effect-free so they're
// testable without firebase-admin or the emulator.

export const PAIR_CODE_TTL_MS = 10 * 60 * 1000; // 10 minutes

export function isValidCodeFormat(value: unknown): value is string {
  return typeof value === 'string' && /^\d{6}$/.test(value);
}

export function isExpired(expiresAt: number, now: number): boolean {
  return now >= expiresAt;
}

export function wouldSelfPair(
  creatorUid: string,
  redeemerUid: string,
): boolean {
  return creatorUid === redeemerUid;
}

// 6-digit numeric code, zero-padded so codes always render uniformly.
export function generateCode(random: () => number = Math.random): string {
  return Math.floor(random() * 1_000_000)
    .toString()
    .padStart(6, '0');
}
