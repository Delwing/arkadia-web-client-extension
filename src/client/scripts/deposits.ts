import Client from "../Client";
import { prettyPrintContainer, parseItems, ContainerItem } from "./prettyContainers";
import { createColorFormat } from "@modules/core/Colors";
import { AnsiAwareBuffer } from "../ansi/FormatState";

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

const BANK_LABEL_COLOR = createColorFormat('#6a5acd');
const BANK_NAME_COLOR = createColorFormat('#ff6347');
const ITEM_NAME_COLOR = createColorFormat('#00ff7f');

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

    const matchContents = (line: any) => {
        const text = line.text;
        const match = text.match(/^Twoj depozyt zawiera (?<content>.+)\.$/);
        if (match) {
            match.groups = Object.assign({ container: 'depozyt' }, match.groups);
        }
        return match;
    };
    const matchEmpty = (line: any) => {
        const text = line.text;
        return text.match(/^Twoj depozyt jest pusty\./);
    };
    const matchNone = (line: any) => {
        const text = line.text;
        return text.match(/^Nie posiadasz wykupionego depozytu\./);
    };

    client.Triggers.registerTrigger(matchContents, (line, matches) => {
        if (!matches) return line;
        const text = (matches.groups?.content || matches[1]).replace(/\.$/, "");
        const items = parseItems(text);
        update(items);
        const output = prettyPrintContainer(matches as RegExpMatchArray, columns, 'DEPOZYT', 5, width);
        client.print(output);
        return line;
    });
    client.Triggers.registerTrigger(matchEmpty, (line) => { update([] as ContainerItem[]); return line; });
    client.Triggers.registerTrigger(matchNone, (line) => { update(null); return line; });

    function printDeposits() {
        const output = new AnsiAwareBuffer();
        const depositEntries = Object.values(deposits);

        if (depositEntries.length === 0) {
            client.println("Brak zapisanych depozytow.");
            return;
        }

        depositEntries.forEach(({ name, items }, index) => {
            if (index > 0) {
                output.append('\n');
            }

            const line = new AnsiAwareBuffer();

            // Add colored "bank:" label
            const bankLabel = new AnsiAwareBuffer('bank:');
            bankLabel.color([0, bankLabel.length], BANK_LABEL_COLOR);
            line.appendBuffer(bankLabel);
            line.append('    ');

            // Add colored bank name
            const bankName = new AnsiAwareBuffer(name);
            bankName.color([0, bankName.length], BANK_NAME_COLOR);
            line.appendBuffer(bankName);

            if (items === null) {
                line.append(' brak depozytu');
                output.appendBuffer(line);
                return;
            }
            if (items.length === 0) {
                line.append(' (pusty)');
                output.appendBuffer(line);
                return;
            }

            output.appendBuffer(line);

            items.forEach(it => {
                output.append('\n');
                const itemLine = new AnsiAwareBuffer();
                const count = String(it.count).padStart(3, ' ');
                itemLine.append(`    ${count} | `);

                const itemName = new AnsiAwareBuffer(it.name);
                itemName.color([0, itemName.length], ITEM_NAME_COLOR);
                itemLine.appendBuffer(itemName);

                output.appendBuffer(itemLine);
            });
        });

        client.println(output);
    }

    if (aliases) {
        aliases.push({ pattern: /\/depozyt$/, callback: () => client.sendCommand("przejrzyj depozyt") });
        aliases.push({ pattern: /\/depozyty$/, callback: printDeposits });
        aliases.push({ pattern: /\/depozyt_reset$/, callback: clearDeposits });
    }

    window.addEventListener("beforeunload", persist);
}

export { deposits };
