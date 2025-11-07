/**
 * Express server do serwowania przykładowych pluginów
 *
 * Serwuje skompilowane wersje .js przykładowych pluginów TypeScript
 * Pozwala na łatwe testowanie pluginów lokalnie przed wdrożeniem
 */

const express = require('express');
const path = require('path');
const { execSync } = require('child_process');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3030;

// Katalogi
const EXAMPLES_DIR = __dirname;
const BUILD_DIR = path.join(EXAMPLES_DIR, 'dist');
const TYPES_DIR = path.join(__dirname, '..', 'plugin-types');
const TYPES_DIST_DIR = path.join(TYPES_DIR, 'dist');

// Upewnij się że katalog dist istnieje
if (!fs.existsSync(BUILD_DIR)) {
  fs.mkdirSync(BUILD_DIR, { recursive: true });
}

// Kompiluj pluginy przy starcie
console.log('Kompilowanie przykładowych pluginów...');
try {
  execSync('npm run build:examples', { cwd: path.join(__dirname, '..'), stdio: 'inherit' });
  console.log('✓ Pluginy skompilowane pomyślnie');
} catch (error) {
  console.error('✗ Błąd podczas kompilacji pluginów:', error.message);
  process.exit(1);
}

// Buduj tarball z typami
console.log('\nBudowanie pakietu z typami...');
try {
  execSync('npm run build:types', { cwd: path.join(__dirname, '..'), stdio: 'inherit' });
  console.log('✓ Pakiet z typami zbudowany pomyślnie');
} catch (error) {
  console.error('✗ Błąd podczas budowania pakietu z typami:', error.message);
  process.exit(1);
}

// CORS - pozwól na ładowanie z dowolnego origin
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type');
  next();
});

// Serwuj skompilowane pluginy z content-type application/javascript
app.use('/plugins', express.static(BUILD_DIR, {
  setHeaders: (res, filePath) => {
    if (filePath.endsWith('.js')) {
      res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
    }
  }
}));

// Serwuj tarball z typami
app.use('/types', express.static(TYPES_DIST_DIR, {
  setHeaders: (res, filePath) => {
    if (filePath.endsWith('.tgz')) {
      res.setHeader('Content-Type', 'application/gzip');
      res.setHeader('Content-Disposition', 'attachment; filename="arkadia-plugin-types.tgz"');
    }
  }
}));

// Endpoint listujący dostępne pluginy
app.get('/plugins', (req, res) => {
  fs.readdir(BUILD_DIR, (err, files) => {
    if (err) {
      return res.status(500).json({ error: 'Nie można odczytać katalogu pluginów' });
    }

    const plugins = files
      .filter(file => file.endsWith('.js'))
      .map(file => ({
        name: file.replace('.js', ''),
        url: `http://localhost:${PORT}/plugins/${file}`,
        file: file
      }));

    res.json({
      plugins,
      count: plugins.length,
      instructions: 'Skopiuj URL i dodaj w sekcji Skryptów w kliencie Arkadia Web'
    });
  });
});

// Strona główna z listą pluginów
app.get('/', (req, res) => {
  fs.readdir(BUILD_DIR, (err, files) => {
    if (err) {
      return res.status(500).send('Błąd serwera');
    }

    const plugins = files.filter(file => file.endsWith('.js'));

    res.send(`
<!DOCTYPE html>
<html lang="pl">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Serwer Przykładowych Pluginów - Arkadia</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      max-width: 800px;
      margin: 40px auto;
      padding: 20px;
      line-height: 1.6;
      background: #f5f5f5;
    }
    .container {
      background: white;
      padding: 30px;
      border-radius: 8px;
      box-shadow: 0 2px 4px rgba(0,0,0,0.1);
    }
    h1 {
      color: #333;
      border-bottom: 3px solid #4CAF50;
      padding-bottom: 10px;
    }
    .plugin {
      background: #f9f9f9;
      border-left: 4px solid #4CAF50;
      padding: 15px;
      margin: 15px 0;
      border-radius: 4px;
    }
    .plugin-name {
      font-weight: bold;
      color: #2c3e50;
      margin-bottom: 8px;
    }
    .plugin-url {
      background: #fff;
      padding: 8px;
      border: 1px solid #ddd;
      border-radius: 4px;
      font-family: monospace;
      font-size: 13px;
      word-break: break-all;
      cursor: pointer;
      transition: background 0.2s;
    }
    .plugin-url:hover {
      background: #e8f5e9;
    }
    .copy-btn {
      background: #4CAF50;
      color: white;
      border: none;
      padding: 8px 16px;
      border-radius: 4px;
      cursor: pointer;
      margin-top: 8px;
      font-size: 14px;
    }
    .copy-btn:hover {
      background: #45a049;
    }
    .copy-btn:active {
      background: #3d8b40;
    }
    .instructions {
      background: #e3f2fd;
      border-left: 4px solid #2196F3;
      padding: 15px;
      margin: 20px 0;
      border-radius: 4px;
    }
    .status {
      color: #4CAF50;
      font-weight: bold;
    }
    code {
      background: #f4f4f4;
      padding: 2px 6px;
      border-radius: 3px;
      font-family: monospace;
    }
  </style>
</head>
<body>
  <div class="container">
    <h1>🔌 Serwer Przykładowych Pluginów</h1>

    <div class="instructions">
      <strong>Jak użyć:</strong>
      <ol>
        <li>Kliknij "Kopiuj URL" przy wybranym pluginie</li>
        <li>Otwórz klienta Arkadia Web</li>
        <li>Kliknij przycisk "Skrypty"</li>
        <li>Wklej skopiowany URL</li>
        <li>Kliknij "Dodaj"</li>
      </ol>
    </div>

    <p class="status">✓ Serwer działa na porcie ${PORT}</p>
    <p>Dostępne pluginy: <strong>${plugins.length}</strong></p>

    ${plugins.map(file => {
      const name = file.replace('.js', '');
      const url = `http://localhost:${PORT}/plugins/${file}`;
      const description = getPluginDescription(name);

      return `
        <div class="plugin">
          <div class="plugin-name">${name}</div>
          ${description ? `<p style="color: #666; font-size: 14px;">${description}</p>` : ''}
          <div class="plugin-url" onclick="copyToClipboard('${url}', this)">${url}</div>
          <button class="copy-btn" onclick="copyToClipboard('${url}', this)">📋 Kopiuj URL</button>
        </div>
      `;
    }).join('')}

    <div style="margin-top: 30px; padding: 20px; background: #fff3cd; border-left: 4px solid #ffc107; border-radius: 4px;">
      <h3 style="margin-top: 0; color: #856404;">📦 Typy TypeScript dla Pluginów</h3>
      <p style="color: #856404; margin-bottom: 10px;">
        Aby uzyskać pełne wsparcie TypeScript (autocomplete, sprawdzanie typów) podczas tworzenia pluginów,
        zainstaluj pakiet z definicjami typów:
      </p>
      <div style="background: white; padding: 10px; border-radius: 4px; margin: 10px 0;">
        <code style="display: block; font-family: monospace; color: #333;">
          npm install http://localhost:${PORT}/types/arkadia-plugin-types.tgz
        </code>
      </div>
      <p style="color: #856404; font-size: 13px; margin-bottom: 5px;">
        <strong>Lub pobierz bezpośrednio:</strong>
      </p>
      <button class="copy-btn" style="margin-top: 0;" onclick="window.open('http://localhost:${PORT}/types/arkadia-plugin-types.tgz')">
        📥 Pobierz pakiet typów
      </button>
      <p style="color: #666; font-size: 13px; margin-top: 10px;">
        Po zainstalowaniu możesz importować typy: <code>import type Client from '@arkadia/plugin-types';</code>
      </p>
    </div>

    <div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #ddd; color: #666; font-size: 14px;">
      <p>💡 <strong>Wskazówka:</strong> Możesz edytować pliki <code>.ts</code> w katalogu <code>examples/</code>
      i zrestartować serwer aby zobaczyć zmiany.</p>
      <p>📚 <strong>Dokumentacja:</strong> Zobacz <code>docs/PLUGINS.md</code> dla pełnej dokumentacji API pluginów.</p>
    </div>
  </div>

  <script>
    function copyToClipboard(text, element) {
      navigator.clipboard.writeText(text).then(() => {
        const originalText = element.textContent;
        element.textContent = '✓ Skopiowano!';
        element.style.background = '#e8f5e9';
        setTimeout(() => {
          element.textContent = originalText;
          element.style.background = '';
        }, 2000);
      }).catch(err => {
        alert('Nie udało się skopiować: ' + err);
      });
    }

    function getPluginDescription(name) {
      const descriptions = {
        'simple-highlighter-plugin': 'Prosty plugin podświetlający wybrane słowa kolorami',
        'example-plugin': 'Kompleksowy przykład demonstrujący różne funkcje',
        'combat-alert-plugin': 'Plugin do śledzenia statystyk walki z alarmami'
      };
      return descriptions[name] || '';
    }
  </script>
</body>
</html>
    `);
  });
});

// Obsługa błędów
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).send('Coś poszło nie tak!');
});

// Start serwera
app.listen(PORT, () => {
  console.log(`
╔═══════════════════════════════════════════════════════════╗
║  🚀 Serwer Przykładowych Pluginów Arkadia                ║
╠═══════════════════════════════════════════════════════════╣
║  URL:     http://localhost:${PORT}                           ║
║  Pluginy: http://localhost:${PORT}/plugins                   ║
║  Typy:    http://localhost:${PORT}/types/arkadia-plugin-types.tgz║
║  API:     http://localhost:${PORT}/plugins (JSON)            ║
╠═══════════════════════════════════════════════════════════╣
║  Otwórz http://localhost:${PORT} w przeglądarce              ║
║  aby zobaczyć listę dostępnych pluginów i typów           ║
╚═══════════════════════════════════════════════════════════╝
  `);
});

// Funkcja pomocnicza do opisu pluginów
function getPluginDescription(name) {
  const descriptions = {
    'simple-highlighter-plugin': 'Prosty plugin podświetlający wybrane słowa kolorami',
    'example-plugin': 'Kompleksowy przykład demonstrujący różne funkcje',
    'combat-alert-plugin': 'Plugin do śledzenia statystyk walki z alarmami'
  };
  return descriptions[name] || '';
}

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\n👋 Zamykanie serwera...');
  process.exit(0);
});
