import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { extractTriggerPatterns } from './extract-trigger-patterns.mjs';

// Syncs the special-exit follow triggers from upstream Arkadia scripts:
// trigger patterns come from Arkadia.xml, while the follow function itself
// (which rewrites the command based on the line or the current location)
// is copied verbatim and executed with lua-in-js at runtime.
//
// Usage:
//   node scripts/extract-follow-patterns.mjs <path-to-arkadia-repo>
//   node scripts/extract-follow-patterns.mjs --download

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.join(__dirname, '..');

const GITHUB_RAW_BASE = 'https://raw.githubusercontent.com/tjurczyk/arkadia/master';

const FOLLOW_FUNC = 'trigger_func_skrypty_ui_special_exits_follow';
const LUA_SOURCE = 'skrypty/ui/special_exits_follow.lua';
const PATTERNS_OUTPUT = 'src/client/scripts/follow_special_exits_patterns.json';
const LUA_OUTPUT = 'src/client/lua/follow/special_exits_follow.lua';

const downloadFlag = process.argv.includes('--download');
const repoPath = process.argv.slice(2).find(arg => arg !== '--download');

async function readUpstream(relativePath) {
    if (downloadFlag) {
        const url = `${GITHUB_RAW_BASE}/${relativePath}`;
        const response = await fetch(url);
        if (!response.ok) throw new Error(`Failed to download ${url}: ${response.status}`);
        return response.text();
    }
    return fs.readFileSync(path.join(repoPath, ...relativePath.split('/')), 'utf8');
}

function writeCrlf(relativePath, content) {
    const destPath = path.join(rootDir, ...relativePath.split('/'));
    fs.mkdirSync(path.dirname(destPath), { recursive: true });
    fs.writeFileSync(destPath, content.replace(/\r\n/g, '\n').replace(/\n/g, '\r\n'), 'utf8');
    console.log(`  -> ${relativePath}`);
}

async function main() {
    if (!downloadFlag && !repoPath) {
        console.error('Usage: node scripts/extract-follow-patterns.mjs <path-to-arkadia-repo> | --download');
        process.exit(1);
    }

    console.log(`Extracting ${FOLLOW_FUNC} triggers...`);
    const triggers = await extractTriggerPatterns(await readUpstream('Arkadia.xml'), FOLLOW_FUNC);
    if (triggers.length === 0) {
        throw new Error(`No triggers calling ${FOLLOW_FUNC} found — upstream has changed.`);
    }
    writeCrlf(PATTERNS_OUTPUT, JSON.stringify(triggers, null, 2) + '\n');

    console.log(`Copying ${LUA_SOURCE}...`);
    const lua = await readUpstream(LUA_SOURCE);
    if (!lua.includes(`function ${FOLLOW_FUNC}(`)) {
        throw new Error(`${LUA_SOURCE} no longer defines ${FOLLOW_FUNC} — upstream has changed.`);
    }
    writeCrlf(LUA_OUTPUT, lua);

    console.log(`Done (${triggers.length} triggers).`);
}

main().catch(err => {
    console.error(err);
    process.exit(1);
});
