// Copies the workspace-root /prompts directory into functions/prompts so
// the deployed Cloud Functions bundle can resolve them at runtime.
// firebase deploy only packages the functions/ directory, so the
// canonical /prompts at repo root needs to be staged here at build
// time.
//
// Output is gitignored — see functions/.gitignore.

const fs = require('fs');
const path = require('path');

const src = path.resolve(__dirname, '..', '..', 'prompts');
const dst = path.resolve(__dirname, '..', 'prompts');

if (!fs.existsSync(src)) {
  console.error(`copy-prompts: source missing at ${src}`);
  process.exit(1);
}

if (fs.existsSync(dst)) {
  fs.rmSync(dst, { recursive: true, force: true });
}
fs.cpSync(src, dst, { recursive: true });

const files = fs.readdirSync(dst).filter((f) => f.endsWith('.yaml'));
console.log(`copy-prompts: ${files.length} prompt(s) → ${dst}`);
