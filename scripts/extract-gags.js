import fs from 'fs';
import path from 'path';
import xml2js from 'xml2js';
import xpath from 'xml2js-xpath';
import { fileURLToPath } from 'url';
import { Listr } from 'listr2';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.join(__dirname, '..');

const downloadFlag = process.argv.includes('--download');
const repoPath = process.argv.find(arg => arg !== '--download' && process.argv.indexOf(arg) > 1) || '.';

const GITHUB_RAW_BASE = 'https://raw.githubusercontent.com/tjurczyk/arkadia/master';
const GITHUB_API_BASE = 'https://api.github.com/repos/tjurczyk/arkadia/contents';

const funcCalls = {};
const funcRe = /^function\s+(trigger_func_[^(]+)\s*\(/;
const callRe = /scripts\.gags:(gag_own_spec|gag_prefix|gag_spec|gag)\(([^)]*)\)/;

const FILTERED_SCRIPTS = [
    'trigger_func_skrypty_ui_gags_color_color_other_zabiles_color',
    'trigger_func_skrypty_ui_gags_color_color_other_zabil_color',
];

// Fixes for upstream lua files that need patching after download.
// Each entry specifies an upstream line to find and what to replace it with.
// If the upstream line is not found (and the fix isn't already applied), the script
// will emit a loud warning — the upstream source has changed and the fix needs review.
const LUA_FIXES = [
    {
        file: 'color_innych_spece/bar/ktos_spec.lua',
        description: 'Adds matches["stun"] guard before string.len()',
        upstream: '    if string.len(matches["stun"]) > 0 then',
        fixed: '    if matches["stun"] and string.len(matches["stun"]) > 0 then',
    },
    {
        file: 'color_innych_spece/str.lua',
        description: 'Remove init+plain args from dmg:find() — lua-in-js does not support boolean plain flag',
        upstream: '    elseif dmg:find("lecz impet uderzenia", 1, true) then value = 0',
        fixed: '    elseif dmg:find("lecz impet uderzenia") then value = 0',
    },
    {
        file: 'color_moje_spece/bar.lua',
        description: 'Adds matches["stun"] guard before string.len()',
        upstream: '    if string.len(matches["stun"]) > 0 then',
        fixed: '    if matches["stun"] and string.len(matches["stun"]) > 0 then',
    },
];

async function listFilesRecursive(apiUrl, relativePath = '') {
    const response = await fetch(apiUrl);
    if (!response.ok) throw new Error(`Failed to list directory: ${response.status}`);
    const entries = await response.json();
    const files = [];
    for (const entry of entries) {
        const entryRelPath = relativePath ? `${relativePath}/${entry.name}` : entry.name;
        if (entry.type === 'dir') {
            const subFiles = await listFilesRecursive(entry.url, entryRelPath);
            files.push(...subFiles);
        } else if (entry.name.endsWith('.lua')) {
            files.push({ ...entry, relativePath: entryRelPath });
        }
    }
    return files;
}

async function downloadFile(url, destPath, normalizeLineEndings = false) {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Failed to download ${url}: ${response.status}`);
    let content = await response.text();
    if (normalizeLineEndings) {
        content = content.replace(/\r\n/g, '\n').replace(/\n/g, '\r\n');
    }
    fs.mkdirSync(path.dirname(destPath), { recursive: true });
    fs.writeFileSync(destPath, content, 'utf8');
}

function walk(dir) {
    if (!fs.existsSync(dir)) return;
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const ent of entries) {
        const full = path.join(dir, ent.name);
        if (ent.isDirectory()) {
            walk(full);
        } else if (ent.isFile() && full.endsWith('.lua')) {
            parseLua(full);
        }
    }
}

function parseLua(file) {
    const lines = fs.readFileSync(file, 'utf8').split(/\r?\n/);
    let current = null;
    for (const line of lines) {
        const trimmed = line.trim();
        const mFunc = funcRe.exec(trimmed);
        if (mFunc) {
            current = mFunc[1];
            continue;
        }
        if (current) {
            if (trimmed === 'end') {
                current = null;
                continue;
            }
            const mCall = callRe.exec(line);
            if (mCall) {
                const func = mCall[1];
                const args = mCall[2].split(',')
                    .map(a => a.replace(/"/g, ""))
                    .map(a => a.replace("scripts.gags.fin_prefix", "FIN"))
                    .map(a => a.trim());
                if (!funcCalls[current]) funcCalls[current] = [];
                funcCalls[current].push({ func, args });
            }
        }
    }
}

function toArray(x) {
    if (!x) return [];
    return Array.isArray(x) ? x : [x];
}

function extractPatterns(obj) {
    const pats = toArray(obj.regexCodeList && obj.regexCodeList.string).filter(Boolean);
    const props = toArray(obj.regexCodePropertyList && obj.regexCodePropertyList.integer);
    const out = [];
    for (let i = 0; i < Math.max(pats.length, pats.length); i++) {
        const pattern = pats[i].replaceAll(/\?'(.*?)'/g, "?<$1>") || '';
        const type = props[i] !== undefined ? Number(props[i]) : null;
        if (pattern || type !== null) out.push({ pattern, type });
    }
    return out;
}

function processNode(node) {
    const name = node.name || '';
    const patterns = extractPatterns(node);
    const scriptNode = node.script;
    const script = scriptNode ? String(scriptNode).trim() : '';

    // Filter out specific scripts
    if (FILTERED_SCRIPTS.some(f => script.startsWith(f))) {
        return null;
    }

    const children = [];
    toArray(node.Trigger).forEach(t => {
        const res = processNode(t);
        if (res) children.push(res);
    });
    toArray(node.TriggerGroup).forEach(g => {
        const res = processNode(g);
        if (res) children.push(res);
    });
    if (!patterns.length && !children.length && !script) return null;
    const out = { name, patterns };
    if (script) out.script = scriptNode;
    if (children.length) out.triggers = children;
    if (node.$.isMultiline === "yes") {
        out.multiline = true;
    }
    return out;
}

function extractGags(xmlPath) {
    return new Promise((resolve, reject) => {
        const xmlData = fs.readFileSync(xmlPath, 'utf8');
        xml2js.parseString(xmlData, { explicitArray: false }, (err, result) => {
            if (err) return reject(err);
            const root = xpath.find(result, "//MudletPackage/TriggerPackage/TriggerGroup[name='skrypty']/TriggerGroup[name='ui']/TriggerGroup[name='gags']");
            if (!root) return resolve([]);
            const groups = toArray(root).map(processNode).filter(Boolean);
            resolve(groups);
        });
    });
}

async function main() {
    const ctx = {
        luaFiles: [],
        xmlPath: '',
        luaDir: '',
    };

    const tasks = new Listr([
        {
            title: 'Download files from GitHub',
            enabled: () => downloadFlag,
            task: (ctx, task) => task.newListr([
                {
                    title: 'Download Arkadia.xml',
                    task: async () => {
                        const destPath = path.join(rootDir, 'data', 'Arkadia.xml');
                        await downloadFile(`${GITHUB_RAW_BASE}/Arkadia.xml`, destPath);
                        ctx.xmlPath = destPath;
                    }
                },
                {
                    title: 'Fetch lua file list',
                    task: async (ctx) => {
                        const colorGagsUrl = `${GITHUB_API_BASE}/skrypty/ui/gags/color`;
                        ctx.luaFiles = await listFilesRecursive(colorGagsUrl);
                    }
                },
                {
                    title: 'Download lua files',
                    task: (ctx, task) => task.newListr(
                        ctx.luaFiles.map(file => ({
                            title: file.relativePath,
                            task: async () => {
                                const destPath = path.join(rootDir, 'src', 'client', 'lua', ...file.relativePath.split('/'));
                                await downloadFile(file.download_url, destPath, true);
                            }
                        })),
                        { concurrent: true }
                    )
                }
            ], { concurrent: false })
        },
        {
            title: 'Apply lua fixes',
            enabled: () => downloadFlag,
            task: () => {
                const warnings = [];
                for (const fix of LUA_FIXES) {
                    const filePath = path.join(rootDir, 'src', 'client', 'lua', ...fix.file.split('/'));
                    const content = fs.readFileSync(filePath, 'utf8');
                    if (content.includes(fix.upstream)) {
                        const patched = content.replace(fix.upstream, fix.fixed);
                        fs.writeFileSync(filePath, patched, 'utf8');
                    } else if (content.includes(fix.fixed)) {
                        // Already patched, nothing to do
                    } else {
                        warnings.push(fix);
                    }
                }
                if (warnings.length) {
                    const msg = warnings.map(w =>
                        `\n  !!!  ${w.file}: ${w.description}\n  !!!  Expected upstream line: ${w.upstream}`
                    ).join('');
                    throw new Error(
                        `\n\n${'!'.repeat(72)}\n` +
                        `!!!  UPSTREAM LUA SOURCE HAS CHANGED — fixes need review!${msg}\n` +
                        `${'!'.repeat(72)}\n`
                    );
                }
            }
        },
        {
            title: 'Setup paths',
            task: (ctx) => {
                if (downloadFlag) {
                    ctx.xmlPath = path.join(rootDir, 'data', 'Arkadia.xml');
                    ctx.luaDir = path.join(rootDir, 'src', 'client', 'lua');
                } else {
                    ctx.xmlPath = path.join(repoPath, 'Arkadia.xml');
                    ctx.luaDir = path.join(repoPath, 'skrypty');
                }
            }
        },
        {
            title: 'Parse lua files',
            task: (ctx) => {
                walk(ctx.luaDir);
            }
        },
        {
            title: 'Extract gags from XML',
            task: async (ctx) => {
                ctx.gags = await extractGags(ctx.xmlPath);
            }
        },
        {
            title: 'Write gags_lua.json',
            task: (ctx) => {
                const outputPath = path.join(rootDir, 'src', 'client', 'scripts', 'gags_lua.json');
                fs.mkdirSync(path.dirname(outputPath), { recursive: true });
                fs.writeFileSync(outputPath, JSON.stringify(ctx.gags, null, 2));
            }
        }
    ], {
        rendererOptions: {
            collapseSubtasks: false
        }
    });

    await tasks.run(ctx);
}

main().catch(err => {
    console.error(err);
    process.exit(1);
});
