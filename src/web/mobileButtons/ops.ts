import {
    PARENT_MODE,
    type ButtonMode,
    type ButtonModes,
    type MobileButtonStyle,
    type StoredMobileButton,
} from "./model";
import { resolveButton, resolveLayout, styleOf } from "./resolve";

/**
 * Editing operations on the v2 modes. Each returns new data and never mutates
 * its input. Editing something a mode inherits first copies it into that mode
 * ("fork"); the result says when that happened so the editor can tell.
 */
export interface OpResult {
    data: ButtonModes;
    forked: boolean;
}

const EMPTY: StoredMobileButton = { macroType: 'empty', label: '' };

/** Labels a button gets when it stops being an empty slot and has none yet. */
const DEFAULT_LABELS: Record<string, string> = {
    command: 'komenda', kierunek: '↑', functional: ']', zList: '/z', zaList: '/za', wList: '/w',
    przeList: '/prze', idzList: 'idź', specialExit: 'sp ex', zerknij: 'zerknij', wesprzyj: 'wesprzyj',
    moveMode: 'tryb', toggleButtons: '⇩', attackEnemy: 'atak 1', blockEnemy: 'blok 1',
    attackAllEnemies: 'atak *', mute: 'cicho', unmute: 'dźwięk', compound: 'combo',
};

function nextNumber(ids: Iterable<string>, prefix: string): number {
    let max = 0;
    for (const id of ids) {
        if (!id.startsWith(prefix)) continue;
        const n = Number(id.slice(prefix.length));
        if (Number.isInteger(n)) max = Math.max(max, n);
    }
    return max + 1;
}

/** Fresh `button-<n>` ids, unique across every mode's buttons and layout. */
export function newButtonIds(data: ButtonModes, count: number): string[] {
    const ids = new Set<string>();
    for (const config of Object.values(data.modes)) {
        Object.keys(config.buttons).forEach(id => ids.add(id));
        config.layout?.order.forEach(id => ids.add(id));
    }
    const first = nextNumber(ids, 'button-');
    return Array.from({ length: count }, (_, i) => `button-${first + i}`);
}

function fork(data: ButtonModes, mode: ButtonMode, id: string): boolean {
    if (data.modes[mode].buttons[id]) return false;
    data.modes[mode].buttons[id] = structuredClone(resolveButton(data, mode, id)?.button ?? EMPTY);
    return true;
}

function forkLayout(data: ButtonModes, mode: ButtonMode): boolean {
    if (data.modes[mode].layout) return false;
    data.modes[mode].layout = structuredClone(resolveLayout(data, mode).layout);
    return true;
}

/** Drop slots that only existed as this mode's own empties. */
function dropLocalEmpties(data: ButtonModes, mode: ButtonMode, ids: string[]) {
    const parent = PARENT_MODE[mode];
    for (const id of ids) {
        const button = data.modes[mode].buttons[id];
        if (button?.macroType === 'empty' && !(parent && resolveButton(data, parent, id))) {
            delete data.modes[mode].buttons[id];
        }
    }
}

function directionStyle(data: ButtonModes): string {
    return data.styleOrder.find(id => data.styles[id].name.startsWith('Kierunki')) ?? data.styleOrder[0];
}

export function setButton(input: ButtonModes, mode: ButtonMode, id: string, patch: Partial<StoredMobileButton>): OpResult {
    const data = structuredClone(input);
    const forked = fork(data, mode, id);
    const current = data.modes[mode].buttons[id];
    if (patch.macroType === 'empty') {
        data.modes[mode].buttons[id] = { ...EMPTY };
        return { data, forked };
    }
    const next: StoredMobileButton = { ...current, ...patch };
    if (current.macroType === 'empty' && patch.macroType) {
        if (!next.label) next.label = DEFAULT_LABELS[patch.macroType] ?? '';
        if (!next.style) next.style = patch.macroType === 'kierunek' ? directionStyle(data) : data.styleOrder[0];
    }
    if (next.macroType !== 'compound') delete next.steps;
    data.modes[mode].buttons[id] = next;
    return { data, forked };
}

/** Back to what the parent chain has; no-op on solo and on slots only this mode has. */
export function restoreButton(input: ButtonModes, mode: ButtonMode, id: string): ButtonModes {
    const parent = PARENT_MODE[mode];
    if (!parent || !input.modes[mode].buttons[id] || !resolveButton(input, parent, id)) return input;
    const data = structuredClone(input);
    delete data.modes[mode].buttons[id];
    return data;
}

export function setOwnLayout(input: ButtonModes, mode: ButtonMode, own: boolean): ButtonModes {
    if (mode === 'solo' || !!input.modes[mode].layout === own) return input;
    const data = structuredClone(input);
    if (own) forkLayout(data, mode);
    else delete data.modes[mode].layout;
    return data;
}

export function swapSlots(input: ButtonModes, mode: ButtonMode, a: number, b: number): OpResult {
    const data = structuredClone(input);
    const forked = forkLayout(data, mode);
    const order = data.modes[mode].layout!.order;
    [order[a], order[b]] = [order[b], order[a]];
    return { data, forked };
}

export type Edge = 'top' | 'bottom' | 'left' | 'right';

export function addLine(input: ButtonModes, mode: ButtonMode, edge: Edge): OpResult {
    const data = structuredClone(input);
    const forked = forkLayout(data, mode);
    const layout = data.modes[mode].layout!;
    const rows = Math.ceil(layout.order.length / layout.cols);
    const ids = newButtonIds(data, edge === 'top' || edge === 'bottom' ? layout.cols : rows);
    ids.forEach(id => { data.modes[mode].buttons[id] = { ...EMPTY }; });
    if (edge === 'top') layout.order = [...ids, ...layout.order];
    else if (edge === 'bottom') layout.order = [...layout.order, ...ids];
    else {
        const order: string[] = [];
        for (let r = 0; r < rows; r++) {
            const row = layout.order.slice(r * layout.cols, (r + 1) * layout.cols);
            order.push(...(edge === 'left' ? [ids[r], ...row] : [...row, ids[r]]));
        }
        layout.order = order;
        layout.cols += 1;
    }
    return { data, forked };
}

export function removeLine(input: ButtonModes, mode: ButtonMode, edge: Edge): OpResult {
    const { layout: current } = resolveLayout(input, mode);
    const rows = Math.ceil(current.order.length / current.cols);
    const vertical = edge === 'left' || edge === 'right';
    if (vertical ? current.cols <= 1 : rows <= 1) return { data: input, forked: false };

    const data = structuredClone(input);
    const forked = forkLayout(data, mode);
    const layout = data.modes[mode].layout!;
    let removed: string[];
    if (edge === 'top') {
        removed = layout.order.slice(0, layout.cols);
        layout.order = layout.order.slice(layout.cols);
    } else if (edge === 'bottom') {
        removed = layout.order.slice((rows - 1) * layout.cols);
        layout.order = layout.order.slice(0, (rows - 1) * layout.cols);
    } else {
        removed = [];
        const order: string[] = [];
        for (let r = 0; r < rows; r++) {
            const row = layout.order.slice(r * layout.cols, (r + 1) * layout.cols);
            removed.push(...(edge === 'left' ? row.splice(0, 1) : row.splice(-1, 1)));
            order.push(...row);
        }
        layout.order = order;
        layout.cols -= 1;
    }
    dropLocalEmpties(data, mode, removed);
    return { data, forked };
}

/** Put a button from "Poza układem" into the first empty slot, or a new row. */
export function placeHidden(input: ButtonModes, mode: ButtonMode, id: string): OpResult {
    const data = structuredClone(input);
    const forked = forkLayout(data, mode);
    const layout = data.modes[mode].layout!;
    const slot = layout.order.findIndex(slotId => (resolveButton(data, mode, slotId)?.button ?? EMPTY).macroType === 'empty');
    if (slot >= 0) {
        const old = layout.order[slot];
        layout.order[slot] = id;
        dropLocalEmpties(data, mode, [old]);
    } else {
        const fill = newButtonIds(data, layout.cols - 1);
        fill.forEach(fillId => { data.modes[mode].buttons[fillId] = { ...EMPTY }; });
        layout.order = [...layout.order, id, ...fill];
    }
    return { data, forked };
}

export function setBackground(input: ButtonModes, mode: ButtonMode, background: string): OpResult {
    const data = structuredClone(input);
    const forked = mode !== 'solo' && !data.modes[mode].background;
    data.modes[mode].background = background;
    return { data, forked };
}

export function restoreBackground(input: ButtonModes, mode: ButtonMode): ButtonModes {
    if (mode === 'solo' || !input.modes[mode].background) return input;
    const data = structuredClone(input);
    delete data.modes[mode].background;
    return data;
}

export function updateStyle(input: ButtonModes, styleId: string, patch: Partial<MobileButtonStyle>): ButtonModes {
    if (!input.styles[styleId]) return input;
    const data = structuredClone(input);
    data.styles[styleId] = { ...data.styles[styleId], ...patch };
    return data;
}

/** A copy of the button's style under a new id, assigned to that button only. */
export function newStyleForButton(input: ButtonModes, mode: ButtonMode, id: string): OpResult & { styleId: string } {
    const data = structuredClone(input);
    const forked = fork(data, mode, id);
    const button = data.modes[mode].buttons[id];
    const styleId = `style-${nextNumber(Object.keys(data.styles), 'style-')}`;
    const base = styleOf(data, button);
    const names = new Set(Object.values(data.styles).map(s => s.name));
    let name = `Styl: ${button.label || 'nowy'}`;
    for (let n = 2; names.has(name); n++) name = `Styl: ${button.label || 'nowy'} ${n}`;
    data.styles[styleId] = { ...base, name };
    data.styleOrder.push(styleId);
    button.style = styleId;
    return { data, forked, styleId };
}

/** Give the buttons a style, forking the inherited ones. Empty slots and buttons already on it are skipped. */
export function assignStyle(input: ButtonModes, mode: ButtonMode, ids: string[], styleId: string): { data: ButtonModes; changed: number; forked: number } {
    if (!input.styles[styleId]) return { data: input, changed: 0, forked: 0 };
    const data = structuredClone(input);
    let changed = 0, forked = 0;
    for (const id of ids) {
        const button = resolveButton(data, mode, id)?.button;
        if (!button || button.macroType === 'empty' || styleOf(data, button) === data.styles[styleId]) continue;
        if (fork(data, mode, id)) forked++;
        data.modes[mode].buttons[id].style = styleId;
        changed++;
    }
    return { data: changed ? data : input, changed, forked };
}

/** Copy the inherited ones into `mode` as they are, so later parent changes no longer reach them. */
export function overrideButtons(input: ButtonModes, mode: ButtonMode, ids: string[]): { data: ButtonModes; forked: number } {
    if (mode === 'solo') return { data: input, forked: 0 };
    const data = structuredClone(input);
    const forked = ids.filter(id => resolveButton(data, mode, id) && fork(data, mode, id)).length;
    return { data: forked ? data : input, forked };
}

/** `restoreButton` for several; counts only the ones that went back to the parent. */
export function restoreButtons(input: ButtonModes, mode: ButtonMode, ids: string[]): { data: ButtonModes; restored: number } {
    let data = input, restored = 0;
    for (const id of ids) {
        const next = restoreButton(data, mode, id);
        if (next !== data) restored++;
        data = next;
    }
    return { data, restored };
}

/** Turn the slots into empty ones in `mode` (an empty override where they are inherited). */
export function clearSlots(input: ButtonModes, mode: ButtonMode, ids: string[]): ButtonModes {
    const data = structuredClone(input);
    for (const id of ids) data.modes[mode].buttons[id] = { ...EMPTY };
    return data;
}

const NEW_STYLE: MobileButtonStyle = { name: '', color: '#4b7f52', fontColor: '#ffffff', activeColor: '#5ec27a' };

/** A new style at the end of the palette, copying `from` when given. */
export function addStyle(input: ButtonModes, from?: string): { data: ButtonModes; styleId: string } {
    const data = structuredClone(input);
    const styleId = `style-${nextNumber(Object.keys(data.styles), 'style-')}`;
    const names = new Set(Object.values(data.styles).map(s => s.name));
    const source = from ? data.styles[from] : undefined;
    let name = source ? `${source.name} (kopia)` : `Styl ${data.styleOrder.length + 1}`;
    for (let n = 2; names.has(name); n++) name = source ? `${source.name} (kopia ${n})` : `Styl ${data.styleOrder.length + n}`;
    data.styles[styleId] = { ...(source ?? NEW_STYLE), name };
    data.styleOrder.push(styleId);
    return { data, styleId };
}

/** Remove a style; every button on it, in every mode, moves to the first remaining one. The last style stays. */
export function deleteStyle(input: ButtonModes, styleId: string): ButtonModes {
    if (!input.styles[styleId] || input.styleOrder.length <= 1) return input;
    const data = structuredClone(input);
    delete data.styles[styleId];
    data.styleOrder = data.styleOrder.filter(id => id !== styleId);
    const fallback = data.styleOrder[0];
    for (const config of Object.values(data.modes)) {
        for (const button of Object.values(config.buttons)) {
            if (button.style === styleId) button.style = fallback;
        }
    }
    return data;
}
