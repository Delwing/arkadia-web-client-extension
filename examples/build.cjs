/**
 * Build script dla przykładowych pluginów
 * Kompiluje pliki .ts do .js używając esbuild
 */

const esbuild = require('esbuild');
const fs = require('fs');
const path = require('path');

const EXAMPLES_DIR = __dirname;
const BUILD_DIR = path.join(EXAMPLES_DIR, 'dist');

// Utwórz katalog dist jeśli nie istnieje
if (!fs.existsSync(BUILD_DIR)) {
  fs.mkdirSync(BUILD_DIR, { recursive: true });
}

// Znajdź wszystkie pliki .ts pluginów (pomijając pliki konfiguracyjne)
const pluginFiles = fs.readdirSync(EXAMPLES_DIR)
  .filter(file => file.endsWith('-plugin.ts'))
  .map(file => path.join(EXAMPLES_DIR, file));

if (pluginFiles.length === 0) {
  console.log('⚠️  Nie znaleziono plików pluginów do kompilacji');
  process.exit(0);
}

console.log(`📦 Kompilowanie ${pluginFiles.length} pluginów...`);

// Opcje esbuild
const buildOptions = {
  entryPoints: pluginFiles,
  bundle: false, // Nie bundluj, pozostaw jako osobne pliki
  outdir: BUILD_DIR,
  format: 'esm', // ES modules
  platform: 'browser',
  target: 'es2020',
  sourcemap: false,
  minify: false, // Nie minifikuj dla łatwiejszego debugowania
  loader: {
    '.ts': 'ts',
  },
  logLevel: 'info',
};

// Zbuduj pluginy
esbuild.build(buildOptions)
  .then(() => {
    console.log('✓ Pluginy skompilowane pomyślnie!');
    console.log(`✓ Wyjście: ${BUILD_DIR}`);

    // Wylistuj skompilowane pliki
    const compiledFiles = fs.readdirSync(BUILD_DIR);
    console.log('\nSkompilowane pluginy:');
    compiledFiles.forEach(file => {
      console.log(`  - ${file}`);
    });
  })
  .catch((error) => {
    console.error('✗ Błąd podczas kompilacji:', error);
    process.exit(1);
  });
