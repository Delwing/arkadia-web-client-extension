const fs = require('fs');
const path = require('path');
const xml2js = require('xml2js');
const xpath = require("xml2js-xpath");

const repoPath = process.argv[2] || '.';
const luaDir = path.join(repoPath, 'skrypty');
const xmlPath = path.join(repoPath, 'Arkadia.xml');

const funcCalls = {};
const funcRe = /^function\s+(trigger_func_[^(]+)\s*\(/;
const callRe = /scripts\.gags:(gag_own_spec|gag_prefix|gag_spec|gag)\(([^)]*)\)/;

function walk(dir) {
    const entries = fs.readdirSync(dir, {withFileTypes: true});
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
                funcCalls[current].push({func, args});
            }
        }
    }
}

walk(luaDir);

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
        if (pattern || type !== null) out.push({pattern, type});
    }
    return out;
}

function getCalls(script) {
    let funcName = script;
    if (funcName.endsWith('()')) funcName = funcName.slice(0, -2);
    if (funcCalls[funcName]) return funcCalls[funcName];
    const mCall = callRe.exec(script);
    if (mCall) {
        return [{
            func: mCall[1], args: mCall[2].split(',')
                .map(a => a.replace(/"/g, ""))
                .map(a => a.replace("scripts.gags.fin_prefix", "FIN"))
                .map(a => a.trim())
        }];
    }
    return [];
}

function processTrigger(tr) {
    const scriptNode = tr.script;
    const script = scriptNode ? String(scriptNode).trim() : '';

    const trigger = {
        name: tr.name || '',
        script: scriptNode,
        patterns: extractPatterns(tr),
        triggers: [],
    };

    toArray(tr.Trigger).forEach(t => {
        const res = processTrigger(t);
        if (res) trigger.triggers.push(res);
    });

    if (!script && trigger.triggers.length === 0 && trigger.patterns.length === 0) return null;
    return trigger;
}

function processGroup(gr) {
    const group = {
        name: gr.name || '',
        patterns: extractPatterns(gr),
        triggers: [],
        groups: [],
    };
    toArray(gr.Trigger).forEach(t => {
        const res = processTrigger(t);
        if (res) group.triggers.push(res);
    });
    toArray(gr.TriggerGroup).forEach(g => {
        const sub = processGroup(g);
        if (sub.triggers.length || sub.groups.length) group.groups.push(sub);
    });
    return group;
}

const xmlData = fs.readFileSync(xmlPath, 'utf8');
xml2js.parseString(xmlData, {explicitArray: false}, (err, result) => {
    if (err) throw err;
    const root = xpath.find(result, "//MudletPackage/TriggerPackage/TriggerGroup[name='skrypty']/TriggerGroup[name='ui']/TriggerGroup[name='gags']")
    if (!root) return;
    const groups = toArray(root).map(processGroup).filter(Boolean);
    fs.writeFileSync("../client/src/scripts/gags_lua.json", JSON.stringify(groups));
});
