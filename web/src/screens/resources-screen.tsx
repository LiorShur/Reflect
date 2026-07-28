import { AppShell } from '../components/app-shell';
import { RESOURCES, DEFAULT_RESOURCE, ensureHttps } from '../lib/resources';
import styles from './resources-screen.module.css';

// S5 — regional safety resources. Reachable from:
//   - Settings → Support & safety
//   - Compose warning when a disclosure pattern hits (S7 light, Phase 2)
//
// Content is intentionally the same list mobile ships. DV specialist
// review must validate entries flagged TODO(dv-review) before this
// screen drives public-launch behavior.
export function ResourcesScreen() {
  const entries = [...Object.values(RESOURCES), DEFAULT_RESOURCE];

  return (
    <AppShell title="Support resources" back>
      <p className={styles.intro}>
        Reflect is a communication tool, not a substitute for professional care
        or crisis response. If you feel unsafe or need to talk to someone,
        please reach out to a service below.
      </p>

      <div className={styles.list}>
        {entries.map((r) => (
          <div key={r.region} className={styles.card}>
            <p className={styles.region}>{r.region}</p>
            <p className={styles.primary}>{r.primary}</p>
            {r.secondary ? (
              <a
                className={styles.link}
                href={ensureHttps(r.secondary)}
                target="_blank"
                rel="noreferrer"
              >
                {r.secondary}
              </a>
            ) : null}
          </div>
        ))}
      </div>

      <p className={styles.footnote}>
        Reflect does not detect abuse reliably. If you are in immediate danger,
        contact local emergency services.
      </p>
    </AppShell>
  );
}
