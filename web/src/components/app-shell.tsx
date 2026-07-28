import { ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';

import styles from './app-shell.module.css';

interface Props {
  title?: string;
  back?: boolean;
  rightSlot?: ReactNode;
  children: ReactNode;
}

// One shell for every signed-in screen. Warm header with the Reflect
// wordmark, an optional back button, and a right-hand slot for a
// screen-specific action (settings gear on Home, etc.).
export function AppShell({ title, back, rightSlot, children }: Props) {
  const navigate = useNavigate();
  return (
    <div className={styles.shell}>
      <header className={styles.header}>
        <div className={styles.headerLeft}>
          {back ? (
            <button
              type="button"
              className={styles.backBtn}
              onClick={() => navigate(-1)}
              aria-label="Go back"
            >
              <BackArrow />
            </button>
          ) : (
            <Link to="/" className={styles.brand} aria-label="Reflect home">
              Reflect
            </Link>
          )}
        </div>
        {title ? <h2 className={styles.title}>{title}</h2> : null}
        <div className={styles.headerRight}>{rightSlot}</div>
      </header>
      <main className={styles.main}>{children}</main>
    </div>
  );
}

function BackArrow() {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M15 18l-6-6 6-6" />
    </svg>
  );
}
