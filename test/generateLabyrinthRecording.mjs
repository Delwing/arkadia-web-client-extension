/**
 * Generates a playable recording for testing the labyrinth mapper.
 * Output: test/labyrinthRecording.recording.json (RecordedEvent[] format)
 *
 * All game text must go through gmcp_msgs (not plain text) because only
 * gmcp_msgs are processed through the trigger system via client.onLine().
 *
 * With brief=0 the server sends long descriptions (room.long) as part of
 * the room entry — no separate sp command needed. The mapper captures
 * room.long lines between room.info and the exit line.
 *
 * Usage: node test/generateLabyrinthRecording.mjs
 */
import { readFileSync, writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Telnet/GMCP constants (must match src/shared/socket/constants.ts)
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
    // "polnocny-wschod i zachod" -> ["polnocny-wschod", "zachod"]
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

// Read extracted log data
const logData = JSON.parse(readFileSync(join(__dirname, 'labyrinthRecording.json'), 'utf-8'));

const events = [];
let timestamp = Date.now() - 600000; // Start 10 minutes ago
const PLAYER_NUM = 12345;
const ENTRANCE_ROOM_ID = 25344;
let roomCounter = 0;

function addEvent(message, direction, locationId) {
    const ev = { message, timestamp, direction };
    if (locationId !== undefined) ev.locationId = locationId;
    events.push(ev);
    timestamp += 50;
}

// --- Setup events ---

// 1. char.info GMCP (sets playerNum for isLeader)
addEvent(
    encodeGmcp("char.info", { object_num: PLAYER_NUM, name: "Testowy" }),
    'in',
    ENTRANCE_ROOM_ID
);
// Mark first event with initialLocationId
events[0].initialLocationId = ENTRANCE_ROOM_ID;

// 2. objects.data GMCP (sets team_leader for isLeader)
addEvent(
    encodeGmcp("objects.data", {
        [PLAYER_NUM]: {
            desc: "Testowy",
            team_leader: true,
            team: true,
            living: true,
            hp: 100,
            attack_num: false,
            attack_target: false,
            defense_target: false,
            hidden: false,
        }
    }),
    'in',
    ENTRANCE_ROOM_ID
);

// 3. Simulate being at entrance room (room.info WITHOUT map data — map position
//    is set by applyInitialLocation via initialLocationId; including fake map
//    coordinates would cause setMapPosition to clear currentRoom via hash mismatch)
timestamp += 500;
addEvent(
    encodeGmcp("room.info", {
        exits: ["zachod", "dol"]
    }) +
    encodeGmcpMsg("U szczytu schodow.", "room.short") +
    encodeGmcpMsg("Sa tutaj dwa widoczne wyjscia: zachod i dol.", "room.exits"),
    'in',
    ENTRANCE_ROOM_ID
);

// Small pause before entering labyrinth
timestamp += 2000;

// --- Process log entries ---

for (const entry of logData) {
    if (entry.fail) continue;

    // Outgoing command
    addEvent(entry.cmd, 'out');
    timestamp += 200;

    if (entry.exits) {
        // Successful room entry — simulate brief=0 output (room.long + exits)
        const exitDirs = parseExitList(entry.exits);
        const exitSentence = buildExitSentence(entry.exits);

        // For entries without spText, generate a synthetic description
        const description = entry.spText || `Pomieszczenie labiryntu #${++roomCounter}.`;

        // GMCP room.info (no map data for labyrinth rooms, just exits)
        // + gmcp_msg room.long (description) + gmcp_msg room.exits
        const gmcpData =
            encodeGmcp("room.info", { exits: exitDirs }) +
            encodeGmcpMsg(description, "room.long") +
            encodeGmcpMsg(exitSentence, "room.exits");

        addEvent(gmcpData, 'in');
        timestamp += 800; // Pause between rooms
    }
}

// --- End: leave labyrinth (go back up) ---
timestamp += 1000;
addEvent("u", 'out');
timestamp += 200;
addEvent(
    encodeGmcp("room.info", {
        exits: ["zachod", "dol"],
        map: { x: 10, y: 20, name: "U szczytu schodow." }
    }) +
    encodeGmcpMsg("U szczytu schodow.", "room.short") +
    encodeGmcpMsg("Sa tutaj dwa widoczne wyjscia: zachod i dol.", "room.exits"),
    'in',
    ENTRANCE_ROOM_ID
);

// Write output - wrapped with recording name as key (required for import)
const RECORDING_NAME = "Labirynt (test)";
const outputPath = join(__dirname, 'labyrinthRecording.recording.json');
writeFileSync(outputPath, JSON.stringify({ [RECORDING_NAME]: events }, null, 2));
console.log(`Generated ${events.length} events -> ${outputPath}`);
console.log(`  Setup events: 3`);
console.log(`  Log entries: ${logData.length}`);
console.log(`  Rooms with description: ${logData.filter(e => e.spText).length}`);
console.log(`  Rooms with synthetic desc: ${logData.filter(e => e.exits && !e.spText).length}`);
console.log(`  Failed moves (skipped): ${logData.filter(e => e.fail).length}`);
