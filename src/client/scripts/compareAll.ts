import Client from "../Client";
import {AnsiAwareBuffer} from "@client/ansi/FormatState.ts";
import {createColorFormat} from "@modules/core/Colors";
import {parseComparisonStats, type ComparisonStats} from "./comparisonUtils";

export type {ComparisonStats};

const positiveColor = createColorFormat("#ff0000"); // Red for positive values (you're weaker)
const negativeColor = createColorFormat("#00ff00"); // Green for negative values (you're stronger)
const neutralColor = createColorFormat("#ffff00"); // Yellow for 0 values (equal)

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

    const padLeft = (str: string, len: number) => " ".repeat(Math.max(0, len - str.length)) + str;

    const getColor = (n: number | undefined) => {
        if (n === undefined || n === 0) return neutralColor;
        return n < 0 ? negativeColor : positiveColor;
    };

    results.forEach(({stats, buffer}, name) => {
        const total = (stats.sil || 0) + (stats.zre || 0) + (stats.wyt || 0);
        const numCol = pad(String(i), 3);
        const silCol = padLeft(formatVal(stats.sil), 4);
        const zreCol = padLeft(formatVal(stats.zre), 4);
        const wytCol = padLeft(formatVal(stats.wyt), 4);
        const sumaCol = padLeft(formatVal(total), 5);

        // Calculate padding needed after colored name
        const paddingNeeded = NAME_WIDTH - name.length;
        const padding = " ".repeat(Math.max(0, paddingNeeded));

        // Insert row number with default color
        result.insert(result.length, `${numCol} `, {});
        // Insert colored NPC name from original buffer
        result.insertBuffer(result.length, buffer);
        // Insert stats with colors
        result.insert(result.length, `${padding} `, {});
        result.insert(result.length, silCol, getColor(stats.sil));
        result.insert(result.length, " ", {});
        result.insert(result.length, zreCol, getColor(stats.zre));
        result.insert(result.length, " ", {});
        result.insert(result.length, wytCol, getColor(stats.wyt));
        result.insert(result.length, " ", {});
        result.insert(result.length, sumaCol, getColor(total));
        result.insert(result.length, "\n", {});
        i++;
    });

    return result;
}

export function displayComparisonResults(client: Client) {
    if (pending > 0) {
        client.print("Nie wszystkie dane porownania zostaly odebrane. Poczekaj lub sprobuj ponownie.");
        return;
    }
    if (comparisonResults.size === 0) {
        client.print("Brak danych porownania.");
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
    // Or: "Wydaje ci sie, ze jestes rownie silny, rownie dobrze zbudowany i rownie zreczny jak surowy przysadzisty oficer."
    const triggerPattern = /^(?:Wydaje ci sie|Masz wrazenie), ze jestes (.+?) (?:niz|jak) (.+)\.$/m;

    client.Triggers.registerMultilineTrigger(triggerPattern, (line, matches) => {
        if (!queue.length) return line;

        const descriptions = matches[1];
        const osoba = matches[2].trim();

        // Extract the colored buffer for the NPC name from the original line
        // The regex already captured the name in matches[2], we just need to find it in the line
        // and extract it with its colors
        const osobaStartInText = line.text.indexOf(osoba);
        if (osobaStartInText === -1) return null;

        const osobaEndInText = osobaStartInText + osoba.length;

        // Extract the colored buffer for just the NPC name
        const osobaBuffer = new AnsiAwareBuffer();
        let currentPos = 0;
        for (const segment of line.getSegments()) {
            const segmentEnd = currentPos + segment.text.length;
            if (segmentEnd > osobaStartInText && currentPos < osobaEndInText) {
                const startOffset = Math.max(0, osobaStartInText - currentPos);
                const endOffset = Math.min(segment.text.length, osobaEndInText - currentPos);
                if (endOffset > startOffset) {
                    const extractedText = segment.text.substring(startOffset, endOffset);
                    osobaBuffer.insert(osobaBuffer.length, extractedText, segment.state);
                }
            }
            currentPos = segmentEnd;
        }

        // Parse the comparison descriptions using shared utility
        const parsedStats = parseComparisonStats(descriptions);

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
            client.print("Nie ma nikogo do porownania.");
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

