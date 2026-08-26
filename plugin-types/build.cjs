/**
 * Build script for plugin-types tarball
 *
 * This script:
 * 1. Generates index.d.ts from src/client/PluginApi.ts (single source of truth)
 * 2. Creates a tarball for distribution
 */

const { execSync } = require('child_process');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const TYPES_DIR = __dirname;
const OUTPUT_DIR = path.join(TYPES_DIR, 'dist');
const OUTPUT_FILE = path.join(OUTPUT_DIR, 'arkadia-plugin-types.tgz');

console.log('📦 Building @arkadia/plugin-types tarball...');

// Step 1: Generate type definitions
console.log('');
console.log('Step 1: Generating type definitions...');
try {
  execSync('node generate-types.cjs', {
    cwd: TYPES_DIR,
    stdio: 'inherit'
  });
} catch (error) {
  console.error('✗ Error generating types:', error.message);
  process.exit(1);
}

// Step 1.5: Version the package by the *content* of what it ships.
//
// This needs to satisfy two opposing requirements. The version must change
// whenever the types change, or Yarn serves a stale package from its cache
// (keyed by name@version) and consumers silently compile against old types.
// But it must NOT change otherwise: the tarball is published to a fixed URL,
// and consumers pin its integrity hash in their lockfile, so a version that
// moves on every build breaks `yarn install --frozen-lockfile` for them after
// any unrelated release.
//
// A hash of the shipped files gives both — a new version exactly when, and
// only when, the content differs. (This replaced a build timestamp, which
// changed on every deploy and broke pinned consumers.)
const pkgPath = path.join(TYPES_DIR, 'package.json');
const pkgJson = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
const originalVersion = pkgJson.version;

// package.json itself is excluded: it carries the version we are computing.
const contentHash = crypto.createHash('sha256');
for (const file of ['index.d.ts', 'README.md'].sort()) {
  const filePath = path.join(TYPES_DIR, file);
  if (!fs.existsSync(filePath)) continue;
  contentHash.update(file);
  contentHash.update(fs.readFileSync(filePath));
}
pkgJson.version = `1.0.0-${contentHash.digest('hex').slice(0, 12)}`;
fs.writeFileSync(pkgPath, JSON.stringify(pkgJson, null, 2) + '\n');
console.log(`✓ Set version to ${pkgJson.version} (from content)`);

console.log('');
console.log('Step 2: Creating tarball...');

// Create dist directory if it doesn't exist
if (!fs.existsSync(OUTPUT_DIR)) {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
}

try {
  // Create tarball using npm pack
  execSync('npm pack', {
    cwd: TYPES_DIR,
    stdio: 'inherit'
  });

  // Find the generated tarball (npm pack creates it with a specific name)
  const files = fs.readdirSync(TYPES_DIR);
  const tarball = files.find(f => f.endsWith('.tgz'));

  if (!tarball) {
    throw new Error('Tarball not found after npm pack');
  }

  // Move to dist directory with consistent name
  const sourcePath = path.join(TYPES_DIR, tarball);
  fs.renameSync(sourcePath, OUTPUT_FILE);

  // Also publish under the content-hashed name. That URL is immutable: its
  // bytes can never change, so a consumer pinning it in a lockfile is safe
  // across every future release. The fixed name above stays as "latest" for
  // anyone who would rather track the current types.
  const versionedFile = path.join(OUTPUT_DIR, `arkadia-plugin-types-${pkgJson.version}.tgz`);
  fs.copyFileSync(OUTPUT_FILE, versionedFile);

  console.log('✓ Tarball created successfully!');
  console.log(`✓ Output:    ${OUTPUT_FILE}`);
  console.log(`✓ Immutable: ${versionedFile}`);

  // Show tarball size
  const stats = fs.statSync(OUTPUT_FILE);
  const sizeKB = (stats.size / 1024).toFixed(2);
  console.log(`✓ Size: ${sizeKB} KB`);

  // List contents (skip on Windows due to tar issues with paths)
  if (process.platform !== 'win32') {
    try {
      console.log('\nPackage contents:');
      execSync(`tar -tzf "${OUTPUT_FILE}"`, { stdio: 'inherit' });
    } catch (e) {
      // Ignore tar listing errors
    }
  }

} catch (error) {
  console.error('✗ Error creating tarball:', error.message);
  process.exit(1);
} finally {
  // Restore original version in package.json
  pkgJson.version = originalVersion;
  fs.writeFileSync(pkgPath, JSON.stringify(pkgJson, null, 2) + '\n');
}
