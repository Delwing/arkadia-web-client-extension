import fs from 'fs';
import path from 'path';
import xml2js from 'xml2js';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.join(__dirname, '..');

// Pattern types from Mudlet:
// 0 = substring
// 1 = regex
// 2 = start of line substring
// 3 = exact match
// 4 = lua function
// 5 = line spacer
// 6 = color trigger

const PATTERN_TYPES = {
    0: 'substring',
    1: 'regex',
    2: 'startOfLine',
    3: 'exactMatch',
    4: 'luaFunction',
    5: 'lineSpacer',
    6: 'colorTrigger'
};

function toArray(x) {
    if (!x) return [];
    return Array.isArray(x) ? x : [x];
}

// Mudlet regexes are PCRE; JS spells named groups (?<name>...) rather than (?'name'...).
export function toJsRegexSource(pattern) {
    return pattern.replaceAll(/\?'(.*?)'/g, "?<$1>");
}

function extractPatterns(node) {
    const pats = toArray(node.regexCodeList?.string).filter(Boolean);
    const props = toArray(node.regexCodePropertyList?.integer);
    const out = [];
    for (let i = 0; i < pats.length; i++) {
        const type = props[i] !== undefined ? Number(props[i]) : 0;
        const pattern = type === 1 ? toJsRegexSource(pats[i]) : pats[i];
        out.push({ pattern, type });
    }
    return out;
}

// `exact` matches the called function's name, so `trigger_func_rusalka` does not
// also pick up `trigger_func_rusalka2`; otherwise any script starting with it matches.
function scriptMatches(script, targetScript, exact) {
    if (!exact) return script.startsWith(targetScript);
    return script.split('(')[0].trim() === targetScript;
}

function findTriggersWithScript(node, targetScript, parentChain = [], exact = false) {
    const results = [];
    const name = node.name || '';
    const patterns = extractPatterns(node);
    const script = node.script ? String(node.script).trim() : '';

    const currentNode = {
        name,
        patterns
    };

    // Build new parent chain for children
    const newParentChain = patterns.length > 0
        ? [...parentChain, currentNode]
        : parentChain;

    // Check if this trigger matches the target script
    if (scriptMatches(script, targetScript, exact)) {
        const entry = {
            name,
            script,
            patterns
        };

        // Include parent chain if there are parents with patterns
        if (newParentChain.length > 1) { // More than just current node
            entry.parents = newParentChain.slice(0, -1); // Exclude current node from parents
        }

        results.push(entry);
    }

    // Recursively search in child triggers and groups
    for (const child of toArray(node.Trigger)) {
        results.push(...findTriggersWithScript(child, targetScript, newParentChain, exact));
    }
    for (const child of toArray(node.TriggerGroup)) {
        results.push(...findTriggersWithScript(child, targetScript, newParentChain, exact));
    }

    return results;
}

export async function extractTriggerPatterns(xmlData, targetScript, { exact = false } = {}) {
    const result = await new Promise((resolve, reject) => {
        xml2js.parseString(xmlData, { explicitArray: false }, (err, result) => {
            if (err) reject(err);
            else resolve(result);
        });
    });

    // Start from the root TriggerPackage
    const triggerPackage = result.MudletPackage?.TriggerPackage;
    if (!triggerPackage) {
        throw new Error('TriggerPackage not found in XML');
    }

    const allResults = [];

    // Search in all trigger groups
    for (const group of toArray(triggerPackage.TriggerGroup)) {
        allResults.push(...findTriggersWithScript(group, targetScript, [], exact));
    }
    for (const trigger of toArray(triggerPackage.Trigger)) {
        allResults.push(...findTriggersWithScript(trigger, targetScript, [], exact));
    }

    return allResults;
}

async function main() {
    const targetScript = process.argv[2] || 'trigger_func_skrypty_ui_footer_elements_weapon_on';
    const xmlPath = path.join(rootDir, 'data', 'Arkadia.xml');

    if (!fs.existsSync(xmlPath)) {
        console.error(`File not found: ${xmlPath}`);
        process.exit(1);
    }

    const xmlData = fs.readFileSync(xmlPath, 'utf8');
    const allResults = await extractTriggerPatterns(xmlData, targetScript);

    console.log(JSON.stringify(allResults, null, 2));
}

// Only run the CLI when executed directly, not when imported.
if (process.argv[1] && path.resolve(process.argv[1]) === __filename) {
    main().catch(err => {
        console.error(err);
        process.exit(1);
    });
}
