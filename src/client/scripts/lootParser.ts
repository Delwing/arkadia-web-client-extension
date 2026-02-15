import Client from "../Client";
import { parseItems, ContainerItem, getItemCssColor, isItemMagicOrKey } from "./prettyContainers";
import { AnsiAwareBuffer } from "../ansi/FormatState";
import { createColorFormat } from "@modules/core/Colors";
import eventBus from "@modules/core/eventBus";

export type LootPopupPayload = {
    description: string;
    items: LootItem[];
    bodyNumber?: number;
};

export type LootItem = ContainerItem & {
    color?: string;
    fullName: string;
    special?: boolean;
};

let popupMode = false;

export function setLootPopupMode(enabled: boolean) {
    popupMode = enabled;
}

// Per-body special item extras (bodyIndex → fullName[])
// bodyIndex matches the `N. ciala` numbering used by itemCollector
const bodyExtras = new Map<number | null, string[]>();

export function getBodyExtras(): ReadonlyMap<number | null, string[]> {
    return bodyExtras;
}

export function clearBodyExtras() {
    bodyExtras.clear();
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
        const color = getItemCssColor(item.name);
        const fullName = originalParts[i] ?? item.name;
        const special = isItemMagicOrKey(item.name);
        return { ...item, color, fullName, special };
    });
}

export default function initLootParser(client: Client) {
    const tag = 'lootParser';

    const bodyPattern = /^Jest to martwe cialo (?<description>.+)\.$/;
    const itemsPattern = /^Zauwazasz przy (?:nim|niej) (?<items>.+)\.$/;

    let pendingDescription: string | null = null;
    let pendingBodyNumber: number | null = null;

    // Track body number from ob commands: "ob cialo" → null, "ob 2. cialo" → 2
    const obCialoPattern = /^ob\s+(?:(\d+)\.\s+)?cialo$/i;
    client.registerCommandHook('lootParser.trackBody', (command) => {
        const match = command.match(obCialoPattern);
        if (match) {
            pendingBodyNumber = match[1] ? parseInt(match[1], 10) : null;
        }
        return undefined; // don't modify the command
    });

    client.Triggers.registerTrigger(
        bodyPattern,
        (line, matches) => {
            if (matches?.groups?.description) {
                pendingDescription = matches.groups.description;
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
                const bodyNumber = pendingBodyNumber;
                const items = enrichItems(matches.groups.items);
                pendingDescription = null;
                pendingBodyNumber = null;

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
                    client.sendEvent('loot.popup.open', { description, items, bodyNumber: bodyNumber ?? undefined });
                    return line;
                }

                const buffer = line instanceof AnsiAwareBuffer ? line.clone() : new AnsiAwareBuffer(String(line));

                // Color items first
                for (const item of items) {
                    if (item.color) {
                        const colorFormat = createColorFormat(item.color);
                        const haystack = buffer.text.toLowerCase();
                        const needle = item.fullName.toLowerCase();
                        let searchStart = 0;
                        while (searchStart <= buffer.text.length - needle.length) {
                            const idx = haystack.indexOf(needle, searchStart);
                            if (idx === -1) break;
                            buffer.color([idx, idx + item.fullName.length], colorFormat);
                            searchStart = idx + item.fullName.length;
                        }
                    }
                }

                // Then make items clickable (createLink preserves existing color)
                for (const item of items) {
                    const command = `wez ${item.fullName} z ciala ${description}`;
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

    client.on('enterLocation', () => {
        popupMode = false;
        bodyExtras.clear();
        client.sendEvent('loot.cleared');
    });

    eventBus.on('loot.popup.closed', () => {
        popupMode = false;
    });
}
