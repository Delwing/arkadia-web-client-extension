import type { ButtonMacroConfig } from "../buttonSettings";

/**
 * Mobile buttons v2 (see docs/dev/MOBILE_BUTTONS_V2.md): Solo is the base,
 * Drużyna inherits from Solo and Prowadzący from Drużyna. A mode stores only
 * what it changes — whole buttons by id, and optionally its own grid and
 * panel background. Colours live in shared styles the buttons point to.
 */
export type ButtonMode = 'solo' | 'team' | 'leader';

export const BUTTON_MODES: readonly ButtonMode[] = ['solo', 'team', 'leader'];

export const PARENT_MODE: Record<ButtonMode, ButtonMode | null> = { solo: null, team: 'solo', leader: 'team' };

/** What the renderer falls back to for a direction button without an active colour. */
export const DEFAULT_ACTIVE_COLOR = '#2fa7c5';

export interface MobileButtonStyle {
    name: string;
    color: string;
    fontColor: string;
    /** Used by `kierunek` / `specialExit` buttons while the exit is available. */
    activeColor: string;
}

/** A button as stored: the v1 `MobileButtonSetting` without its colour fields. */
export interface StoredMobileButton extends ButtonMacroConfig {
    label: string;
    /** Style id; a missing or unknown id falls back to the first style. Empty slots have none. */
    style?: string;
    holdEnabled?: boolean;
    hold?: ButtonMacroConfig;
}

export interface GridLayout {
    cols: number;
    /** Button ids, row-major. */
    order: string[];
}

export interface ModeConfig {
    /** Solo: every placed button. Drużyna/Prowadzący: overrides and slots of their own layout. */
    buttons: Record<string, StoredMobileButton>;
    /** Required on solo; absent elsewhere means "inherit". */
    layout?: GridLayout;
    /** `rgba()` string; required on solo; absent elsewhere means "inherit". */
    background?: string;
}

export interface ButtonModes {
    modes: Record<ButtonMode, ModeConfig>;
    styles: Record<string, MobileButtonStyle>;
    /** Chip order in the editor; never empty. */
    styleOrder: string[];
}
