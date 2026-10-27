/**
 * Starts the app the fast way: the production build on port 3001.
 *
 * `npm run serve` builds first only when there is no build yet or any source file is newer than it, then starts the server.
 * `npm run dev` compiles every page on its first visit (seconds to minutes each on a small machine), which is what makes
 * navigation feel slow; this does not. Do not run `npm run dev` and a production build against the same .next folder.
 *
 *   npm run serve               build if needed, then start on 0.0.0.0:3001
 *   npm run serve -- --rebuild  force a fresh build first
 */
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, readdirSync, rmSync, statSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();
const shell = process.platform === 'win32';
const forced = process.argv.includes('--rebuild');

function newest(path) {
  let latest = 0;
  for (const entry of readdirSync(path, { withFileTypes: true })) {
    if (['node_modules', '.next', '.git', 'storage', 'scripts', 'docs'].includes(entry.name)) continue;
    if (/\.(md|log|sql|txt)$/i.test(entry.name)) continue;
    const full = join(path, entry.name);
    latest = Math.max(latest, entry.isDirectory() ? newest(full) : statSync(full).mtimeMs);
  }
  return latest;
}

const buildId = join(root, '.next', 'BUILD_ID');
const stale = forced || !existsSync(buildId) || newest(root) > statSync(buildId).mtimeMs;

if (stale) {
  console.log(forced ? 'Rebuilding the production build...' : 'The production build is missing or older than the source. Building (a few minutes)...');
  rmSync(join(root, '.next'), { recursive: true, force: true });
  const build = spawnSync('npx', ['next', 'build'], { stdio: 'inherit', shell });
  if (build.status !== 0) {
    console.error('The build failed, so the server was not started.');
    process.exit(build.status ?? 1);
  }
} else {
  console.log('The production build is up to date.');
}

console.log('Starting on http://localhost:3001 ...');
const server = spawn('npx', ['next', 'start', '-H', '0.0.0.0', '-p', '3001'], { stdio: 'inherit', shell });
server.on('exit', (code) => process.exit(code ?? 0));
