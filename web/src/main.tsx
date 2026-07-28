import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import './styles/global.css';
import { App } from './App';
import { initSentry, ErrorBoundary } from './sentry';

initSentry();

const rootEl = document.getElementById('root');
if (!rootEl) throw new Error('#root element missing from index.html');

createRoot(rootEl).render(
  <StrictMode>
    <ErrorBoundary fallback={<FallbackScreen />}>
      <App />
    </ErrorBoundary>
  </StrictMode>,
);

// Kept in this file rather than a component/ file for now — the whole
// scaffold is intentionally tiny. Commit 3 introduces the shared
// components/ layer.
function FallbackScreen() {
  return (
    <div style={{ padding: '2rem', textAlign: 'center' }}>
      <h1>Something went wrong.</h1>
      <p style={{ color: 'var(--color-text-muted)' }}>
        Please reload the page. If this keeps happening, tell us in Settings →
        Send feedback.
      </p>
    </div>
  );
}
