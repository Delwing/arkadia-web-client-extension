import Client from "../Client";
import { prettyPrintContainer, parseItems, getTransformDefinitions, ContainerItem } from "./prettyContainers";
import { convertCurrency } from "./priceEvaluation";
import { createColorFormat } from "@modules/core/Colors";
import { AnsiAwareBuffer } from "../ansi/FormatState";

const BANK_NAME_COLOR = createColorFormat('#ff6347');

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
        const match = text.match(/Twoj depozyt zawiera (?<content>.+)\.$/);
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
        const depositEntries = Object.values(deposits);

        if (depositEntries.length === 0) {
            client.println("Brak zapisanych depozytow.");
            return;
        }

        const transforms = getTransformDefinitions();
        const pad = 1;

        type Card = { title: string; lines: AnsiAwareBuffer[]; contentWidth: number };
        const cards: Card[] = [];

        for (const { name, items } of depositEntries) {
            const lines: AnsiAwareBuffer[] = [];
            let contentWidth = name.length;

            if (items === null) {
                const line = new AnsiAwareBuffer('brak depozytu');
                lines.push(line);
                contentWidth = Math.max(contentWidth, line.text.length);
            } else if (items.length === 0) {
                const line = new AnsiAwareBuffer('(pusty)');
                lines.push(line);
                contentWidth = Math.max(contentWidth, line.text.length);
            } else {
                for (const item of items) {
                    const countStr = String(item.count).padStart(3, ' ');
                    const itemLine = new AnsiAwareBuffer(`${countStr} | `);
                    let nameBuffer = new AnsiAwareBuffer(item.name);
                    for (const tr of transforms) {
                        nameBuffer = tr.transform(nameBuffer, item, '');
                    }
                    itemLine.appendBuffer(nameBuffer);
                    contentWidth = Math.max(contentWidth, itemLine.text.length);
                    lines.push(itemLine);
                }
            }

            cards.push({ title: name, lines, contentWidth });
        }

        // Calculate total coin wealth across all deposits
        let totalCopper = 0;
        for (const { items } of depositEntries) {
            if (!items) continue;
            for (const item of items) {
                const count = typeof item.count === 'number' ? item.count : 0;
                if (count <= 0) continue;
                if (item.name.match(/mithryl\w+ monet/)) totalCopper += count * 24000;
                else if (item.name.match(/zlot\w+ monet/)) totalCopper += count * 240;
                else if (item.name.match(/srebrn\w+ monet/)) totalCopper += count * 12;
                else if (item.name.match(/miedzian\w+ monet/)) totalCopper += count;
            }
        }

        const colContentWidth = Math.max(...cards.map(c => c.contentWidth));
        const colWidth = colContentWidth + pad * 2 + 2;
        const gap = 2;

        let numCols = cards.length;
        while (numCols > 1 && numCols * colWidth + (numCols - 1) * gap > width) {
            numCols--;
        }

        const horiz = '-'.repeat(colContentWidth + pad * 2);
        const padStr = ' '.repeat(pad);
        const gapStr = ' '.repeat(gap);
        const output = new AnsiAwareBuffer();

        for (let rowStart = 0; rowStart < cards.length; rowStart += numCols) {
            const rowCards = cards.slice(rowStart, rowStart + numCols);
            const maxLines = Math.max(...rowCards.map(c => c.lines.length));

            if (rowStart > 0) output.append('\n');

            // top border
            output.append(rowCards.map(() => `+${horiz}+`).join(gapStr) + '\n');

            // title row
            const titleLine = new AnsiAwareBuffer();
            for (let c = 0; c < rowCards.length; c++) {
                if (c > 0) titleLine.append(gapStr);
                const title = rowCards[c].title;
                titleLine.append(`|${padStr}`);
                const titleBuf = new AnsiAwareBuffer(title);
                titleBuf.color([0, titleBuf.length], BANK_NAME_COLOR);
                titleLine.appendBuffer(titleBuf);
                titleLine.append(`${' '.repeat(colContentWidth - title.length)}${padStr}|`, {});
            }
            output.appendBuffer(titleLine);
            output.append('\n');

            // separator
            output.append(rowCards.map(() => `+${horiz}+`).join(gapStr) + '\n');

            // item rows
            for (let i = 0; i < maxLines; i++) {
                const rowLine = new AnsiAwareBuffer();
                for (let c = 0; c < rowCards.length; c++) {
                    if (c > 0) rowLine.append(gapStr);
                    const card = rowCards[c];
                    if (i < card.lines.length) {
                        const line = card.lines[i];
                        rowLine.append(`|${padStr}`);
                        rowLine.appendBuffer(line);
                        const remaining = colContentWidth - line.text.length;
                        if (remaining > 0) rowLine.append(' '.repeat(remaining), {});
                        rowLine.append(`${padStr}|`, {});
                    } else {
                        rowLine.append(`|${' '.repeat(colContentWidth + pad * 2)}|`);
                    }
                }
                output.appendBuffer(rowLine);
                output.append('\n');
            }

            // bottom border
            output.append(rowCards.map(() => `+${horiz}+`).join(gapStr));
        }

        if (totalCopper > 0) {
            const totalWidth = numCols * colWidth + (numCols - 1) * gap;
            output.append('\n\n🪙 ');
            output.appendBuffer(convertCurrency(totalCopper));
            output.append('\n', {});
            output.append('-'.repeat(totalWidth));
        }

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
