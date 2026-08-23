import Client from "../Client";
import { parseItems, ContainerItem, getItemCssColor, isItemMagicOrKey } from "./prettyContainers";
import { AnsiAwareBuffer } from "../ansi/FormatState";
import { createColorFormat } from "@modules/core/Colors";
import { getZlomFormatting } from "./zlom";

export type LootPopupPayload = {
    description: string;
    items: LootItem[];
    bodyNumber?: number;
    stertyIndex?: number;
};

export type LootItem = ContainerItem & {
    color?: string;
    fullName: string;
    special?: boolean;
    title?: string;
};

let popupMode = false;

export function setLootPopupMode(enabled: boolean) {
    popupMode = enabled;
}

export type GroundItem = {
    name: string;
    color?: string;
};

// Room contents state parsed from room.contents.object GMCP messages
export interface RoomContentsState {
    bodies: number;
    sterta: number;
    groundItems: GroundItem[];
}

let running = false;
let roomContents: RoomContentsState = { bodies: 0, sterta: 0, groundItems: [] };

/**
 * What the parser last saw on the ground, or null when it is not running.
 *
 * Absent is not the same as empty: an empty room and a stopped parser would
 * otherwise be indistinguishable, and a caller would happily report "nothing here"
 * for a room it never looked at.
 */
export function getRoomContents(): Readonly<RoomContentsState> | null {
    return running ? roomContents : null;
}

function parseRoomContentsObject(text: string) {
    const parts = splitRawParts(text);
    let bodies = 0;
    let sterta = 0;
    const groundItems: GroundItem[] = [];
    for (const part of parts) {
        const lower = part.toLowerCase();
        if (lower.startsWith('cialo ')) {
            bodies++;
        } else if (lower.startsWith('sterta szczatkow')) {
            sterta++;
        } else {
            // First item in the list is Titlecased by the MUD, normalize to lowercase
            const name = part[0].toLowerCase() + part.slice(1);
            groundItems.push({ name, color: getItemCssColor(name) });
        }
    }
    roomContents = { bodies, sterta, groundItems };
}

// Per-body special item extras (bodyIndex → fullName[])
// bodyIndex matches the `N. ciala` numbering used by itemCollector
const bodyExtras = new Map<number | null, string[]>();

// Tracks which body numbers are "smetne pozostalosci" (sterty) and their sterty index
const bodyStertyMap = new Map<number | null, number>();

/** Null when the parser is not running. See getRoomContents. */
export function getBodyExtras(): ReadonlyMap<number | null, string[]> | null {
    return running ? bodyExtras : null;
}

/** Null when the parser is not running. See getRoomContents. */
export function getBodyStertyMap(): ReadonlyMap<number | null, number> | null {
    return running ? bodyStertyMap : null;
}

export function clearBodyExtras() {
    bodyExtras.clear();
    bodyStertyMap.clear();
}

/** Split raw items text into original parts, mirroring parseItems splitting logic */
function splitRawParts(content: string): string[] {
    let rest = content.trim();
    rest = rest.replace(/\s+i\s+([^,]+)(\.)?$/, ', $1');
    rest = rest.replace(/\.$/, '');
    return rest.split(/,\s*/).map(p => p.trim()).filter(p => p.length > 0);
}

function enrichItems(rawText: string): LootItem[] {
    const items = parseItems(rawText);
    const originalParts = splitRawParts(rawText);
    return items.map((item, i) => {
        const zlom = getZlomFormatting(item.name);
        const color = zlom?.color ?? getItemCssColor(item.name);
        const fullName = originalParts[i] ?? item.name;
        const special = isItemMagicOrKey(item.name);
        return { ...item, color, fullName, special, title: zlom?.title };
    });
}

export default function initLootParser(client: Client) {
    const tag = 'lootParser';

    running = true;
    client.scope.onDispose(() => {
        running = false;
        roomContents = { bodies: 0, sterta: 0, groundItems: [] };
        clearBodyExtras();
    });

    const bodyPattern = /^Jest to martwe cialo (?<description>.+)\.$/;
    const remainsPattern = /^Sa to smetne pozostalosci po jaki(?:ms|ejs) (?<description>.+)\.$/;
    const itemsPattern = /^Zauwazasz przy (?:nim|niej) (?<items>.+)\.$/;

    let pendingDescription: string | null = null;
    const pendingBodyNumbers: (number | null)[] = [];
    let pendingStertyIndex: number | null = null;
    let stertyCounter = 0;

    // Flush a pending body/remains that had no "Zauwazasz" items line.
    // Shifts the body number queue to keep it in sync and optionally emits empty entry.
    function flushPendingEmpty() {
        if (pendingDescription) {
            const bodyNumber = pendingBodyNumbers.shift() ?? null;
            if (popupMode) {
                client.sendEvent('loot.popup.open', {
                    description: pendingDescription,
                    items: [],
                    bodyNumber: bodyNumber ?? undefined,
                    stertyIndex: pendingStertyIndex ?? undefined,
                });
            }
            pendingDescription = null;
            pendingStertyIndex = null;
        }
    }

    // Track body number from ob commands: "ob cialo" → null, "ob 2. cialo" → 2
    // Uses a queue since multiple commands may be sent before responses arrive
    const obCialoPattern = /^ob\s+(?:(\d+)\.\s+)?cialo$/i;
    client.registerCommandHook('lootParser.trackBody', (command) => {
        const match = command.match(obCialoPattern);
        if (match) {
            pendingBodyNumbers.push(match[1] ? parseInt(match[1], 10) : null);
        }
        return undefined; // don't modify the command
    });

    client.Triggers.registerTrigger(
        bodyPattern,
        (line, matches) => {
            if (matches?.groups?.description) {
                flushPendingEmpty();
                pendingDescription = matches.groups.description;
                pendingStertyIndex = null;
            }
            return line;
        },
        tag,
    );

    client.Triggers.registerTrigger(
        remainsPattern,
        (line, matches) => {
            if (matches?.groups?.description) {
                flushPendingEmpty();
                stertyCounter++;
                const suffix = matches[0].includes('jakiejs') ? 'jakiejs' : 'jakims';
                pendingDescription = `smetne pozostalosci po ${suffix} ${matches.groups.description}`;
                pendingStertyIndex = stertyCounter;
            }
            return line;
        },
        tag,
    );

    client.Triggers.registerTrigger(
        itemsPattern,
        (line, matches) => {
            if (matches?.groups?.items && pendingDescription) {
                const description = pendingDescription;
                const bodyNumber = pendingBodyNumbers.shift() ?? null;
                const stertyIndex = pendingStertyIndex;
                const items = enrichItems(matches.groups.items);
                pendingDescription = null;
                pendingStertyIndex = null;

                // Track sterty mapping for itemCollector
                if (stertyIndex != null) {
                    bodyStertyMap.set(bodyNumber, stertyIndex);
                }

                // Track special items (magics/keys) per body for itemCollector
                const specialItems = items.filter(item => item.special);
                if (specialItems.length > 0) {
                    const existing = bodyExtras.get(bodyNumber) ?? [];
                    for (const si of specialItems) {
                        if (!existing.includes(si.fullName)) {
                            existing.push(si.fullName);
                        }
                    }
                    bodyExtras.set(bodyNumber, existing);
                }

                if (popupMode) {
                    client.sendEvent('loot.popup.open', {
                        description,
                        items,
                        bodyNumber: bodyNumber ?? undefined,
                        stertyIndex: stertyIndex ?? undefined,
                    });
                    return line;
                }

                const buffer = line instanceof AnsiAwareBuffer ? line.clone() : new AnsiAwareBuffer(String(line));

                // Color items first
                for (const item of items) {
                    if (!item.color) continue;
                    const fmt = createColorFormat(item.color);
                    const haystack = buffer.text.toLowerCase();
                    const needle = item.fullName.toLowerCase();
                    let searchStart = 0;
                    while (searchStart <= buffer.text.length - needle.length) {
                        const idx = haystack.indexOf(needle, searchStart);
                        if (idx === -1) break;
                        buffer.applyFormat([idx, idx + item.fullName.length], fmt);
                        searchStart = idx + item.fullName.length;
                    }
                }

                // Then make items clickable (createLink preserves existing color)
                for (const item of items) {
                    const command = stertyIndex != null
                        ? `wez ${item.fullName.toLowerCase()} z ${stertyIndex}. sterty`
                        : `wez ${item.fullName.toLowerCase()} z ciala ${description.toLowerCase()}`;
                    buffer.createLinksForText(item.fullName, {
                        onClick: () => client.sendCommand(command),
                        title: command,
                    }, { caseInsensitive: true });
                }

                return buffer;
            }
            return line;
        },
        tag,
    );

    // Parse room.contents.object to track bodies, sterta, and ground items
    client.Triggers.registerTrigger(
        (_line, _matches, type) => type === 'room.contents.object' ? ([] as unknown as RegExpMatchArray) : undefined,
        (line) => {
            const text = line instanceof AnsiAwareBuffer ? line.text : String(line);
            if (text.trim()) {
                parseRoomContentsObject(text);
            }
            return line;
        },
        tag,
    );

    client.on('enterLocation', () => {
        const hadData = popupMode ||
            bodyExtras.size > 0 ||
            pendingBodyNumbers.length > 0 ||
            stertyCounter > 0 ||
            roomContents.bodies > 0 ||
            roomContents.sterta > 0 ||
            roomContents.groundItems.length > 0;

        popupMode = false;
        bodyExtras.clear();
        pendingBodyNumbers.length = 0;
        stertyCounter = 0;
        roomContents = { bodies: 0, sterta: 0, groundItems: [] };

        if (hadData) {
            client.sendEvent('loot.cleared');
        }
    });

    client.on('loot.popup.closed', () => {
        popupMode = false;
    });
}
