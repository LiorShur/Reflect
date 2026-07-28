import { tryInitFirebase } from './firebase';
import styles from './App.module.css';

// Scaffold placeholder — Commit 2 replaces this with the auth-gated
// router (SignIn ↔ session screens).
export function App() {
  const fb = tryInitFirebase();

  return (
    <div className={styles.shell}>
      <main className={styles.hero}>
        <h1 className={styles.title}>Reflect</h1>
        <p className={styles.tagline}>A calmer way to hear each other.</p>
        <div className={styles.card}>
          {fb ? (
            <p className={styles.ready}>
              Firebase configured. Ready to sign in.
            </p>
          ) : (
            <>
              <h4 className={styles.cardHeading}>Almost ready</h4>
              <p className={styles.cardBody}>
                Copy <code>.env.example</code> to <code>.env.local</code> and
                fill in your Firebase project keys, then reload.
              </p>
            </>
          )}
        </div>
      </main>
    </div>
  );
}
