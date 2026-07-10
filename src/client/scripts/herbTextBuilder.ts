import type { HerbBagsState } from "../types/herbs";
import type { HerbsData, HerbUse } from "./herbsLoader";
import { getBindableUses, isHerbSmokable } from "./herbsLoader";
import { AnsiAwareBuffer } from "../ansi/FormatState";
import { createColorFormat, mudletColorLine } from "@modules/core/Colors";
import { getUiPort } from "@client/ports";

const WHITE = createColorFormat('#ffffff');

// Smokable herbs are marked with an SVG pipe (see `.herb-smoke-glyph` in
// style.css). Spaces carry the class; their count matches the glyph's 2ch
// render width so the buffer text and the rendered cells stay in sync.
const SMOKE_GLYPH_CLASS = 'herb-smoke-glyph';
const SMOKE_GLYPH_TEXT = '  ';

export interface HerbTextRow {
    count: number;
    herbId: string;
    herbName: string;
    actions: HerbUse[] | undefined;
    smokable: boolean;
}

export interface HerbTextSummary {
    rows: HerbTextRow[];
    maxNameLength: number;
    maxActionsLength: number;
}

function getActionsText(actions: HerbUse[] | undefined): string {
    const bindable = getBindableUses(actions);
    if (bindable.length === 0) {
        return '--';
    }
    return bindable
        .map(a => {
            const effect = typeof a.effect === 'string' ? a.effect.replace(/<[^>]+>/g, '').trim() : '';
            return effect ? `${a.action}: ${effect}` : a.action;
        })
        .join(' | ');
}

export function buildHerbTextSummary(
    bags: HerbBagsState,
    herbsData: HerbsData | null,
    useFormattedNames = false
): HerbTextSummary {
    const totalsMap: Record<string, number> = {};
    Object.values(bags).forEach(bag => {
        const contents = bag?.herbs ?? {};
        Object.entries(contents).forEach(([id, c]) => {
            totalsMap[id] = (totalsMap[id] || 0) + c;
        });
    });

    const entries = Object.entries(totalsMap).sort((a, b) => a[0].localeCompare(b[0]));

    let maxNameLength = 5; // minimum "nazwa".length
    let maxActionsLength = 9; // minimum "dzialanie".length

    const rows: HerbTextRow[] = entries.map(([id, count]) => {
        const forms = herbsData?.herb_id_to_odmiana[id];
        let herbName = id;
        if (useFormattedNames && forms) {
            if (count === 1) {
                herbName = forms.mianownik;
            } else {
                herbName = forms.mnoga_mianownik;
            }
        }
        const actions = herbsData?.herb_id_to_use[id];
        const actionsText = getActionsText(actions);

        maxNameLength = Math.max(maxNameLength, herbName.length);
        maxActionsLength = Math.max(maxActionsLength, actionsText.length);

        return { count, herbId: id, herbName, actions, smokable: isHerbSmokable(actions) };
    });

    return { rows, maxNameLength, maxActionsLength };
}

export type HerbContextMenuCallback = (herbId: string, ev: MouseEvent) => void;

export function buildHerbTextBuffer(
    bags: HerbBagsState,
    herbsData: HerbsData | null,
    useFormattedNames = false,
    onHerbContextMenu?: HerbContextMenuCallback
): AnsiAwareBuffer {
    const summary = buildHerbTextSummary(bags, herbsData, useFormattedNames);

    if (summary.rows.length === 0) {
        const buffer = new AnsiAwareBuffer();
        buffer.append('Brak ziol.', {});
        buffer.color([0, buffer.length], WHITE);
        return buffer;
    }

    const output = new AnsiAwareBuffer();

    const countWidth = 5;
    const nameWidth = Math.max(summary.maxNameLength, 5);

    // Build rows with colors and links. Smokable herbs are not listed here —
    // they only appear in the "Do palenia" section below.
    summary.rows.forEach(row => {
        if (row.smokable) return;
        const line = new AnsiAwareBuffer();
        const base = `${String(row.count).padStart(countWidth)} | ${row.herbName.padEnd(nameWidth)} | `;
        line.append(base, WHITE);

        // Create link for herb name
        const nameStart = countWidth + 3; // After count and " | "
        if (onHerbContextMenu) {
            line.createLink([nameStart, nameStart + row.herbName.length], {
                onContextMenu: (ev) => {
                    ev.preventDefault();
                    onHerbContextMenu(row.herbId, ev);
                },
                onMouseEnter: (ev) => {
                    getUiPort().showHerbTooltip(row.herbId, row.actions, ev.pageX, ev.pageY);
                },
                onMouseLeave: () => {
                    getUiPort().hideHerbTooltip();
                },
            });
        }

        // Build uses with mudlet colors
        const usesBuffer = new AnsiAwareBuffer();
        const bindableActions = getBindableUses(row.actions);
        if (bindableActions.length > 0) {
            bindableActions.forEach((u, idx) => {
                if (idx > 0) usesBuffer.append(' | ');
                usesBuffer.append(`${u.action}: `);
                usesBuffer.appendBuffer(mudletColorLine(u.effect));
            });
        } else {
            usesBuffer.append('--');
        }

        line.appendBuffer(usesBuffer);
        output.appendBuffer(line);
        output.append('\n');
    });

    // Smokable herbs are listed below a separator, one per line, formatted like a
    // normal row but with the pipe glyph in the action column. A trailing space
    // is appended after the glyph so the line ends in plain text — a newline
    // straight after the inline-block glyph span does not break the line.
    const smokableRows = summary.rows.filter(row => row.smokable);
    if (smokableRows.length > 0) {
        const sepWidth = countWidth + 3 + nameWidth + 3 + Math.max(summary.maxActionsLength, 8);
        output.append('-'.repeat(sepWidth), WHITE);
        output.append('\n');
        output.append('Do palenia:', WHITE);
        output.append('\n');

        smokableRows.forEach(row => {
            const line = new AnsiAwareBuffer();
            line.append(`${String(row.count).padStart(countWidth)} | ${row.herbName.padEnd(nameWidth)} | `, WHITE);

            // Make the herb name right-clickable so the "Nabij fajke" action is reachable.
            const nameStart = countWidth + 3; // After count and " | "
            if (onHerbContextMenu) {
                line.createLink([nameStart, nameStart + row.herbName.length], {
                    onContextMenu: (ev) => {
                        ev.preventDefault();
                        onHerbContextMenu(row.herbId, ev);
                    },
                });
            }

            line.append(SMOKE_GLYPH_TEXT, { ...WHITE, cssClass: SMOKE_GLYPH_CLASS });
            line.append(' ', WHITE);
            output.appendBuffer(line);
            output.append('\n');
        });
    }

    return output;
}

// Keep the plain text version for compatibility
export function buildHerbTextTable(
    bags: HerbBagsState,
    herbsData: HerbsData | null,
    useFormattedNames = false
): string {
    const buffer = buildHerbTextBuffer(bags, herbsData, useFormattedNames);
    return buffer.text;
}
