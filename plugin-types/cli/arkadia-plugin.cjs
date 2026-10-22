/**
 * `arkadia-plugin` - build, serve and scaffold an Arkadia Web Client plugin.
 *
 * Shipped inside the types tarball, so it updates with every client deploy;
 * the npm wrapper (@dargoth-client/plugin-types) only forwards to it. Runs in
 * the plugin's folder and reads the entry file from `plugin.json`.
 *
 *   arkadia-plugin dev [--port 5177] [--strict-port]
 *   arkadia-plugin build
 *   arkadia-plugin init
 *   arkadia-plugin skill
 */
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const { arkadiaHostUi } = require('../esbuild.cjs');

const DEFAULT_PORT = 5177;
const PORT_ATTEMPTS = 20;
const OUTDIR = 'dist';
const OUTFILE = 'plugin.js';
const CLIENT_URL = 'https://delwing.github.io/arkadia-web-client-extension/';
const ENTRY_CANDIDATES = ['plugin.ts', 'plugin.tsx', 'plugin.js', 'src/index.ts', 'src/index.tsx', 'index.ts'];

const CONTENT_TYPES = {
  '.js': 'text/javascript; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.mp3': 'audio/mpeg',
  '.ogg': 'audio/ogg',
  '.wav': 'audio/wav',
};

// A public page (the client) reaching a server on this machine: CORS plus
// Chrome's private-network opt-in, and never a cached copy.
const DEV_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Private-Network': 'true',
  'Cache-Control': 'no-store',
};

function loadEsbuild() {
  try {
    return require('esbuild');
  } catch {
    fail('esbuild is missing. Reinstall @arkadia/plugin-types (it brings esbuild along) or add esbuild to devDependencies.');
  }
}

function fail(message) {
  console.error(`arkadia-plugin: ${message}`);
  process.exit(1);
}

function parseArgs(argv) {
  const flags = {};
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (!arg.startsWith('--')) continue;
    const [key, inline] = arg.slice(2).split('=', 2);
    if (inline !== undefined) flags[key] = inline;
    else if (argv[i + 1] && !argv[i + 1].startsWith('--')) flags[key] = argv[++i];
    else flags[key] = true;
  }
  return flags;
}

function readManifest() {
  if (!fs.existsSync('plugin.json')) return undefined;
  try {
    return JSON.parse(fs.readFileSync('plugin.json', 'utf8'));
  } catch (e) {
    fail(`plugin.json is not valid JSON: ${e.message}`);
  }
}

function findEntry() {
  const declared = readManifest()?.entryPoint;
  if (declared) {
    if (!fs.existsSync(declared)) fail(`plugin.json names entryPoint "${declared}", but there is no such file.`);
    return declared;
  }
  const found = ENTRY_CANDIDATES.find(file => fs.existsSync(file));
  if (!found) fail('no entry file. Set "entryPoint" in plugin.json, or run `arkadia-plugin init`.');
  return found;
}

function buildOptions() {
  return {
    entryPoints: [findEntry()],
    bundle: true,
    format: 'esm',
    target: 'es2022',
    jsx: 'automatic',
    sourcemap: true,
    outfile: path.join(OUTDIR, OUTFILE),
    plugins: [arkadiaHostUi()],
    logLevel: 'info',
  };
}

async function build() {
  const esbuild = loadEsbuild();
  try {
    await esbuild.build(buildOptions());
  } catch {
    process.exit(1); // esbuild has already printed the errors
  }
}

/** Listen on `port`, or the next free one unless `strict`. */
function listen(server, port, strict) {
  return new Promise((resolve, reject) => {
    let attempt = 0;
    const tryPort = (candidate) => {
      const onError = (error) => {
        server.off('listening', onListening);
        if (error.code === 'EADDRINUSE' && !strict && ++attempt < PORT_ATTEMPTS) {
          tryPort(candidate + 1);
        } else {
          reject(error);
        }
      };
      const onListening = () => {
        server.off('error', onError);
        resolve(server.address().port);
      };
      server.once('error', onError);
      server.once('listening', onListening);
      server.listen(candidate);
    };
    tryPort(port);
  });
}

function createServer(streams) {
  const root = path.resolve(OUTDIR);
  return http.createServer((req, res) => {
    if (req.method === 'OPTIONS') {
      res.writeHead(204, {
        ...DEV_HEADERS,
        'Access-Control-Allow-Methods': 'GET',
        'Access-Control-Allow-Headers': '*',
      });
      res.end();
      return;
    }

    const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);

    // esbuild's live-reload protocol: the client reloads the plugin on `change`.
    if (pathname === '/esbuild') {
      res.writeHead(200, {
        ...DEV_HEADERS,
        'Content-Type': 'text/event-stream',
        Connection: 'keep-alive',
      });
      res.write(': connected\n\n');
      streams.add(res);
      req.on('close', () => streams.delete(res));
      return;
    }

    const file = path.join(root, pathname === '/' ? OUTFILE : pathname);
    if (!file.startsWith(root + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) {
      res.writeHead(404, { ...DEV_HEADERS, 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Not found');
      return;
    }
    res.writeHead(200, {
      ...DEV_HEADERS,
      'Content-Type': CONTENT_TYPES[path.extname(file).toLowerCase()] ?? 'application/octet-stream',
    });
    fs.createReadStream(file).pipe(res);
  });
}

async function dev(flags) {
  const esbuild = loadEsbuild();
  const requested = flags.port === undefined ? DEFAULT_PORT : Number(flags.port);
  if (!Number.isInteger(requested) || requested < 1 || requested > 65535) fail(`invalid --port: ${flags.port}`);
  const strict = flags['strict-port'] === true;

  const streams = new Set();
  const server = createServer(streams);
  let port;
  try {
    port = await listen(server, requested, strict);
  } catch (error) {
    if (error.code !== 'EADDRINUSE') throw error;
    fail(strict
      ? `port ${requested} is taken (--strict-port). Stop whatever uses it, or pick another --port.`
      : `ports ${requested}-${requested + PORT_ATTEMPTS - 1} are all taken. Pick another --port.`);
  }

  let firstBuild = true;
  const notify = {
    name: 'arkadia-live-reload',
    setup(build) {
      build.onEnd(result => {
        if (result.errors.length > 0) return;
        if (firstBuild) {
          firstBuild = false;
          return;
        }
        for (const stream of streams) stream.write('event: change\ndata: {}\n\n');
      });
    },
  };
  const options = buildOptions();
  const ctx = await esbuild.context({ ...options, plugins: [...options.plugins, notify] });
  await ctx.watch();

  // Some proxies drop an idle stream; a comment line keeps it open.
  setInterval(() => {
    for (const stream of streams) stream.write(': ping\n\n');
  }, 30000).unref();

  const url = `http://localhost:${port}/${OUTFILE}`;
  console.log('');
  console.log(`  Plugin:  ${url}`);
  console.log(`  Add it once in the client (Wtyczki -> Dodaj plugin -> Z adresu URL) or open:`);
  console.log(`           ${CLIENT_URL}?add-script=${encodeURIComponent(url)}`);
  console.log('  The client reloads the plugin after every rebuild.');
  if (port !== requested) {
    console.log('');
    console.log(`  Port ${requested} is taken, so this runs on ${port}. The client treats a new`);
    console.log('  address as a different plugin: add it again, and its saved data starts empty');
    console.log('  unless the plugin exports a stableId. Use --strict-port to fail instead.');
  }
  console.log('');

  const stop = async () => {
    for (const stream of streams) stream.end();
    server.close();
    await ctx.dispose();
    process.exit(0);
  };
  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);
}

const PLUGIN_TEMPLATE = (name) => `import type { PluginApi, PluginInfo } from '@arkadia/plugin-types';

const TAG = ${JSON.stringify(name.replace(/[^A-Za-z0-9]+/g, '-'))};
let pluginApi: PluginApi | undefined;

export async function init(api: PluginApi): Promise<PluginInfo> {
  pluginApi = api;

  api.triggers.register(/^Ktos przybywa\\.$/, (line) => line.prepend('>> '), TAG);

  return {
    name: ${JSON.stringify(name)},
    version: '1.0.0',
    description: '',
  };
}

export async function destroy(): Promise<void> {
  // Aliases, windows, menus and footer items go away on their own;
  // triggers, event listeners and timers are ours to remove.
  pluginApi?.triggers.removeByTag(TAG);
}
`;

const TSCONFIG = {
  compilerOptions: {
    target: 'ES2022',
    module: 'ESNext',
    moduleResolution: 'Bundler',
    jsx: 'react-jsx',
    strict: true,
    noEmit: true,
    skipLibCheck: true,
    lib: ['ES2022', 'DOM', 'DOM.Iterable'],
  },
  exclude: ['node_modules', 'dist'],
};

const SCRIPTS = {
  dev: 'arkadia-plugin dev',
  build: 'arkadia-plugin build',
  typecheck: 'tsc --noEmit',
  types: 'arkadia-plugin types',
};

function writeIfMissing(file, contents, created) {
  if (fs.existsSync(file)) return;
  fs.writeFileSync(file, contents);
  created.push(file);
}

function init() {
  const created = [];
  const name = path.basename(process.cwd());
  const entry = readManifest()?.entryPoint ?? 'plugin.ts';

  writeIfMissing('plugin.json', JSON.stringify({
    name,
    version: '1.0.0',
    author: '',
    description: '',
    entryPoint: entry,
  }, null, 2) + '\n', created);
  writeIfMissing(entry, PLUGIN_TEMPLATE(name), created);
  writeIfMissing('tsconfig.json', JSON.stringify(TSCONFIG, null, 2) + '\n', created);
  writeIfMissing('.gitignore', 'node_modules/\ndist/\n', created);

  const pkgFile = 'package.json';
  const pkg = fs.existsSync(pkgFile) ? JSON.parse(fs.readFileSync(pkgFile, 'utf8')) : { name, private: true };
  pkg.scripts = pkg.scripts ?? {};
  const added = Object.entries(SCRIPTS).filter(([key]) => !(key in pkg.scripts));
  for (const [key, value] of added) pkg.scripts[key] = value;
  if (added.length > 0 || !fs.existsSync(pkgFile)) {
    fs.writeFileSync(pkgFile, JSON.stringify(pkg, null, 2) + '\n');
    created.push(`${pkgFile} (scripts: ${added.map(([key]) => key).join(', ') || 'none'})`);
  }

  console.log(created.length > 0 ? `Created ${created.join(', ')}.` : 'Nothing to do - every file already exists.');
  console.log('Next: `npm run dev` (or `yarn dev`), then add the printed URL in the client.');
}

/** Copy the AI-assistant guide into .claude/skills, replacing an older copy. */
function skill() {
  const source = path.join(__dirname, '..', 'skills', 'arkadia-plugin');
  const target = path.join('.claude', 'skills', 'arkadia-plugin');
  if (!fs.existsSync(source)) fail('the skill is missing from the downloaded tools. Run `arkadia-plugin types`.');
  fs.rmSync(target, { recursive: true, force: true });
  fs.cpSync(source, target, { recursive: true });
  console.log(`Copied the plugin skill to ${target}. Run this again after \`arkadia-plugin types\` to refresh it.`);
}

const USAGE = `Usage: arkadia-plugin <command>

  dev [--port 5177] [--strict-port]
          Rebuild on change and serve dist/ on localhost. The client reloads
          the plugin after every rebuild. A taken port moves to the next free
          one; --strict-port fails instead.
  build   Bundle the plugin into dist/plugin.js.
  init    Create plugin.json, the entry file, tsconfig.json and npm scripts
          (never overwrites).
  types   Download the client's current plugin types (and these tools).
  skill   Copy the AI-assistant guide to .claude/skills/arkadia-plugin.`;

async function main(argv) {
  const [command, ...rest] = argv;
  const flags = parseArgs(rest);
  switch (command) {
    case 'dev':
      return dev(flags);
    case 'build':
      return build();
    case 'init':
      return init();
    case 'skill':
      return skill();
    case undefined:
    case 'help':
    case '--help':
    case '-h':
      console.log(USAGE);
      return;
    default:
      console.error(USAGE);
      process.exit(1);
  }
}

module.exports = { main };
