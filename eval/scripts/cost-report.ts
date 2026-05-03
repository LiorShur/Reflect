// E6 — Cost monitoring "dashboard" (CLI-shaped for v1).
//
// Reads /meta/anthropic_cost/{YYYY-MM-DD} written by the cost-cap
// module on every Anthropic call. Prints a daily summary table to
// stdout. The full UI dashboard (per docs/v1-scope E6) lands later;
// this CLI is enough to monitor pre-beta.
//
// Auth via application-default credentials. Authenticate first:
//   gcloud auth application-default login
//
// Usage:
//   npx ts-node eval/scripts/cost-report.ts \
//     --db-url https://<project>-default-rtdb.firebaseio.com [--days 14]

import { applicationDefault, initializeApp } from 'firebase-admin/app';
import { getDatabase } from 'firebase-admin/database';

const DAILY_CAP_USD = 5;

function parseArgs(): { dbUrl: string; days: number } {
  const args = process.argv.slice(2);
  const dbUrlIdx = args.indexOf('--db-url');
  const dbUrl =
    dbUrlIdx >= 0 ? args[dbUrlIdx + 1] : process.env.FIREBASE_DATABASE_URL;
  if (!dbUrl) {
    console.error(
      'Missing --db-url <https://...firebaseio.com> (or FIREBASE_DATABASE_URL env var).',
    );
    process.exit(2);
  }
  const daysIdx = args.indexOf('--days');
  const days = daysIdx >= 0 ? parseInt(args[daysIdx + 1] ?? '14', 10) : 14;
  if (!Number.isFinite(days) || days <= 0) {
    console.error('--days must be a positive integer.');
    process.exit(2);
  }
  return { dbUrl, days };
}

function formatUsd(n: number): string {
  return `$${n.toFixed(4)}`;
}

function pad(s: string, width: number): string {
  return s + ' '.repeat(Math.max(0, width - s.length));
}

async function main(): Promise<void> {
  const { dbUrl, days } = parseArgs();
  initializeApp({ credential: applicationDefault(), databaseURL: dbUrl });

  const snap = await getDatabase().ref('meta/anthropic_cost').once('value');
  const all = (snap.val() as Record<string, number> | null) ?? {};

  // Build the last `days` keys (YYYY-MM-DD), latest first.
  const today = new Date();
  const keys: string[] = [];
  for (let i = 0; i < days; i++) {
    const d = new Date(today.getTime() - i * 24 * 60 * 60 * 1000);
    keys.push(d.toISOString().slice(0, 10));
  }

  let total = 0;
  let nonZeroDays = 0;
  let capHits = 0;
  const rows: string[] = [];
  rows.push(`${pad('Date', 12)}${pad('Spend', 14)}${pad('% of cap', 12)}Bar`);
  rows.push('-'.repeat(60));
  for (const k of keys) {
    const v = all[k] ?? 0;
    total += v;
    if (v > 0) nonZeroDays++;
    if (v >= DAILY_CAP_USD) capHits++;
    const pct = (v / DAILY_CAP_USD) * 100;
    const barLen = Math.min(20, Math.round((v / DAILY_CAP_USD) * 20));
    const bar = '█'.repeat(barLen) + '░'.repeat(20 - barLen);
    rows.push(
      `${pad(k, 12)}${pad(formatUsd(v), 14)}${pad(pct.toFixed(1) + '%', 12)}${bar}`,
    );
  }

  console.log(`Anthropic cost report — last ${days} days`);
  console.log(`Daily cap: ${formatUsd(DAILY_CAP_USD)}\n`);
  for (const row of rows) console.log(row);
  console.log('');
  console.log(`Total (window):        ${formatUsd(total)}`);
  console.log(`Active days:           ${nonZeroDays}/${days}`);
  console.log(
    `Avg / active day:      ${formatUsd(nonZeroDays === 0 ? 0 : total / nonZeroDays)}`,
  );
  console.log(`Cap-hit days:          ${capHits}`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
