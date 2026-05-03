// One-time migration for the D3 rules refactor.
//
// Moves /sessions/{sid}/current_turn/{speaker_draft,listener_draft}
// to /sessions/{sid}/{speaker_draft,listener_draft}. The new locations
// have role-only .read in security rules; the old nested paths leaked
// reads via the parent's permissive .read (now removed). Without this
// migration, any in-flight session at deploy time has its drafts
// orphaned (server reads them at the new path and finds nothing).
//
// Idempotent: re-running on an already-migrated session is a no-op
// (the script only acts when the old nested paths still hold data).
//
// Usage (from repo root):
//   # Dry run — prints what it would change, writes nothing:
//   npx ts-node functions/scripts/migrate-drafts.ts --dry-run \
//     --db-url https://<project>-default-rtdb.firebaseio.com
//
//   # Live run:
//   npx ts-node functions/scripts/migrate-drafts.ts \
//     --db-url https://<project>-default-rtdb.firebaseio.com
//
// Auth: uses application-default credentials. Authenticate first via
//   gcloud auth application-default login
// or by setting GOOGLE_APPLICATION_CREDENTIALS to a service-account
// JSON path. The service account / user needs RTDB admin access on
// the target project.

import { applicationDefault, initializeApp } from 'firebase-admin/app';
import { getDatabase } from 'firebase-admin/database';

interface Args {
  dryRun: boolean;
  dbUrl: string;
}

function parseArgs(): Args {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const dbUrlIdx = args.indexOf('--db-url');
  const dbUrl =
    dbUrlIdx >= 0 ? args[dbUrlIdx + 1] : process.env.FIREBASE_DATABASE_URL;
  if (!dbUrl) {
    console.error(
      'Missing --db-url <https://...firebaseio.com> (or FIREBASE_DATABASE_URL env var).',
    );
    process.exit(2);
  }
  return { dryRun, dbUrl };
}

interface CurrentTurnNode {
  speaker_draft?: unknown;
  listener_draft?: unknown;
  [key: string]: unknown;
}

interface SessionNode {
  current_turn?: CurrentTurnNode;
  speaker_draft?: unknown;
  listener_draft?: unknown;
  [key: string]: unknown;
}

async function main(): Promise<void> {
  const { dryRun, dbUrl } = parseArgs();

  initializeApp({
    credential: applicationDefault(),
    databaseURL: dbUrl,
  });
  const db = getDatabase();

  console.log(
    `Migrating drafts on ${dbUrl}${dryRun ? ' (DRY RUN — no writes)' : ''}…`,
  );

  const snap = await db.ref('sessions').once('value');
  const sessions = (snap.val() as Record<string, SessionNode> | null) ?? {};
  const sids = Object.keys(sessions);

  let migrated = 0;
  let alreadyMigrated = 0;
  let nothingToMove = 0;
  let failed = 0;

  for (const sid of sids) {
    const session = sessions[sid] ?? {};
    const ct = session.current_turn ?? {};
    const oldSpeakerDraft = ct.speaker_draft;
    const oldListenerDraft = ct.listener_draft;

    if (oldSpeakerDraft === undefined && oldListenerDraft === undefined) {
      // Already migrated (or never had drafts to begin with). Distinguish
      // for the summary: if a sibling exists, it's a prior migration;
      // if not, the session simply hasn't reached IN_TURN.
      if (
        session.speaker_draft !== undefined ||
        session.listener_draft !== undefined
      ) {
        alreadyMigrated++;
      } else {
        nothingToMove++;
      }
      continue;
    }

    // Build a single multi-path update so the move is atomic. Even
    // though the new sibling write and the old-path null are separate
    // descendants, RTDB applies them together.
    const update: Record<string, unknown> = {};
    if (oldSpeakerDraft !== undefined) {
      update[`sessions/${sid}/speaker_draft`] = oldSpeakerDraft;
      update[`sessions/${sid}/current_turn/speaker_draft`] = null;
    }
    if (oldListenerDraft !== undefined) {
      update[`sessions/${sid}/listener_draft`] = oldListenerDraft;
      update[`sessions/${sid}/current_turn/listener_draft`] = null;
    }

    const moves: string[] = [];
    if (oldSpeakerDraft !== undefined) moves.push('speaker_draft');
    if (oldListenerDraft !== undefined) moves.push('listener_draft');

    console.log(`  [${sid}] moving: ${moves.join(', ')}`);

    if (dryRun) {
      migrated++;
      continue;
    }

    try {
      await db.ref().update(update);
      migrated++;
    } catch (err) {
      console.error(
        `  [${sid}] FAILED:`,
        err instanceof Error ? err.message : String(err),
      );
      failed++;
    }
  }

  console.log('\nDone.');
  console.log(`  Migrated:           ${migrated}`);
  console.log(`  Already migrated:   ${alreadyMigrated}`);
  console.log(`  Nothing to move:    ${nothingToMove}`);
  console.log(`  Failed:             ${failed}`);
  console.log(`  Total scanned:      ${sids.length}`);
  if (dryRun) {
    console.log('\n(DRY RUN — no writes were performed.)');
  }

  if (failed > 0) process.exit(1);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
