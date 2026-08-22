import Client from "../Client";
import { prettyPrintContainer, parseItems, getTransformDefinitions, ContainerItem } from "./prettyContainers";
import { convertCurrency } from "./priceEvaluation";
import { createColorFormat } from "@modules/core/Colors";
import { AnsiAwareBuffer } from "../ansi/FormatState";
import eventBus from "@modules/core/eventBus";
import { characterStorage } from "@modules/core/storage";
import { defaultSettings } from "@modules/core/defaultSettings";

const BANK_NAME_COLOR = createColorFormat('#ff6347');

export interface DepositInfo {
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

export function getDepositsData(): Record<number, DepositInfo> {
    return cloneDeposits(deposits);
}

export function getTotalCopper(deposits: Record<number, DepositInfo>): number {
    let totalCopper = 0;
    for (const { items } of Object.values(deposits)) {
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
    return totalCopper;
}

export default function initDeposits(client: Client, aliases?: { pattern: RegExp; callback: Function }[]) {
    const loadDeposits = (value: Record<number, DepositInfo> | undefined) => {
        const nextDeposits = cloneDeposits(value);
        Object.keys(deposits).forEach(key => delete deposits[Number(key)]);
        Object.assign(deposits, nextDeposits);
        eventBus.emit("deposits.updated");
    };
    loadDeposits(characterStorage.get(STORAGE_KEY) as Record<number, DepositInfo> | undefined);
    characterStorage.onChange(STORAGE_KEY, (value) => {
        loadDeposits(value as Record<number, DepositInfo> | undefined);
    });

    const persist = () => {
        const snapshot = cloneDeposits(deposits);
        characterStorage.set(STORAGE_KEY, snapshot);
        eventBus.emit("deposits.updated");
    };

    const clearDeposits = () => {
        Object.keys(deposits).forEach(key => delete deposits[Number(key)]);
        persist();
        client.println("Zapisane depozyty zostaly usuniete.");
    };

    let columns = 1;
    let width = client.contentWidth;
    const applySettings = (settings: any) => {
        const detail = (settings ?? defaultSettings) as { containerColumns?: number };
        columns = detail.containerColumns ?? columns;
    };
    applySettings(characterStorage.get('settings'));
    characterStorage.onChange('settings', (settings) => {
        applySettings(settings);
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

        type Card = { title: string; countLabel: string; lines: AnsiAwareBuffer[]; contentWidth: number; small: boolean };
        const cards: Card[] = [];

        for (const { name, items } of depositEntries) {
            const lines: AnsiAwareBuffer[] = [];
            let contentWidth = name.length;
            let small = false;
            let countLabel = '';

            if (items === null) {
                const line = new AnsiAwareBuffer('brak depozytu');
                lines.push(line);
                contentWidth = Math.max(contentWidth, line.text.length);
                small = true;
            } else if (items.length === 0) {
                const line = new AnsiAwareBuffer('(pusty)');
                lines.push(line);
                contentWidth = Math.max(contentWidth, line.text.length);
                small = true;
            } else {
                countLabel = `(${items.length})`;
                contentWidth = Math.max(contentWidth, name.length + 3 + countLabel.length);
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

            cards.push({ title: name, countLabel, lines, contentWidth, small });
        }

        // Separate full deposits from empty/not-bought ones
        const fullCards = cards.filter(c => !c.small);
        const smallCards = cards.filter(c => c.small);

        // Calculate total coin wealth across all deposits
        const totalCopper = getTotalCopper(deposits);

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

        function renderTitleLine(card: Card): AnsiAwareBuffer {
            const titleLine = new AnsiAwareBuffer();
            titleLine.append(`|${padStr}`);
            const titleBuf = new AnsiAwareBuffer(card.title);
            titleBuf.color([0, titleBuf.length], BANK_NAME_COLOR);
            titleLine.appendBuffer(titleBuf);
            const spaceBetween = colContentWidth - card.title.length - card.countLabel.length;
            titleLine.append(' '.repeat(spaceBetween) + card.countLabel + `${padStr}|`, {});
            return titleLine;
        }

        // Helper to render a small card into lines (natural height, no padding)
        function renderCard(card: Card): AnsiAwareBuffer[] {
            const result: AnsiAwareBuffer[] = [];
            result.push(new AnsiAwareBuffer(`+${horiz}+`));
            result.push(renderTitleLine(card));
            result.push(new AnsiAwareBuffer(`+${horiz}+`));
            for (const line of card.lines) {
                const itemLine = new AnsiAwareBuffer();
                itemLine.append(`|${padStr}`);
                itemLine.appendBuffer(line);
                const remaining = colContentWidth - line.text.length;
                if (remaining > 0) itemLine.append(' '.repeat(remaining), {});
                itemLine.append(`${padStr}|`, {});
                result.push(itemLine);
            }
            result.push(new AnsiAwareBuffer(`+${horiz}+`));
            return result;
        }

        // Render full card column padded to maxContentLines
        function renderFullColumn(card: Card, maxContentLines: number): AnsiAwareBuffer[] {
            const col: AnsiAwareBuffer[] = [];
            col.push(new AnsiAwareBuffer(`+${horiz}+`));
            col.push(renderTitleLine(card));
            col.push(new AnsiAwareBuffer(`+${horiz}+`));
            for (let i = 0; i < maxContentLines; i++) {
                if (i < card.lines.length) {
                    const itemLine = new AnsiAwareBuffer();
                    itemLine.append(`|${padStr}`);
                    itemLine.appendBuffer(card.lines[i]);
                    const remaining = colContentWidth - card.lines[i].text.length;
                    if (remaining > 0) itemLine.append(' '.repeat(remaining), {});
                    itemLine.append(`${padStr}|`, {});
                    col.push(itemLine);
                } else {
                    col.push(new AnsiAwareBuffer(`|${' '.repeat(colContentWidth + pad * 2)}|`));
                }
            }
            col.push(new AnsiAwareBuffer(`+${horiz}+`));
            return col;
        }

        // Composite column arrays side by side
        function renderColumns(columns: AnsiAwareBuffer[][], totalHeight: number) {
            const emptyCell = ' '.repeat(colWidth);
            for (let row = 0; row < totalHeight; row++) {
                if (output.length > 0) output.append('\n');
                const rowLine = new AnsiAwareBuffer();
                for (let c = 0; c < columns.length; c++) {
                    if (c > 0) rowLine.append(gapStr);
                    if (row < columns[c].length) {
                        rowLine.appendBuffer(columns[c][row]);
                    } else {
                        rowLine.append(emptyCell);
                    }
                }
                output.appendBuffer(rowLine);
            }
        }

        const smallCardHeight = 5; // border + title + sep + 1 content line + border
        let fullIdx = 0;
        let smallIdx = 0;
        let maxRenderedCols = 0;

        while (fullIdx < fullCards.length || smallIdx < smallCards.length) {
            const rowFull = fullCards.slice(fullIdx, fullIdx + numCols);
            fullIdx += rowFull.length;
            const slotsForSmall = numCols - rowFull.length;

            if (rowFull.length > 0) {
                const maxContentLines = Math.max(...rowFull.map(c => c.lines.length));
                const totalRowHeight = maxContentLines + 4;
                const cardsPerSlot = Math.max(1, Math.floor(totalRowHeight / smallCardHeight));

                const columns: AnsiAwareBuffer[][] = [];

                // Full card columns (padded to uniform height)
                for (const card of rowFull) {
                    columns.push(renderFullColumn(card, maxContentLines));
                }

                // Fill remaining slots with stacked small cards
                for (let s = 0; s < slotsForSmall && smallIdx < smallCards.length; s++) {
                    const col: AnsiAwareBuffer[] = [];
                    for (let i = 0; i < cardsPerSlot && smallIdx < smallCards.length; i++) {
                        col.push(...renderCard(smallCards[smallIdx++]));
                    }
                    // Pad to row height with blank space
                    const blank = new AnsiAwareBuffer(' '.repeat(colWidth));
                    while (col.length < totalRowHeight) {
                        col.push(blank);
                    }
                    columns.push(col);
                }

                maxRenderedCols = Math.max(maxRenderedCols, columns.length);
                renderColumns(columns, totalRowHeight);
            } else {
                // Only small cards left — masonry pack into columns
                const cols: AnsiAwareBuffer[][] = Array.from({ length: numCols }, () => []);
                while (smallIdx < smallCards.length) {
                    let minIdx = 0;
                    for (let i = 1; i < numCols; i++) {
                        if (cols[i].length < cols[minIdx].length) minIdx = i;
                    }
                    cols[minIdx].push(...renderCard(smallCards[smallIdx++]));
                }
                while (cols.length > 1 && cols[cols.length - 1].length === 0) {
                    cols.pop();
                }
                maxRenderedCols = Math.max(maxRenderedCols, cols.length);
                const maxHeight = Math.max(...cols.map(c => c.length));
                renderColumns(cols, maxHeight);
            }
        }

        if (totalCopper > 0) {
            const totalWidth = maxRenderedCols * colWidth + (maxRenderedCols - 1) * gap;
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
        aliases.push({ pattern: /\/depozytyw(?:\s+(.+))?$/, callback: (matches?: RegExpMatchArray) => {
            const filter = matches?.[1]?.trim() || undefined;
            eventBus.emit("deposits.popup.open", { filter });
        }});
    }

    client.scope.listen(window, "beforeunload", persist);
}

export { deposits };
