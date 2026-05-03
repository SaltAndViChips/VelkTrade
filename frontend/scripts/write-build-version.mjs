import { mkdir, writeFile } from 'node:fs/promises';
import { execSync } from 'node:child_process';
import path from 'node:path';

function safeExec(command, fallback = '') {
  try {
    return execSync(command, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch {
    return fallback;
  }
}

const root = process.cwd();
const commit = safeExec('git rev-parse --short=12 HEAD', 'local');
const timestamp = new Date().toISOString();
const buildId = `${timestamp.replace(/[-:.TZ]/g, '').slice(0, 14)}-${commit}`;

const payload = {
  buildId,
  commit,
  builtAt: timestamp,
};

await mkdir(path.join(root, 'src'), { recursive: true });
await mkdir(path.join(root, 'public'), { recursive: true });

await writeFile(
  path.join(root, 'src', 'build-info.js'),
  `export const BUILD_INFO = ${JSON.stringify(payload, null, 2)};\n`,
  'utf8',
);

await writeFile(
  path.join(root, 'public', 'version.json'),
  `${JSON.stringify(payload, null, 2)}\n`,
  'utf8',
);

console.log(`Wrote frontend build version ${buildId}`);
