import Client from "../Client";
import { stripAnsiCodes } from "../Triggers";
import { prettyPrintContainer, parseItems, ContainerItem } from "./prettyContainers";
import { colorString, findClosestColor } from "../Colors";

interface DepositInfo {
    name: string;
    items: ContainerItem[] | null;
}

const STORAGE_KEY = "deposits";

const deposits: Record<number, DepositInfo> = {};

const BANK_LABEL_COLOR = findClosestColor('#6a5acd');
const BANK_NAME_COLOR = findClosestColor('#ff6347');
const ITEM_NAME_COLOR = findClosestColor('#00ff7f');

function isBankRoom(room: any): boolean {
    return !!room?.userData?.bind && room.userData.bind.includes("depozyt");
}

export default function initDeposits(client: Client, aliases?: { pattern: RegExp; callback: Function }[]) {
    client.addEventListener("storage", (event: CustomEvent) => {
        if (event.detail.key === STORAGE_KEY) {
            Object.keys(deposits).forEach(key => delete deposits[Number(key)]);
            if (event.detail.value) {
                Object.assign(deposits, event.detail.value);
            }
        }
    });

    client.port?.postMessage({ type: "GET_STORAGE", key: STORAGE_KEY });

    const persist = () => {
        client.port?.postMessage({ type: "SET_STORAGE", key: STORAGE_KEY, value: deposits });
    };

    const clearDeposits = () => {
        Object.keys(deposits).forEach(key => delete deposits[Number(key)]);
        persist();
        client.println("Zapisane depozyty zostaly usuniete.");
    };

    let columns = 1;
    let width = client.contentWidth;
    client.addEventListener('settings', (ev: CustomEvent) => {
        columns = ev.detail.containerColumns ?? columns;
    });
    client.addEventListener('contentWidth', (ev: CustomEvent) => {
        width = ev.detail;
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

    const matchContents = (_raw: string, line: string) => {
        const match = stripAnsiCodes(line).match(/^Twoj depozyt zawiera (?<content>.+)\.$/);
        if (match) {
            match.groups = Object.assign({ container: 'depozyt' }, match.groups);
        }
        return match;
    };
    const matchEmpty = (_raw: string, line: string) => {
        return stripAnsiCodes(line).match(/^Twoj depozyt jest pusty\./);
    };
    const matchNone = (_raw: string, line: string) => {
        return stripAnsiCodes(line).match(/^Nie posiadasz wykupionego depozytu\./);
    };

    client.Triggers.registerTrigger(matchContents, (_r, _l, m) => {
        const text = (m.groups?.content || m[1]).replace(/\.$/, "");
        const items = parseItems(text);
        update(items);
        client.print(prettyPrintContainer(m as RegExpMatchArray, columns, 'DEPOZYT', 5, width));
        return undefined;
    });
    client.Triggers.registerTrigger(matchEmpty, () => { update([] as ContainerItem[]); return undefined; });
    client.Triggers.registerTrigger(matchNone, () => { update(null); return undefined; });

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
