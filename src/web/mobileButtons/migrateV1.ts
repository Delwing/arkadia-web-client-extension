import { defaultFontColor, type MobileButtonSetting } from "../buttonSettings";
import type { LayoutSettings } from "../mobileButtonSettings";
import {
    BUTTON_MODES,
    DEFAULT_ACTIVE_COLOR,
    PARENT_MODE,
    type ButtonMode,
    type ButtonModes,
    type MobileButtonStyle,
    type StoredMobileButton,
} from "./model";
import { resolveBackground, resolveButton, resolveLayout } from "./resolve";

/** The top-row colour of the stock layout; the style holding it is named "Podstawowy". */
const BASE_COLOR = '#6eb4dc';

const EMPTY_V1: MobileButtonSetting = { macroType: 'empty', label: '', color: 'transparent' };

const DIRECTION_MACROS =new Set(['kierunek', 'specialExit']);
const DIRECTION_LIKE_MACROS = new Set(['kierunek', 'specialExit', 'zerknij']);

interface Candidate {
    id: string | null;   // existing style id, null for a new one
    name: string | null; // existing style name
    color: string;
    fontColor: string;
    activeColor: string | null; // null until a direction button pins it
    used: boolean;
    directionLike: boolean;
}

function normalizeColor(value: string | undefined): string {
    return (value || '').trim().toLowerCase().replace(/\s+/g, '');
}

/**
 * The colours a v1 button actually shows: a special exit synced with the
 * directions takes them from the set's first direction button, the way the
 * renderer resolves it.
 */
function effectiveColors(cfg: MobileButtonSetting, layout: LayoutSettings) {
    let color = cfg.color;
    let activeColor = cfg.activeColor;
    if (cfg.macroType === 'specialExit' && cfg.syncWithDirections) {
        const direction = Object.values(layout.buttons).find(b => b.macroType === 'kierunek');
        if (direction) {
            color = direction.color;
            activeColor = direction.activeColor || DEFAULT_ACTIVE_COLOR;
        }
    }
    const isDirection = DIRECTION_MACROS.has(cfg.macroType);
    return {
        color: normalizeColor(color),
        fontColor: normalizeColor(cfg.fontColor || defaultFontColor),
        activeColor: isDirection ? normalizeColor(activeColor || DEFAULT_ACTIVE_COLOR) : null,
    };
}

function toStored(cfg: MobileButtonSetting, style: string | undefined): StoredMobileButton {
    const {
        color: _color,
        fontColor: _fontColor,
        activeColor: _activeColor,
        syncWithDirections: _sync,
        ...rest
    } = cfg;
    const stored: StoredMobileButton = { ...rest };
    if (style) stored.style = style;
    return stored;
}

/** JSON with sorted keys and `undefined` dropped, for comparing buttons by value. */
export function canonical(value: unknown): string {
    return JSON.stringify(value, (_key, v) => {
        if (v && typeof v === 'object' && !Array.isArray(v)) {
            return Object.fromEntries(Object.keys(v).sort().filter(k => v[k] !== undefined).map(k => [k, v[k]]));
        }
        return v;
    });
}

function nextNumber(ids: Iterable<string>, prefix: string): number {
    let max = 0;
    for (const id of ids) {
        const match = new RegExp(`^${prefix}(\\d+)$`).exec(id);
        if (match) max = Math.max(max, parseInt(match[1], 10));
    }
    return max + 1;
}

/**
 * Turn three full v1 layouts into the v2 modes: colours grouped into styles,
 * Drużyna stored as its differences from Solo and Prowadzący as its
 * differences from Drużyna. `existing` styles are reused (id and name) where
 * a colour group matches one; styles nothing uses any more are dropped.
 *
 * Only placed buttons are kept — v1 also stored ids no layout showed.
 */
export function modesFromLayouts(
    layouts: Record<ButtonMode, LayoutSettings>,
    existing?: Pick<ButtonModes, 'styles' | 'styleOrder'>,
): ButtonModes {
    const candidates: Candidate[] = (existing?.styleOrder ?? [])
        .filter(id => existing!.styles[id])
        .map(id => {
            const style = existing!.styles[id];
            return {
                id,
                name: style.name,
                color: normalizeColor(style.color),
                fontColor: normalizeColor(style.fontColor),
                activeColor: normalizeColor(style.activeColor),
                used: false,
                directionLike: true,
            };
        });

    // Style candidate of every placed, non-empty button, per mode.
    const styleFor: Record<ButtonMode, Map<string, Candidate>> = { solo: new Map(), team: new Map(), leader: new Map() };
    for (const mode of BUTTON_MODES) {
        const layout = layouts[mode];
        for (const id of layout.order) {
            const cfg = layout.buttons[id];
            if (!cfg || cfg.macroType === 'empty' || styleFor[mode].has(id)) continue;
            const colors = effectiveColors(cfg, layout);
            let candidate = candidates.find(c =>
                c.color === colors.color
                && c.fontColor === colors.fontColor
                && (colors.activeColor === null || c.activeColor === null || c.activeColor === colors.activeColor));
            if (!candidate) {
                candidate = { id: null, name: null, ...colors, used: false, directionLike: true };
                candidates.push(candidate);
            }
            if (candidate.activeColor === null && colors.activeColor !== null) {
                candidate.activeColor = colors.activeColor;
            }
            if (!candidate.used) {
                candidate.used = true;
                candidate.directionLike = true;
            }
            candidate.directionLike &&= DIRECTION_LIKE_MACROS.has(cfg.macroType);
            styleFor[mode].set(id, candidate);
        }
    }

    const used = candidates.filter(c => c.used);
    const styles: Record<string, MobileButtonStyle> = {};
    const styleOrder: string[] = [];
    const names = new Set(used.filter(c => c.name).map(c => c.name!));
    const uniqueName = (base: string) => {
        let name = base;
        for (let n = 2; names.has(name); n++) name = `${base} ${n}`;
        names.add(name);
        return name;
    };
    // Past every existing id, used or not: callers may merge the result back into the existing styles.
    let idNumber = nextNumber(Object.keys(existing?.styles ?? {}), 'style-');
    let plainNumber = 1;
    for (const candidate of used) {
        if (!candidate.id) {
            candidate.id = `style-${idNumber++}`;
            if (candidate.directionLike) {
                candidate.name = uniqueName('Kierunki');
            } else if (candidate.color === BASE_COLOR) {
                candidate.name = uniqueName('Podstawowy');
            } else {
                candidate.name = uniqueName(`Styl ${plainNumber++}`);
            }
        }
        styles[candidate.id] = {
            name: candidate.name!,
            color: candidate.color,
            fontColor: candidate.fontColor,
            activeColor: candidate.activeColor ?? DEFAULT_ACTIVE_COLOR,
        };
        styleOrder.push(candidate.id);
    }
    if (styleOrder.length === 0) {
        styles['style-1'] = { name: 'Podstawowy', color: BASE_COLOR, fontColor: defaultFontColor, activeColor: DEFAULT_ACTIVE_COLOR };
        styleOrder.push('style-1');
    }

    // A placed id without a button rendered as an empty slot in v1.
    const stored = (mode: ButtonMode, id: string) =>
        toStored(layouts[mode].buttons[id] ?? EMPTY_V1, styleFor[mode].get(id)?.id ?? undefined);

    const solo = layouts.solo;
    const data: ButtonModes = {
        modes: {
            solo: {
                buttons: {},
                layout: { cols: solo.cols, order: [...solo.order] },
                background: solo.background,
            },
            team: { buttons: {} },
            leader: { buttons: {} },
        },
        styles,
        styleOrder,
    };
    for (const id of solo.order) {
        data.modes.solo.buttons[id] = stored('solo', id);
    }

    for (const mode of ['team', 'leader'] as const) {
        const parent = PARENT_MODE[mode]!;
        const layout = layouts[mode];
        const target = data.modes[mode];
        const parentLayout = resolveLayout(data, parent).layout;
        if (layout.cols !== parentLayout.cols || canonical(layout.order) !== canonical(parentLayout.order)) {
            target.layout = { cols: layout.cols, order: [...layout.order] };
        }
        if (layout.background !== resolveBackground(data, parent).background) {
            target.background = layout.background;
        }
        for (const id of layout.order) {
            if (target.buttons[id]) continue;
            const button = stored(mode, id);
            const inherited = resolveButton(data, parent, id)?.button;
            if (!inherited || canonical(inherited) !== canonical(button)) {
                target.buttons[id] = button;
            }
        }
    }

    return data;
}
