import * as Sentry from '@sentry/react';

// Sentry init. No-op when VITE_SENTRY_DSN is not set, so the app runs
// identically in dev environments without Sentry configured.
//
// CLAUDE.md safety rail #2 alignment: we do NOT set sendDefaultPii and
// any accidental raw-text logging (from an uncaught exception message
// that quotes the compose text) is caught by beforeSend and trimmed
// to a length + hash marker rather than forwarded verbatim.

const MAX_STRING_LEN = 200;

let initialized = false;

function trim(s: unknown): unknown {
  if (typeof s === 'string' && s.length > MAX_STRING_LEN) {
    return `${s.slice(0, MAX_STRING_LEN)}… (trimmed ${s.length - MAX_STRING_LEN} chars)`;
  }
  return s;
}

export function initSentry(): void {
  if (initialized) return;
  const dsn = import.meta.env.VITE_SENTRY_DSN;
  if (!dsn) return; // silent no-op — no DSN = no Sentry

  Sentry.init({
    dsn,
    environment: import.meta.env.VITE_SENTRY_ENV ?? 'pilot',
    tracesSampleRate: 0.1,
    sendDefaultPii: false,
    beforeSend(event) {
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
    },
  });
  initialized = true;
}

export const ErrorBoundary = Sentry.ErrorBoundary;
export const captureException = Sentry.captureException;
export const captureMessage = Sentry.captureMessage;
