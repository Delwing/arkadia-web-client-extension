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
