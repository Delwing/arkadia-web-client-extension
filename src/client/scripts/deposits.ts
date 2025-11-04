import Client from "../Client";
import { stripAnsiCodes } from "../Triggers";
import { prettyPrintContainer, parseItems, ContainerItem } from "./prettyContainers";
import { colorString, findClosestColor } from "@modules/core/Colors";

interface DepositInfo {
    name: string;
    items: ContainerItem[] | null;
}

const STORAGE_KEY = "deposits";

const deposits: Record<number, DepositInfo> = {};

function cloneDeposits(source: Record<number, DepositInfo> | undefined | null): Record<number, DepositInfo> {
    const result: Record<number, DepositInfo> = {};
    if (!source) {
        return result;
    }
    Object.entries(source).forEach(([key, info]) => {
        if (!info) {
            return;
        }
        result[Number(key)] = {
            name: info.name,
            items: Array.isArray(info.items) ? info.items.map(item => ({ ...item })) : null,
        };
    });
    return result;
}

const BANK_LABEL_COLOR = findClosestColor('#6a5acd');
const BANK_NAME_COLOR = findClosestColor('#ff6347');
const ITEM_NAME_COLOR = findClosestColor('#00ff7f');

function isBankRoom(room: any): boolean {
    return !!room?.userData?.bind && room.userData.bind.includes("depozyt");
}

export default function initDeposits(client: Client, aliases?: { pattern: RegExp; callback: Function }[]) {
    client.on("storage", ({ key, value }) => {
        if (key === STORAGE_KEY) {
            const nextDeposits = cloneDeposits(value as Record<number, DepositInfo> | undefined);
            Object.keys(deposits).forEach(key => delete deposits[Number(key)]);
            Object.assign(deposits, nextDeposits);
        }
    });

    client.port?.postMessage({ type: "GET_STORAGE", key: STORAGE_KEY });

    const persist = () => {
        const snapshot = cloneDeposits(deposits);
        client.port?.postMessage({ type: "SET_STORAGE", key: STORAGE_KEY, value: snapshot });
    };

    const clearDeposits = () => {
        Object.keys(deposits).forEach(key => delete deposits[Number(key)]);
        persist();
        client.println("Zapisane depozyty zostaly usuniete.");
    };

    let columns = 1;
    let width = client.contentWidth;
    client.on('settings', (settings) => {
        const detail = (settings ?? {}) as { containerColumns?: number };
        columns = detail.containerColumns ?? columns;
    });
    client.on('contentWidth', (value) => {
        width = value;
    });

    function update(items: ContainerItem[] | null) {
        const room = client.Map.currentRoom as any;
        if (!isBankRoom(room)) {
            return;
        }
        deposits[room.id] = {
            name: room.name || `Bank ${room.id}`,
            items,
        };
        persist();
    }

    const matchContents = (triggerLine: any) => {
        const line = triggerLine.text;
        const match = stripAnsiCodes(line).match(/^Twoj depozyt zawiera (?<content>.+)\.$/);
        if (match) {
            match.groups = Object.assign({ container: 'depozyt' }, match.groups);
        }
        return match;
    };
    const matchEmpty = (triggerLine: any) => {
        const line = triggerLine.text;
        return stripAnsiCodes(line).match(/^Twoj depozyt jest pusty\./);
    };
    const matchNone = (triggerLine: any) => {
        const line = triggerLine.text;
        return stripAnsiCodes(line).match(/^Nie posiadasz wykupionego depozytu\./);
    };

    client.Triggers.registerTrigger(matchContents, (triggerLine) => {
        const m = triggerLine.matches.matches;
        if (!m) return triggerLine;
        const text = (m.groups?.content || m[1]).replace(/\.$/, "");
        const items = parseItems(text);
        update(items);
        client.print(prettyPrintContainer(m as RegExpMatchArray, columns, 'DEPOZYT', 5, width));
        return triggerLine;
    });
    client.Triggers.registerTrigger(matchEmpty, (triggerLine) => { update([] as ContainerItem[]); return triggerLine; });
    client.Triggers.registerTrigger(matchNone, (triggerLine) => { update(null); return triggerLine; });

    function printDeposits() {
        const lines: string[] = [];
        Object.values(deposits).forEach(({ name, items }) => {
            const bankLabel = colorString('bank:', BANK_LABEL_COLOR);
            const bankName = colorString(name, BANK_NAME_COLOR);

            if (items === null) {
                lines.push(`${bankLabel}    ${bankName} brak depozytu`);
                return;
            }
            if (items.length === 0) {
                lines.push(`${bankLabel}    ${bankName} (pusty)`);
                return;
            }

            lines.push(`${bankLabel}    ${bankName}`);
            items.forEach(it => {
                const count = String(it.count).padStart(3, ' ');
                lines.push(`    ${count} | ${colorString(it.name, ITEM_NAME_COLOR)}`);
            });
        });

        if (lines.length === 0) {
            client.println("Brak zapisanych depozytow.");
        } else {
            client.println(lines.join("\n"));
        }
    }

    if (aliases) {
        aliases.push({ pattern: /\/depozyt$/, callback: () => client.sendCommand("przejrzyj depozyt") });
        aliases.push({ pattern: /\/depozyty$/, callback: printDeposits });
        aliases.push({ pattern: /\/depozyt_reset$/, callback: clearDeposits });
    }

    window.addEventListener("beforeunload", persist);
}

export { deposits };
