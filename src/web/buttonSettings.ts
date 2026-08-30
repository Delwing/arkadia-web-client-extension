export type MacroType =
    | 'functional'
    | 'zList'
    | 'zaList'
    | 'wList'
    | 'przeList'
    | 'idzList'
    | 'command'
    | 'specialExit'
    | 'kierunek'
    | 'zerknij'
    | 'wesprzyj'
    | 'moveMode'
    | 'toggleButtons'
    | 'attackEnemy'
    | 'blockEnemy'
    | 'attackAllEnemies'
    | 'mute'
    | 'unmute'
    | 'empty'
    | 'compound';

export interface ButtonMacroConfig {
    macroType: MacroType | string;  // string allows plugin macros like "plugin:..."
    command?: string;
    direction?: string;
    enemySlot?: number; // For attackEnemy and blockEnemy macros (0-2)
    pluginConfig?: Record<string, any>;
    steps?: ButtonMacroConfig[]; // For compound macro: sequential steps to execute
}

export interface BaseButtonSetting extends ButtonMacroConfig {
    label: string;
    color: string;
    fontColor?: string;
    holdEnabled?: boolean;
    hold?: ButtonMacroConfig;
}

export interface MobileButtonSetting extends BaseButtonSetting {
    activeColor?: string;
    syncWithDirections?: boolean;
}

export type ListPosition = 'top' | 'bottom' | 'left' | 'right';
export type ListGrowDirection = 'horizontal' | 'vertical';

export interface DesktopButtonSetting extends BaseButtonSetting {
    id: string;
    command: string;       // required for main action
    fontColor: string;     // required (not optional)
    fontSize: number;
    width: number;
    height: number;
    x: number;
    y: number;
    backgroundOpacity: number;
    listPosition?: ListPosition;
    listGrowDirection?: ListGrowDirection;
    listCloseOnlyByButton?: boolean;
}

export const defaultFontColor = '#f1f5f9';

export const directionOptions = ["nw", "n", "ne", "w", "e", "sw", "s", "se", "u", "d"] as const;

export const macroOptions: { value: MacroType; label: string }[] = [
    { value: "functional", label: "Bind funkcyjny" },
    { value: "zList", label: "Lista /z" },
    { value: "zaList", label: "Lista /za" },
    { value: "wList", label: "Lista /w" },
    { value: "przeList", label: "Lista /prze" },
    { value: "idzList", label: "Lista idz" },
    { value: "command", label: "Wyślij komendę" },
    { value: "kierunek", label: "Kierunek" },
    { value: "specialExit", label: "Wyjście specjalne" },
    { value: "zerknij", label: "Zerknij / zatrzymaj pojazd" },
    { value: "wesprzyj", label: "Wesprzyj prowadzącego" },
    { value: "moveMode", label: "Tryb ruchu" },
    { value: "toggleButtons", label: "Przełącz przyciski" },
    { value: "attackEnemy", label: "Atakuj wroga" },
    { value: "blockEnemy", label: "Zablokuj wroga" },
    { value: "attackAllEnemies", label: "Atakuj wszystkich wrogów" },
    { value: "mute", label: "Wycisz dźwięki" },
    { value: "unmute", label: "Włącz dźwięki" },
    { value: "compound", label: "Złożone (wiele akcji)" },
    { value: "empty", label: "Puste" },
];
