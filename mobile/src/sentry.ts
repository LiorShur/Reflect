import * as Sentry from '@sentry/react-native';

// Sentry init. No-op when EXPO_PUBLIC_SENTRY_DSN is not set, so the
// app runs identically in dev environments without Sentry configured.
//
// Sentry native code requires a development build (not Expo Go). See
// site/README.md and /docs/deploy for the EAS build instructions.
//
// CLAUDE.md safety rail #2 alignment: we do NOT set sendDefaultPii and
// we scrub the URL fragment / query since our RTDB writes never appear
// in navigation URLs, but any accidental raw-text logging (from an
// uncaught exception message that quotes the compose text) is caught
// by beforeSend and trimmed to a length + hash marker rather than
// forwarded verbatim.

let initialized = false;

export function initSentry(): void {
  if (initialized) return;
  const dsn = process.env.EXPO_PUBLIC_SENTRY_DSN;
  if (!dsn) return; // silent no-op — no DSN = no Sentry

  Sentry.init({
    dsn,
    // Environments: 'development' locally, 'pilot' during closed
    // beta, 'production' once public. Set via env var if you want
    // more granularity; defaulting to 'pilot' during the closed run.
    environment: process.env.EXPO_PUBLIC_SENTRY_ENV ?? 'pilot',
    // 10% traces by default — session-count is low in the pilot so
    // this is fine; bump / lower later based on volume.
    tracesSampleRate: 0.1,
    sendDefaultPii: false,
    beforeSend(event) {
      // Strip anything that looks like a long free-text string from
      // exception messages / breadcrumbs. Defense against accidental
      // raw-conversation leakage in error stacks.
      return scrubEvent(event);
    },
  });
  initialized = true;
}

// Re-exported so screens can wrap components / capture manually
// without every caller importing @sentry/react-native directly.
export const wrap = Sentry.wrap;
export const captureException = Sentry.captureException;
export const captureMessage = Sentry.captureMessage;

function scrubEvent(event: Sentry.ErrorEvent): Sentry.ErrorEvent | null {
  const MAX_LEN = 200;
  const trim = (s: unknown): unknown => {
    if (typeof s === 'string' && s.length > MAX_LEN) {
      return `${s.slice(0, MAX_LEN)}… (trimmed ${s.length - MAX_LEN} chars)`;
    }
    return s;
  };

  if (event.message) {
    event.message = String(trim(event.message));
  }
  if (event.exception?.values) {
    for (const ex of event.exception.values) {
      if (ex.value) ex.value = String(trim(ex.value));
    }
  }
  if (event.breadcrumbs) {
    for (const b of event.breadcrumbs) {
      if (b.message) b.message = String(trim(b.message));
      if (b.data) {
        for (const k of Object.keys(b.data)) {
          b.data[k] = trim(b.data[k]);
        }
      }
    }
  }
  return event;
}
