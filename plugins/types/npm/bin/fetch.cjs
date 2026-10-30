#!/usr/bin/env node
/**
 * Puts the client's current plugin types (and the arkadia-plugin tools) into
 * ../latest. Runs on install and on `arkadia-plugin types`.
 *
 * Source: the tarball the client deploys next to itself, or
 * ARKADIA_PLUGIN_TYPES_URL - another URL or a local .tgz path, for testing
 * against a client you build yourself. When the download fails the previous
 * copy stays (the package ships one from the day it was published).
 */
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const DEFAULT_URL = 'https://delwing.github.io/arkadia-web-client-extension/arkadia-plugin-types.tgz';
const DIR = path.join(__dirname, '..', 'latest');

async function readTarball(source) {
  if (!/^https?:\/\//.test(source)) return fs.readFileSync(path.resolve(source));
  const res = await fetch(source, { cache: 'no-store', signal: AbortSignal.timeout(30000) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}

// Files under `dir`, relative to it.
function listFiles(dir, prefix = '') {
  return fs.readdirSync(path.join(dir, prefix), { withFileTypes: true }).flatMap(entry => {
    const rel = path.join(prefix, entry.name);
    return entry.isDirectory() ? listFiles(dir, rel) : [rel];
  });
}

// Copy the new files over DIR, then drop the ones the new version no longer
// has. DIR itself is never renamed or removed: on Windows an editor's file
// watcher or a virus scan holds folders open, and renaming one fails (EPERM).
function replaceDir(staging) {
  fs.cpSync(staging, DIR, { recursive: true, force: true });
  const fresh = new Set(listFiles(staging));
  for (const file of listFiles(DIR)) {
    if (!fresh.has(file)) fs.rmSync(path.join(DIR, file), { force: true });
  }
  try {
    fs.rmSync(staging, { recursive: true, force: true, maxRetries: 5 });
  } catch {
    // A held staging folder is harmless; the next run clears it first.
  }
}

async function fetchTypes() {
  const source = process.env.ARKADIA_PLUGIN_TYPES_URL || DEFAULT_URL;
  try {
    const tarball = await readTarball(source);
    const staging = `${DIR}.tmp`;
    fs.rmSync(staging, { recursive: true, force: true });
    fs.mkdirSync(staging, { recursive: true });
    fs.writeFileSync(path.join(staging, 'types.tgz'), tarball);
    execFileSync('tar', ['-xzf', 'types.tgz', '--strip-components=1'], { cwd: staging });
    fs.rmSync(path.join(staging, 'types.tgz'));
    replaceDir(staging);
    console.log(`Arkadia plugin types updated from ${source}`);
  } catch (error) {
    if (!fs.existsSync(path.join(DIR, 'index.d.ts'))) throw error;
    console.warn(`Arkadia plugin types not refreshed (${error.message}); keeping the previous copy.`);
  }
}

module.exports = { fetchTypes };

if (require.main === module) {
  fetchTypes().catch(error => {
    console.error(`Could not download Arkadia plugin types: ${error.message}`);
    process.exit(1);
  });
}
