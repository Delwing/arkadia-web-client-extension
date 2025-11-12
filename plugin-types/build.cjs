/**
 * Build script for plugin-types tarball
 *
 * This script:
 * 1. Generates index.d.ts from src/client/PluginApi.ts (single source of truth)
 * 2. Creates a tarball for distribution
 */

const { execSync } = require('child_process');
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

  console.log('✓ Tarball created successfully!');
  console.log(`✓ Output: ${OUTPUT_FILE}`);

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
}
