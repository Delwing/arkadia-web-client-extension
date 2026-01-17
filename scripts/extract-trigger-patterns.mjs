import fs from 'fs';
import path from 'path';
import xml2js from 'xml2js';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.join(__dirname, '..');

const targetScript = process.argv[2] || 'trigger_func_skrypty_ui_footer_elements_weapon_on';

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

function extractPatterns(node) {
    const pats = toArray(node.regexCodeList?.string).filter(Boolean);
    const props = toArray(node.regexCodePropertyList?.integer);
    const out = [];
    for (let i = 0; i < pats.length; i++) {
        const pattern = pats[i];
        const type = props[i] !== undefined ? Number(props[i]) : 0;
        out.push({ pattern, type });
    }
    return out;
}

function findTriggersWithScript(node, targetScript, parentChain = []) {
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
    if (script.startsWith(targetScript)) {
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
        results.push(...findTriggersWithScript(child, targetScript, newParentChain));
    }
    for (const child of toArray(node.TriggerGroup)) {
        results.push(...findTriggersWithScript(child, targetScript, newParentChain));
    }

    return results;
}

async function main() {
    const xmlPath = path.join(rootDir, 'data', 'Arkadia.xml');

    if (!fs.existsSync(xmlPath)) {
        console.error(`File not found: ${xmlPath}`);
        process.exit(1);
    }

    const xmlData = fs.readFileSync(xmlPath, 'utf8');

    const result = await new Promise((resolve, reject) => {
        xml2js.parseString(xmlData, { explicitArray: false }, (err, result) => {
            if (err) reject(err);
            else resolve(result);
        });
    });

    // Start from the root TriggerPackage
    const triggerPackage = result.MudletPackage?.TriggerPackage;
    if (!triggerPackage) {
        console.error('TriggerPackage not found in XML');
        process.exit(1);
    }

    const allResults = [];

    // Search in all trigger groups
    for (const group of toArray(triggerPackage.TriggerGroup)) {
        allResults.push(...findTriggersWithScript(group, targetScript));
    }
    for (const trigger of toArray(triggerPackage.Trigger)) {
        allResults.push(...findTriggersWithScript(trigger, targetScript));
    }

    console.log(JSON.stringify(allResults, null, 2));
}

main().catch(err => {
    console.error(err);
    process.exit(1);
});
