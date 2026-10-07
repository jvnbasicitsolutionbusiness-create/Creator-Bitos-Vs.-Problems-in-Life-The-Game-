/**
 * check.js — runs the full test suite.
 *
 *   node tools/check.js            # engine + scenes + storage
 *   node tools/check.js --with-api # also tests the live server (must be up)
 */
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const withApi = process.argv.includes('--with-api');

const suites = [
  ['Combat engine', 'smoketest.js'],
  ['Scenes (headless canvas)', 'scene-smoke.js'],
  ['Storage & auth', 'store-test.js'],
  ['Photosensitivity guard', 'flash-test.js'],
  ['Static deployment (no backend)', 'static-test.js']
];
if (withApi) suites.push(['Live API', 'api-test.js']);

function run(file) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [path.join(HERE, file)], { stdio: 'inherit' });
    child.on('exit', (code) => resolve(code === 0));
  });
}

let failed = 0;
for (const [name, file] of suites) {
  console.log(`\n>>> ${name}`);
  const ok = await run(file);
  if (!ok) failed += 1;
}

console.log('\n===============================================================');
if (failed === 0) {
  console.log('  ALL SUITES PASSED');
} else {
  console.log(`  ${failed} suite(s) failed`);
}
console.log('===============================================================');
process.exit(failed === 0 ? 0 : 1);
