import { defaultFontColor, type MobileButtonSetting } from "../buttonSettings";
import type { LayoutSettings } from "../mobileButtonSettings";
import {
    PARENT_MODE,
    type ButtonMode,
    type ButtonModes,
    type GridLayout,
    type MobileButtonStyle,
    type StoredMobileButton,
} from "./model";

export function resolveButton(data: ButtonModes, mode: ButtonMode, id: string): { button: StoredMobileButton; source: ButtonMode } | null {
    for (let m: ButtonMode | null = mode; m; m = PARENT_MODE[m]) {
        const button = data.modes[m].buttons[id];
        if (button) return { button, source: m };
    }
    return null;
}

export function resolveLayout(data: ButtonModes, mode: ButtonMode): { layout: GridLayout; source: ButtonMode } {
    for (let m: ButtonMode | null = mode; m; m = PARENT_MODE[m]) {
        const layout = data.modes[m].layout;
        if (layout) return { layout, source: m };
    }
    return { layout: { cols: 1, order: [] }, source: 'solo' };
}

export function resolveBackground(data: ButtonModes, mode: ButtonMode): { background: string; source: ButtonMode } {
    for (let m: ButtonMode | null = mode; m; m = PARENT_MODE[m]) {
        const background = data.modes[m].background;
        if (background) return { background, source: m };
    }
    return { background: 'transparent', source: 'solo' };
}

export function styleOf(data: ButtonModes, button: StoredMobileButton): MobileButtonStyle {
    return (button.style && data.styles[button.style]) || data.styles[data.styleOrder[0]];
}

/** A stored button in the v1 shape the renderer and plugins use: style colours filled in. */
export function toButtonSetting(data: ButtonModes, button: StoredMobileButton): MobileButtonSetting {
    const { style: _style, ...rest } = button;
    if (button.macroType === 'empty') {
        return { ...rest, color: 'transparent', fontColor: defaultFontColor };
    }
    const style = styleOf(data, button);
    return { ...rest, color: style.color, fontColor: style.fontColor, activeColor: style.activeColor };
}

/** Stored in `mode` itself, as an override of its parent or a slot of its own layout; never on solo. */
export function isOwnButton(data: ButtonModes, mode: ButtonMode, id: string): boolean {
    const parent = PARENT_MODE[mode];
    const button = data.modes[mode].buttons[id];
    if (!parent || !button) return false;
    return !!resolveButton(data, parent, id) || button.macroType !== 'empty';
}

/** What the mode tab badge counts. */
export function ownCount(data: ButtonModes, mode: ButtonMode): number {
    return Object.keys(data.modes[mode].buttons).filter(id => isOwnButton(data, mode, id)).length;
}

/** Buttons `mode` has (its own or inherited) that its layout doesn't place: "Poza układem". */
export function hiddenIds(data: ButtonModes, mode: ButtonMode): string[] {
    const placed = new Set(resolveLayout(data, mode).layout.order);
    const ids: string[] = [];
    for (let m: ButtonMode | null = mode; m; m = PARENT_MODE[m]) {
        for (const id of Object.keys(data.modes[m].buttons)) {
            if (placed.has(id) || ids.includes(id)) continue;
            if (resolveButton(data, mode, id)?.button.macroType !== 'empty') ids.push(id);
        }
    }
    return ids;
}

/** How many buttons placed in `mode` use the style. */
export function styleUsage(data: ButtonModes, mode: ButtonMode, styleId: string): number {
    return selectableIds(data, mode).filter(id => styleOf(data, resolveButton(data, mode, id)!.button) === data.styles[styleId]).length;
}

/** Placed, non-empty buttons of `mode`, in grid order: what Zaznacz can pick. */
export function selectableIds(data: ButtonModes, mode: ButtonMode): string[] {
    return resolveLayout(data, mode).layout.order.filter(id => {
        const button = resolveButton(data, mode, id)?.button;
        return !!button && button.macroType !== 'empty';
    });
}

const missingButton: StoredMobileButton = { macroType: 'empty', label: '' };

/** One mode, fully resolved into the v1 `LayoutSettings` shape: only placed buttons. */
export function resolveMode(data: ButtonModes, mode: ButtonMode): LayoutSettings {
    const { layout } = resolveLayout(data, mode);
    const buttons: Record<string, MobileButtonSetting> = {};
    for (const id of layout.order) {
        buttons[id] = toButtonSetting(data, resolveButton(data, mode, id)?.button ?? missingButton);
    }
    return { buttons, order: [...layout.order], cols: layout.cols, background: resolveBackground(data, mode).background };
}
