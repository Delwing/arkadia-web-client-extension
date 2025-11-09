import Client from "../Client";
import {AnsiAwareBuffer} from "@client/ansi/FormatState.ts";

export interface ComparisonStats {
    sil?: number;
    zre?: number;
    wyt?: number;
}

const level: Record<string, number> = {
    "rownie dobrze zbudowan": 0,
    "niewiele lepiej zbudowan": 1,
    "troche lepiej zbudowan": 2,
    "lepiej zbudowan": 3,
    "znacznie lepiej zbudowan": 4,
    "duzo lepiej zbudowan": 5,
    "rownie siln": 0,
    "niewiele silniejsz": 1,
    "troche silniejsz": 2,
    "silniejsz": 3,
    "znacznie silniejsz": 4,
    "duzo silniejsz": 5,
    "rownie zreczn": 0,
    "niewiele zreczniejsz": 1,
    "troche zreczniejsz": 2,
    "zreczniejsz": 3,
    "znacznie zreczniejsz": 4,
    "duzo zreczniejsz": 5,
};

let comparisonResults: Map<string, { stats: ComparisonStats; buffer: AnsiAwareBuffer }> = new Map();
let queue: { target: string; stat: keyof ComparisonStats }[] = [];
let pending = 0;

function getTargets(client: Client): string[] {
    return client
        .ObjectManager
        .getObjectsOnLocation()
        .filter(o => o.shortcut !== "@")
        .map(o => String(o.num));
}

export function formatComparisonTable(results: Map<string, { stats: ComparisonStats; buffer: AnsiAwareBuffer }>): AnsiAwareBuffer {
    // Calculate the width needed for the longest name, with a minimum of 5 (for "OSOBA")
    const names = Array.from(results.keys());
    const NAME_WIDTH = Math.max(5, ...names.map(n => n.length));

    const pad = (str: string, len: number) => str + " ".repeat(Math.max(0, len - str.length));
    const header = [
        pad("#", 3),
        pad("OSOBA", NAME_WIDTH),
        pad("SIL", 4),
        pad("ZRE", 4),
        pad("WYT", 4),
        pad("SUMA", 5)
    ].join(" ");
    const line = [
        pad("--", 3),
        "-".repeat(NAME_WIDTH),
        "----",
        "----",
        "----",
        "-----"
    ].join(" ");

    const result = new AnsiAwareBuffer();
    result.insert(0, header + "\n", {});
    result.insert(result.length, line + "\n", {});

    let i = 1;
    const formatVal = (n: number | undefined) => {
        if (n === undefined) return "0";
        return n > 0 ? `+${n}` : String(n);
    };

    results.forEach(({stats, buffer}, name) => {
        const total = (stats.sil || 0) + (stats.zre || 0) + (stats.wyt || 0);
        const numCol = pad(String(i), 3);
        const silCol = pad(formatVal(stats.sil), 4);
        const zreCol = pad(formatVal(stats.zre), 4);
        const wytCol = pad(formatVal(stats.wyt), 4);
        const sumaCol = pad(formatVal(total), 5);

        // Calculate padding needed after colored name
        const paddingNeeded = NAME_WIDTH - name.length;
        const padding = " ".repeat(Math.max(0, paddingNeeded));

        // Insert row number with default color
        result.insert(result.length, `${numCol} `, {});
        // Insert colored NPC name from original buffer
        result.insertBuffer(result.length, buffer);
        // Insert stats with default color (explicitly set empty state to prevent color bleeding)
        result.insert(result.length, `${padding} ${silCol} ${zreCol} ${wytCol} ${sumaCol}\n`, {});
        i++;
    });

    return result;
}

export function displayComparisonResults(client: Client) {
    if (pending > 0) {
        client.print("Not all comparison data has been received. Please wait or try again.");
        return;
    }
    if (comparisonResults.size === 0) {
        client.print("No comparison data available.");
        return;
    }
    client.println(formatComparisonTable(comparisonResults));
}

export default function initCompareAll(
    client: Client,
    aliases?: { pattern: RegExp; callback: Function }[]
) {
    // Single line format with comma-separated comparisons
    // Example: "Wydaje ci sie, ze jestes duzo silniejszy, duzo lepiej zbudowany i zreczniejszy niz korpulentny rumiany halfling."
    const triggerPattern = /^(?:Wydaje ci sie|Masz wrazenie), ze jestes (.+?) niz (.+)\.$/m;

    client.Triggers.registerMultilineTrigger(triggerPattern, (line, matches) => {
        if (!queue.length) return line;

        const descriptions = matches[1];
        const osoba = matches[2].trim();

        // Extract the colored buffer for the NPC name from the original line
        // Find the position where " niz " appears in the text
        const nizIndex = line.text.indexOf(" niz ");
        if (nizIndex === -1) return null;

        // The NPC name starts right after " niz " and ends before the "."
        const nameStartIndex = nizIndex + 5; // " niz ".length
        const nameEndIndex = line.text.indexOf(".", nameStartIndex);

        // Extract the colored buffer for just the NPC name
        const osobaBuffer = new AnsiAwareBuffer();
        let currentPos = 0;
        for (const segment of line.getSegments()) {
            const segmentEnd = currentPos + segment.text.length;
            if (segmentEnd > nameStartIndex && currentPos < nameEndIndex) {
                const startOffset = Math.max(0, nameStartIndex - currentPos);
                const endOffset = Math.min(segment.text.length, nameEndIndex - currentPos);
                if (endOffset > startOffset) {
                    const extractedText = segment.text.substring(startOffset, endOffset);
                    osobaBuffer.insert(osobaBuffer.length, extractedText, segment.state);
                }
            }
            currentPos = segmentEnd;
        }

        // Parse the comma/conjunction-separated descriptions
        // Split by " i " first to handle the last conjunction, then by ","
        const parts = descriptions.split(/ i |, /).map(s => s.trim()).filter(Boolean);

        // Sort level entries by description length (longest first) to match most specific first
        const sortedLevelEntries = Object.entries(level).sort((a, b) => b[0].length - a[0].length);

        const parsedStats: Partial<ComparisonStats> = {};

        // Process each description part
        for (const desc of parts) {
            // Find which stat this description matches and get its value
            let matchedStat: keyof ComparisonStats | null = null;
            let val = 0;

            // Check for strength-related descriptions
            if (desc.includes("siln")) {
                matchedStat = "sil";
                // Find the matching level description
                for (const [levelDesc, levelVal] of sortedLevelEntries) {
                    if (levelDesc.includes("siln") && desc.includes(levelDesc)) {
                        val = -levelVal; // Negative because "jestes X" means you are stronger
                        break;
                    }
                }
            }
            // Check for dexterity-related descriptions
            else if (desc.includes("zreczn")) {
                matchedStat = "zre";
                for (const [levelDesc, levelVal] of sortedLevelEntries) {
                    if (levelDesc.includes("zreczn") && desc.includes(levelDesc)) {
                        val = -levelVal;
                        break;
                    }
                }
            }
            // Check for constitution-related descriptions (zbudowany)
            else if (desc.includes("zbudowan")) {
                matchedStat = "wyt";
                for (const [levelDesc, levelVal] of sortedLevelEntries) {
                    if (levelDesc.includes("zbudowan") && desc.includes(levelDesc)) {
                        val = -levelVal;
                        break;
                    }
                }
            }

            if (matchedStat) {
                parsedStats[matchedStat] = val;
            }
        }

        // Now consume queue entries and populate results
        // The queue should have entries for this NPC's stats
        const statsFound = Object.keys(parsedStats).length;
        if (statsFound > 0) {
            // Remove the corresponding number of entries from the queue
            for (let i = 0; i < statsFound && queue.length > 0; i++) {
                queue.shift();
                pending--;
            }

            // Store the results with the colored buffer
            comparisonResults.set(osoba, {
                stats: parsedStats as ComparisonStats,
                buffer: osobaBuffer
            });
        }

        return line.markAsDeleted();
    }, "compare-all");

    function findByShortcut(short: string): string | undefined {
        const lower = short.toLowerCase();
        const obj = client
            .ObjectManager
            .getObjectsOnLocation()
            .find(o => o.shortcut?.toLowerCase() === lower);
        return obj ? String(obj.num) : undefined;
    }

    function run(short?: string) {
        comparisonResults = new Map();
        queue = [];
        const id = short ? findByShortcut(short) : undefined;
        const targets = short ? (id ? [id] : []) : getTargets(client);
        pending = targets.length * 3; // Still expecting 3 stats per target
        if (pending === 0) {
            client.print("No one else is here to compare with.");
            return;
        }
        // Send single "ocen" command per target (returns all 3 stats in one line)
        targets.forEach(id => {
            queue.push({ target: id, stat: "sil" });
            queue.push({ target: id, stat: "zre" });
            queue.push({ target: id, stat: "wyt" });
            client.sendCommand(`ocen ob_${id}`, false);
        });
        setTimeout(() => displayComparisonResults(client), 500);
    }

    if (aliases) {
        aliases.push({
            pattern: /^\/por(?: ([A-Za-z0-9]+))?$/,
            callback: (m: RegExpMatchArray) => run(m[1])
        });
    }
}

