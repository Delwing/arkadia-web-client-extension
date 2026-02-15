import Client from "../Client";
import { parseItems, ContainerItem, getItemCssColor } from "./prettyContainers";
import { AnsiAwareBuffer } from "../ansi/FormatState";
import { createColorFormat } from "@modules/core/Colors";
import eventBus from "@modules/core/eventBus";

export type LootPopupPayload = {
    description: string;
    items: LootItem[];
};

export type LootItem = ContainerItem & {
    color?: string;
    fullName: string;
};

let popupMode = false;

export function setLootPopupMode(enabled: boolean) {
    popupMode = enabled;
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
        return { ...item, color, fullName };
    });
}

export default function initLootParser(client: Client) {
    const tag = 'lootParser';

    const bodyPattern = /^Jest to martwe cialo (?<description>.+)\.$/;
    const itemsPattern = /^Zauwazasz przy (?:nim|niej) (?<items>.+)\.$/;

    let pendingDescription: string | null = null;

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
                const items = enrichItems(matches.groups.items);
                pendingDescription = null;

                if (popupMode) {
                    client.sendEvent('loot.popup.open', { description, items });
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
        client.sendEvent('loot.cleared');
    });

    eventBus.on('loot.popup.closed', () => {
        popupMode = false;
    });
}
