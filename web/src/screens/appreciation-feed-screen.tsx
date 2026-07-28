import { AppShell } from '../components/app-shell';
import { useAuthState } from '../hooks/use-auth-state';
import {
  useAppreciationFeed,
  type AppreciationEntry,
} from '../hooks/use-appreciation-feed';
import styles from './appreciation-feed-screen.module.css';

// R2 — Read-only feed of received appreciations from the last 90 days,
// newest first. Reactions (heart / thanks / more) are deferred.
export function AppreciationFeedScreen() {
  const auth = useAuthState();
  const uid = auth.status === 'ready' && auth.user ? auth.user.uid : null;
  const view = useAppreciationFeed(uid);

  return (
    <AppShell title="Appreciations" back>
      {!view.ready ? (
        <p className={styles.helper}>Loading…</p>
      ) : view.entries.length === 0 ? (
        <div className={styles.empty}>
          <h2 className={styles.emptyHeading}>No appreciations yet</h2>
          <p className={styles.emptyBody}>
            When your partner sends one, it will land here.
          </p>
        </div>
      ) : (
        <ol className={styles.list}>
          {view.entries.map((entry) => (
            <li key={entry.id} className={styles.item}>
              <EntryCard entry={entry} />
            </li>
          ))}
        </ol>
      )}
    </AppShell>
  );
}

function EntryCard({ entry }: { entry: AppreciationEntry }) {
  const date = entry.created_at ? formatDate(new Date(entry.created_at)) : '';
  return (
    <div className={styles.card}>
      <p className={styles.cardDate}>{date}</p>
      <p className={styles.cardContent}>{entry.content}</p>
      {entry.tags && entry.tags.length > 0 ? (
        <div className={styles.tagRow}>
          {entry.tags.map((tag) => (
            <span key={tag} className={styles.tag}>
              {tag}
            </span>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function formatDate(d: Date): string {
  const today = new Date();
  const sameDay =
    d.getFullYear() === today.getFullYear() &&
    d.getMonth() === today.getMonth() &&
    d.getDate() === today.getDate();
  if (sameDay) {
    return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  }
  return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
}
