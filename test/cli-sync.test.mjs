import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm, unlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { promisify } from 'node:util';

const execute = promisify(execFile);
const root = resolve(import.meta.dirname, '..');
const cli = resolve(root, 'bin/review-prototype.mjs');

test('syncs versioned assets once and then reports a no-op', async t => {
  const temporary = await mkdtemp(resolve(tmpdir(), 'review-prototype-sync-'));
  t.after(() => rm(temporary, { recursive: true, force: true }));
  const publicDirectory = resolve(temporary, 'public/review-prototype');

  const first = await execute(process.execPath, [cli, 'sync', '--public-dir', publicDirectory, '--format', 'json']);
  assert.equal(JSON.parse(first.stdout).changed, true);
  const manifest = JSON.parse(await readFile(resolve(publicDirectory, 'review-prototype.manifest.json'), 'utf8'));
  assert.equal(manifest.schemaVersion, 1);
  assert.equal(manifest.packageVersion, '0.2.4');
  assert.match(manifest.assets['review-prototype.js'], /^sha256-[a-f0-9]{64}$/);

  const second = await execute(process.execPath, [cli, 'sync', '--public-dir', publicDirectory, '--format', 'json']);
  assert.equal(JSON.parse(second.stdout).changed, false);

  await unlink(resolve(publicDirectory, 'review-prototype.js'));
  const repaired = await execute(process.execPath, [cli, 'sync', '--public-dir', publicDirectory, '--format', 'json']);
  assert.equal(JSON.parse(repaired.stdout).changed, true);
});
