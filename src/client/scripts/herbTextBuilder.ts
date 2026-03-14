import type { HerbBagsState } from "../types/herbs";
import type { HerbsData, HerbUse } from "./herbsLoader";
import { AnsiAwareBuffer } from "../ansi/FormatState";
import { createColorFormat, mudletColorLine } from "@modules/core/Colors";
import { showHerbTooltip, hideHerbTooltip } from "@web/herbTooltip";

const WHITE = createColorFormat('#ffffff');

export interface HerbTextRow {
    count: number;
    herbId: string;
    herbName: string;
    actions: HerbUse[] | undefined;
}

export interface HerbTextSummary {
    rows: HerbTextRow[];
    maxNameLength: number;
    maxActionsLength: number;
}

function getActionsText(actions: HerbUse[] | undefined): string {
    if (!actions || actions.length === 0) {
        return '--';
    }
    return actions
        .filter(a => !a.dont_bind)
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

        return { count, herbId: id, herbName, actions };
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

    // Build rows with colors and links
    summary.rows.forEach(row => {
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
                    showHerbTooltip(row.herbId, row.actions, ev.pageX, ev.pageY);
                },
                onMouseLeave: () => {
                    hideHerbTooltip();
                },
                title: `Prawy klik dla opcji: ${row.herbId}`
            });
        }

        // Build uses with mudlet colors
        const usesBuffer = new AnsiAwareBuffer();
        if (row.actions && row.actions.length > 0) {
            const bindableActions = row.actions.filter(a => !a.dont_bind);
            bindableActions.forEach((u, idx) => {
                if (idx > 0) usesBuffer.append(' | ');
                usesBuffer.append(`${u.action}: `);
                usesBuffer.appendBuffer(mudletColorLine(u.effect));
            });
            if (bindableActions.length === 0) {
                usesBuffer.append('--');
            }
        } else {
            usesBuffer.append('--');
        }

        line.appendBuffer(usesBuffer);
        output.appendBuffer(line);
        output.append('\n');
    });

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
