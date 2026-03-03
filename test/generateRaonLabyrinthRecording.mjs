/**
 * Generates a playable recording for testing the Raon labyrinth mapper.
 * Output: test/raonLabyrinthRecording.recording.json (RecordedEvent[] format)
 *
 * Multi-pass graph building from the real log data:
 *   - First visits (spText present): create room node, record bidirectional edges.
 *   - Revisits (no spText): resolve target by graph lookup + exit-set matching.
 *   - Iterates until all entries are resolved.
 *   - Recording replays the real description for every room (including revisits).
 *
 * Usage: node test/generateRaonLabyrinthRecording.mjs
 */
import { readFileSync, writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Telnet/GMCP constants
const GMCP_IAC = "\xFF";
const GMCP_SB = "\xFA";
const GMCP_SE = "\xF0";
const GMCP_CODE = String.fromCharCode(201);

function encodeGmcp(path, payload) {
    const data = typeof payload === "string" ? payload : JSON.stringify(payload ?? {});
    return `${GMCP_IAC}${GMCP_SB}${GMCP_CODE}${path} ${data}${GMCP_IAC}${GMCP_SE}`;
}

function encodeGmcpMsg(text, type) {
    const b64 = Buffer.from(text).toString('base64');
    return encodeGmcp("gmcp_msgs", { text: b64, type });
}

function parseExitList(exitStr) {
    return exitStr.split(/ i |, /).map(s => s.trim()).filter(Boolean);
}

function buildExitSentence(exitStr) {
    const dirs = parseExitList(exitStr);
    const count = dirs.length;
    const numWords = {
        1: 'jedno', 2: 'dwa', 3: 'trzy', 4: 'cztery', 5: 'piec',
        6: 'szesc', 7: 'siedem', 8: 'osiem',
    };
    if (count === 1) {
        return `Jest tutaj ${numWords[1]} widoczne wyjscie: ${exitStr}.`;
    } else if (count <= 4) {
        return `Sa tutaj ${numWords[count]} widoczne wyjscia: ${exitStr}.`;
    } else {
        return `Sa tutaj ${numWords[count] || count} widocznych wyjsc: ${exitStr}.`;
    }
}

function splitDoorAndExits(exitStr) {
    const m = exitStr.match(/^((?:Zamkniete|Otwarte) masywne drzwi prowadzace na \S+)\.\s*(.+)$/);
    if (m) return { doorText: m[1] + '.', exits: m[2] };
    return { doorText: null, exits: exitStr };
}

const shortToPolish = {
    n: 'polnoc', s: 'poludnie', e: 'wschod', w: 'zachod',
    ne: 'polnocny-wschod', nw: 'polnocny-zachod',
    se: 'poludniowy-wschod', sw: 'poludniowy-zachod',
    u: 'gore', d: 'dol',
};

const polishToShort = {
    'polnoc': 'n', 'poludnie': 's', 'wschod': 'e', 'zachod': 'w',
    'polnocny-wschod': 'ne', 'polnocny-zachod': 'nw',
    'poludniowy-wschod': 'se', 'poludniowy-zachod': 'sw',
    'gora': 'u', 'dol': 'd',
};

const reverseDir = {
    n: 's', s: 'n', e: 'w', w: 'e',
    ne: 'sw', sw: 'ne', nw: 'se', se: 'nw',
    u: 'd', d: 'u',
};

function parseExitSet(exitStr) {
    const { exits: clean } = splitDoorAndExits(exitStr);
    return new Set(parseExitList(clean).map(d => polishToShort[d] || d));
}

function setsEqual(a, b) {
    if (a.size !== b.size) return false;
    for (const v of a) if (!b.has(v)) return false;
    return true;
}

// Read log data
const logData = JSON.parse(readFileSync(join(__dirname, 'raonLabyrinthRecording.json'), 'utf-8'));

const PLAYER_NUM = 12345;
const ABOVE_ROOM_ID = 23146;
const ENTRY_ROOM_ID = 23147;

// ============================================================
// Graph building (multi-pass)
// ============================================================

const ENTRY_FP = '__entry__';
const graph = new Map();        // fp -> Map<shortDir, fp>
const roomDesc = new Map();     // fp -> spText
const roomExitSets = new Map(); // fp -> Set<shortDir>

graph.set(ENTRY_FP, new Map());
roomDesc.set(ENTRY_FP, logData[0].spText);
roomExitSets.set(ENTRY_FP, parseExitSet(logData[0].exits));

const resolved = new Map(); // logIndex -> targetFP

function findTargetByExits(sourceFP, dir, targetExitStr) {
    const targetExits = parseExitSet(targetExitStr);
    const rev = reverseDir[dir];

    // Exact exit-set match
    let candidates = [];
    for (const [fp, exitSet] of roomExitSets) {
        if (fp === sourceFP) continue;
        if (!setsEqual(exitSet, targetExits)) continue;
        // Reverse direction must be compatible (unset or points to source)
        if (rev) {
            const edges = graph.get(fp);
            if (edges?.has(rev) && edges.get(rev) !== sourceFP) continue;
        }
        candidates.push(fp);
    }
    if (candidates.length === 1) return candidates[0];

    // If multiple: prefer one with unset reverse
    if (candidates.length > 1 && rev) {
        const unset = candidates.filter(fp => !graph.get(fp)?.has(rev));
        if (unset.length === 1) return unset[0];
    }

    // Subset match (door rooms: stored exits are subset of target due to door opening)
    if (candidates.length === 0) {
        for (const [fp, exitSet] of roomExitSets) {
            if (fp === sourceFP) continue;
            if (exitSet.size >= targetExits.size) continue;
            let sub = true;
            for (const d of exitSet) { if (!targetExits.has(d)) { sub = false; break; } }
            if (!sub) continue;
            if (rev) {
                const edges = graph.get(fp);
                if (edges?.has(rev) && edges.get(rev) !== sourceFP) continue;
            }
            candidates.push(fp);
        }
        if (candidates.length === 1) return candidates[0];
    }

    return null;
}

function recordEdge(sourceFP, dir, targetFP) {
    let changed = false;
    const srcEdges = graph.get(sourceFP);
    if (srcEdges && !srcEdges.has(dir)) {
        srcEdges.set(dir, targetFP);
        changed = true;
    }
    const rev = reverseDir[dir];
    if (rev) {
        const tgtEdges = graph.get(targetFP);
        if (tgtEdges && !tgtEdges.has(rev)) {
            tgtEdges.set(rev, sourceFP);
            changed = true;
        }
    }
    return changed;
}

let iterChanged = true;
let iter = 0;

while (iterChanged && iter < 50) {
    iterChanged = false;
    iter++;
    let simCurrent = ENTRY_FP;

    for (let i = 1; i < logData.length; i++) {
        const entry = logData[i];
        if (!entry.exits) continue;

        const dir = entry.cmd;
        let targetFP = null;

        if (entry.spText) {
            targetFP = entry.spText;
            if (!graph.has(targetFP)) {
                graph.set(targetFP, new Map());
                roomDesc.set(targetFP, entry.spText);
                roomExitSets.set(targetFP, parseExitSet(entry.exits));
                iterChanged = true;
            }
        } else if (resolved.has(i)) {
            targetFP = resolved.get(i);
        } else if (simCurrent) {
            // Graph lookup
            targetFP = graph.get(simCurrent)?.get(dir) || null;
            // Exit-set matching fallback
            if (!targetFP) {
                targetFP = findTargetByExits(simCurrent, dir, entry.exits);
            }
            if (targetFP) {
                resolved.set(i, targetFP);
                iterChanged = true;
            }
        }

        if (!targetFP) {
            simCurrent = null;
            continue;
        }

        // Re-anchor if we lost track
        if (!simCurrent) {
            simCurrent = targetFP;
            continue; // can't record edge without knowing source
        }

        if (recordEdge(simCurrent, dir, targetFP)) {
            iterChanged = true;
        }

        simCurrent = targetFP;
    }
}

const totalEdges = [...graph.values()].reduce((sum, m) => sum + m.size, 0);
const unresolvedCount = logData.slice(1).filter((e, i) => e.exits && !e.spText && !resolved.has(i + 1)).length;
console.log(`Graph built in ${iter} iterations: ${graph.size} rooms, ${totalEdges} edges`);
console.log(`Resolved: ${resolved.size} revisits, unresolved: ${unresolvedCount}`);

if (unresolvedCount > 0) {
    for (let i = 1; i < logData.length; i++) {
        const entry = logData[i];
        if (!entry.exits || entry.spText || resolved.has(i)) continue;
        console.warn(`  UNRESOLVED index ${i}: cmd=${entry.cmd} exits=${entry.exits}`);
    }
}

// ============================================================
// Generate recording events
// ============================================================

const events = [];
let timestamp = Date.now() - 600000;

function addEvent(message, direction, locationId) {
    const ev = { message, timestamp, direction };
    if (locationId !== undefined) ev.locationId = locationId;
    events.push(ev);
    timestamp += 50;
}

// --- Setup: start above entry room ---

addEvent(
    encodeGmcp("char.info", { object_num: PLAYER_NUM, name: "Testowy" }),
    'in', ABOVE_ROOM_ID
);
events[0].initialLocationId = ABOVE_ROOM_ID;

addEvent(
    encodeGmcp("objects.data", {
        [PLAYER_NUM]: {
            desc: "Testowy",
            team_leader: false,
            team: true,
            living: true,
            hp: 100,
            attack_num: false,
            attack_target: false,
            defense_target: false,
            hidden: false,
        }
    }),
    'in', ABOVE_ROOM_ID
);

timestamp += 500;
addEvent(
    encodeGmcpMsg("Szerokie, marmurowe schody.", "room.short") +
    encodeGmcpMsg("Jest tutaj jedno widoczne wyjscie: dol.", "room.exits"),
    'in', ABOVE_ROOM_ID
);

timestamp += 2000;

// --- Go down to entry room ---

addEvent(encodeGmcpMsg("Podazasz za Hunvertem na dol.", ""), 'in');
timestamp += 100;

// Entry room: real description from log
const entryDesc = roomDesc.get(ENTRY_FP);
const { doorText: entryDoor, exits: entryExitsClean } = splitDoorAndExits(logData[0].exits);
let entryGmcp = '';
for (const line of entryDesc.split('\n')) {
    entryGmcp += encodeGmcpMsg(line, "room.long");
}
if (entryDoor) entryGmcp += encodeGmcpMsg(entryDoor, "room.exits");
addEvent(entryGmcp, 'in', ENTRY_ROOM_ID);
timestamp += 50;
addEvent(encodeGmcpMsg(buildExitSentence(entryExitsClean), "room.exits"), 'in');

timestamp += 2000;

// --- Process all log entries ---

let currentFP = ENTRY_FP;
let skipped = 0;

for (let i = 1; i < logData.length; i++) {
    const entry = logData[i];
    if (!entry.exits) continue;

    const dir = entry.cmd;
    let targetFP;

    if (entry.spText) {
        targetFP = entry.spText;
    } else {
        targetFP = resolved.get(i);
    }

    if (!targetFP) {
        skipped++;
        currentFP = null;
        continue;
    }

    if (!currentFP) {
        // Re-anchor
        currentFP = targetFP;
        continue;
    }

    const polishDir = shortToPolish[dir];
    if (!polishDir) {
        console.warn(`Unknown direction: ${dir}`);
        skipped++;
        continue;
    }

    // Follower movement line
    addEvent(encodeGmcpMsg(`Podazasz za Hunvertem na ${polishDir}.`, ""), 'in');
    timestamp += 100;

    // Room description (real text) + current exits from log
    const desc = roomDesc.get(targetFP);
    const { doorText, exits: cleanExits } = splitDoorAndExits(entry.exits);
    const exitSentence = buildExitSentence(cleanExits);

    let gmcpData = '';
    for (const line of desc.split('\n')) {
        gmcpData += encodeGmcpMsg(line, "room.long");
    }
    if (doorText) {
        gmcpData += encodeGmcpMsg(doorText, "room.exits");
    }

    if (targetFP === ENTRY_FP) {
        addEvent(gmcpData, 'in', ENTRY_ROOM_ID);
    } else {
        addEvent(gmcpData, 'in');
    }
    timestamp += 50;
    // Exit sentence as separate event (so door text + exit sentence don't concatenate)
    addEvent(encodeGmcpMsg(exitSentence, "room.exits"), 'in');
    timestamp += 750;

    currentFP = targetFP;
}

// Write output
const RECORDING_NAME = "Raon Labirynt (test)";
const outputPath = join(__dirname, 'raonLabyrinthRecording.recording.json');
writeFileSync(outputPath, JSON.stringify({ [RECORDING_NAME]: events }, null, 2));
console.log(`Generated ${events.length} events -> ${outputPath}`);
console.log(`  Skipped: ${skipped}`);
