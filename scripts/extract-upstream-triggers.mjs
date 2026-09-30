import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { extractTriggerPatterns } from './extract-trigger-patterns.mjs';

// Keeps the client's copies of upstream Arkadia.xml triggers (outside the
// skrypty/ui/gags subtree, which extract-gags.js owns) in sync with upstream.
//
// GENERATED triggers are written to JSON the consuming script imports, so a
// re-run picks up upstream changes. MIRRORED triggers are still hand-copied in
// TS (their per-pattern handling does not fit a generated list); --check makes
// sure every upstream pattern of theirs still has a counterpart in that file.
//
// Usage:
//   node scripts/extract-upstream-triggers.mjs <path-to-arkadia-repo> [--check]
//   node scripts/extract-upstream-triggers.mjs --download [--check]
//   node scripts/extract-upstream-triggers.mjs [--check]   (reads data/Arkadia.xml)
//
// --check writes nothing and exits 1 when a generated JSON is stale or a
// mirrored trigger drifted from upstream.

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.join(__dirname, '..');

const GITHUB_RAW_BASE = 'https://raw.githubusercontent.com/tjurczyk/arkadia/master';

// `exact: false` keeps the historical prefix match, so the weapon lists stay
// byte-identical to what extract-weapon-patterns.mjs used to write.
export const GENERATED = [
    {
        output: 'src/client/scripts/weapon_on_patterns.json',
        funcs: ['trigger_func_skrypty_ui_footer_elements_weapon_on'],
        exact: false,
    },
    {
        output: 'src/client/scripts/weapon_off_patterns.json',
        funcs: ['trigger_func_skrypty_ui_footer_elements_weapon_off'],
        exact: false,
        // Local fixes, like LUA_FIXES in extract-gags.js: when the upstream
        // pattern is gone the fix needs review, and the run fails loudly.
        fixes: [
            {
                description: '"Opuszczasz obszar ..." is leaving an area, not lowering the weapon',
                upstream: '^[ >]*Opuszczasz (.*)\\.$',
                fixed: '^[ >]*Opuszczasz (?!obszar )(.*)\\.$',
            },
        ],
    },
    {
        output: 'src/client/scripts/attack_beep_patterns.json',
        funcs: [
            'trigger_func_skrypty_misc_atakuje_cie_beep',
            'trigger_func_skrypty_misc_player_atakuje_cie_beep',
            'trigger_func_skrypty_ui_misc_fighting_atakuje_cie',
        ],
    },
    {
        output: 'src/client/scripts/short_exits_patterns.json',
        funcs: ['trigger_func_mapper_directions_ui_wyjscia'],
    },
    {
        output: 'src/client/scripts/gates_patterns.json',
        funcs: ['trigger_func_mapper_gates_gates'],
    },
    {
        output: 'src/client/scripts/team_blocker_patterns.json',
        funcs: ['trigger_func_mapper_blockers_blocker_team_dependent'],
    },
    {
        output: 'src/client/scripts/brokilon_patterns.json',
        funcs: [
            'trigger_func_pulapka_brokilon',
            'trigger_func_strzaly',
            'trigger_func_rusalka',
            'trigger_func_rusalka2',
        ],
    },
];

export const MIRRORED = [
    {
        file: 'src/client/scripts/cutting.ts',
        funcs: [
            'trigger_func_skrypty_misc_wycinanie_triggers_brak_ciala',
            'trigger_func_skrypty_misc_wycinanie_triggers_wyciete_cialo',
        ],
    },
    {
        file: 'src/client/TeamManager.ts',
        funcs: [
            'trigger_func_skrypty_team_no_team',
            'trigger_func_skrypty_team_left_team',
            'trigger_func_skrypty_team_clear_absent',
        ],
    },
    { file: 'src/client/scripts/invite.ts', funcs: ['trigger_func_skrypty_team_invite_bind'] },
    {
        file: 'src/client/scripts/magic-support.ts',
        funcs: ['trigger_func_skrypty_inventory_magic_weapons_tasak_dziala'],
    },
    { file: 'src/client/scripts/drowning.ts', funcs: ['trigger_func_baccala_wave'] },
    { file: 'src/client/scripts/lamp.ts', funcs: ['trigger_func_skrypty_inventory_lampa_lampa_timery_off'] },
    { file: 'src/client/scripts/orderTimer.ts', funcs: ['trigger_func_skrypty_ui_footer_elements_order_action'] },
    { file: 'src/client/scripts/breakItem.ts', funcs: ['trigger_func_damaged_equipment'] },
    {
        file: 'src/client/scripts/prettyContainers.ts',
        funcs: [
            'trigger_func_skrypty_inventory_equipment_zagladanie_plecaki',
            'trigger_func_skrypty_inventory_equipment_zagladanie_skrzynie',
        ],
    },
    {
        file: 'src/client/scripts/weaponEvaluation.ts',
        funcs: ['trigger_func_skrypty_inventory_equipment_ocena_broni'],
    },
];

const checkFlag = process.argv.includes('--check');
const downloadFlag = process.argv.includes('--download');
const repoPath = process.argv.slice(2).find(arg => !arg.startsWith('--'));

async function readArkadiaXml() {
    if (downloadFlag) {
        const url = `${GITHUB_RAW_BASE}/Arkadia.xml`;
        const response = await fetch(url);
        if (!response.ok) throw new Error(`Failed to download ${url}: ${response.status}`);
        return response.text();
    }
    const xmlPath = repoPath
        ? path.join(repoPath, 'Arkadia.xml')
        : path.join(rootDir, 'data', 'Arkadia.xml');
    if (!fs.existsSync(xmlPath)) {
        throw new Error(`File not found: ${xmlPath} (pass <path-to-arkadia-repo> or --download)`);
    }
    return fs.readFileSync(xmlPath, 'utf8');
}

async function extractAll(xmlData, funcs, exact = true) {
    const out = [];
    for (const func of funcs) {
        const triggers = await extractTriggerPatterns(xmlData, func, { exact });
        if (triggers.length === 0) {
            throw new Error(`No trigger calling ${func} found — upstream has changed.`);
        }
        out.push(...triggers);
    }
    return out;
}

// The longest run of plain text in a pattern. A hand copy may escape it
// differently (`\.` in a TS regex for a Mudlet substring pattern), so it is
// split on escapes and regex syntax either way.
export function longestLiteral(pattern) {
    return pattern
        .split(/\\.|[()[\]{}*+?|^$.]/)
        .reduce((best, run) => (run.length > best.length ? run : best), '');
}

const MIN_LITERAL = 5;

function applyFixes(output, triggers, fixes = []) {
    const problems = [];
    for (const fix of fixes) {
        const entries = triggers.flatMap(t => t.patterns).filter(p => p.pattern === fix.upstream);
        if (entries.length === 0) {
            problems.push(`${output}: ${fix.description} — expected upstream pattern ${JSON.stringify(fix.upstream)} is gone, the fix needs review`);
        }
        entries.forEach(p => { p.pattern = fix.fixed; });
    }
    return problems;
}

async function main() {
    const xmlData = await readArkadiaXml();
    const problems = [];

    for (const { output, funcs, exact, fixes } of GENERATED) {
        const triggers = await extractAll(xmlData, funcs, exact ?? true);
        problems.push(...applyFixes(output, triggers, fixes));
        const content = JSON.stringify(triggers, null, 2);
        const outPath = path.join(rootDir, ...output.split('/'));
        if (checkFlag) {
            const current = fs.existsSync(outPath) ? fs.readFileSync(outPath, 'utf8') : '';
            if (current.replace(/\r\n/g, '\n').trimEnd() !== content) {
                problems.push(`${output} is stale — re-run without --check`);
            }
        } else {
            fs.writeFileSync(outPath, content + '\n');
            console.log(`  -> ${output} (${triggers.length} triggers)`);
        }
    }

    for (const { file, funcs } of MIRRORED) {
        const source = fs.readFileSync(path.join(rootDir, ...file.split('/')), 'utf8');
        for (const trigger of await extractAll(xmlData, funcs)) {
            for (const { pattern } of trigger.patterns) {
                const literal = longestLiteral(pattern).trim();
                if (literal.length < MIN_LITERAL) continue;
                if (!source.includes(literal)) {
                    problems.push(`${file}: no counterpart for ${trigger.name} pattern ${JSON.stringify(pattern)}`);
                }
            }
        }
    }

    if (problems.length) {
        throw new Error(
            `\n\n${'!'.repeat(72)}\n` +
            `!!!  UPSTREAM TRIGGERS HAVE DRIFTED FROM THE CLIENT COPIES\n` +
            problems.map(p => `!!!  ${p}`).join('\n') +
            `\n${'!'.repeat(72)}\n`
        );
    }
    console.log(checkFlag ? 'Upstream triggers are in sync.' : 'Done.');
}

if (process.argv[1] && path.resolve(process.argv[1]) === __filename) {
    main().catch(err => {
        console.error(err.message ?? err);
        process.exit(1);
    });
}
