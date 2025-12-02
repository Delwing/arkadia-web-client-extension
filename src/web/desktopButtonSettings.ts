import storage from "@modules/core/storage";
import eventBus from "@modules/core/eventBus";

export type DesktopMacroType =
    | 'command'
    | 'zList'
    | 'zaList'
    | 'wList'
    | 'przeList'
    | 'idzList'
    | 'wesprzyj'
    | 'moveMode'
    | 'attackEnemy'
    | 'blockEnemy';

export type ListPosition = 'top' | 'bottom' | 'left' | 'right';
export type ListGrowDirection = 'horizontal' | 'vertical';

export interface DesktopButtonSetting {
    id: string;
    label: string;
    macroType: DesktopMacroType;
    command: string;
    color: string;
    fontColor: string;
    fontSize: number;
    width: number;
    height: number;
    x: number;
    y: number;
    backgroundOpacity: number;
    enemySlot?: number;
    listPosition?: ListPosition;
    listGrowDirection?: ListGrowDirection;
}

export interface DesktopButtonsSettings {
    buttons: DesktopButtonSetting[];
    locked: boolean;
}

export const defaultFontColor = '#f1f5f9';
export const defaultButtonColor = '#6EB4DC';
export const defaultFontSize = 11;
export const defaultWidth = 60;
export const defaultHeight = 36;
export const defaultBackgroundOpacity = 0.85;

export function createDefaultButton(id: string, x: number, y: number): DesktopButtonSetting {
    return {
        id,
        label: 'Nowy',
        macroType: 'command',
        command: '',
        color: defaultButtonColor,
        fontColor: defaultFontColor,
        fontSize: defaultFontSize,
        width: defaultWidth,
        height: defaultHeight,
        x,
        y,
        backgroundOpacity: defaultBackgroundOpacity,
    };
}

export function createDefaultSettings(): DesktopButtonsSettings {
    return {
        buttons: [],
        locked: false,
    };
}

const validMacroTypes: DesktopMacroType[] = [
    'command', 'zList', 'zaList', 'wList', 'przeList', 'idzList',
    'wesprzyj', 'moveMode', 'attackEnemy', 'blockEnemy'
];

function parseButton(raw: unknown): DesktopButtonSetting | null {
    if (!raw || typeof raw !== 'object') return null;
    const candidate = raw as Record<string, unknown>;
    const id = typeof candidate.id === 'string' ? candidate.id : '';
    if (!id) return null;
    const label = typeof candidate.label === 'string' ? candidate.label : 'Nowy';
    const macroType: DesktopMacroType = validMacroTypes.includes(candidate.macroType as DesktopMacroType)
        ? candidate.macroType as DesktopMacroType
        : 'command';
    const command = typeof candidate.command === 'string' ? candidate.command : '';
    const color = typeof candidate.color === 'string' ? candidate.color : defaultButtonColor;
    const fontColor = typeof candidate.fontColor === 'string' ? candidate.fontColor : defaultFontColor;
    const fontSize = typeof candidate.fontSize === 'number' && candidate.fontSize > 0 ? candidate.fontSize : defaultFontSize;
    const width = typeof candidate.width === 'number' && candidate.width > 0 ? candidate.width : defaultWidth;
    const height = typeof candidate.height === 'number' && candidate.height > 0 ? candidate.height : defaultHeight;
    const x = typeof candidate.x === 'number' ? candidate.x : 0;
    const y = typeof candidate.y === 'number' ? candidate.y : 0;
    const backgroundOpacity = typeof candidate.backgroundOpacity === 'number'
        ? Math.min(1, Math.max(0, candidate.backgroundOpacity))
        : defaultBackgroundOpacity;
    const enemySlot = typeof candidate.enemySlot === 'number' ? candidate.enemySlot : undefined;
    const validListPositions: ListPosition[] = ['top', 'bottom', 'left', 'right'];
    const listPosition: ListPosition | undefined = validListPositions.includes(candidate.listPosition as ListPosition)
        ? candidate.listPosition as ListPosition
        : undefined;
    const validListGrowDirections: ListGrowDirection[] = ['horizontal', 'vertical'];
    const listGrowDirection: ListGrowDirection | undefined = validListGrowDirections.includes(candidate.listGrowDirection as ListGrowDirection)
        ? candidate.listGrowDirection as ListGrowDirection
        : undefined;
    return { id, label, macroType, command, color, fontColor, fontSize, width, height, x, y, backgroundOpacity, enemySlot, listPosition, listGrowDirection };
}

export async function loadSettings(): Promise<DesktopButtonsSettings> {
    try {
        const data = await storage.getItem('desktopButtonSettings');
        const raw = data?.desktopButtonSettings;
        if (raw && typeof raw === 'object') {
            const locked = !!raw.locked;
            const buttons: DesktopButtonSetting[] = [];
            if (Array.isArray(raw.buttons)) {
                for (const entry of raw.buttons) {
                    const parsed = parseButton(entry);
                    if (parsed) {
                        buttons.push(parsed);
                    }
                }
            }
            return { buttons, locked };
        }
    } catch {
        // ignore errors, return default
    }
    return createDefaultSettings();
}

export function saveSettings(settings: DesktopButtonsSettings) {
    storage.setItem('desktopButtonSettings', settings);
}

export function hexToRgba(hex: string, alpha: number): string {
    const cleanHex = hex.replace('#', '');
    const r = parseInt(cleanHex.slice(0, 2), 16);
    const g = parseInt(cleanHex.slice(2, 4), 16);
    const b = parseInt(cleanHex.slice(4, 6), 16);
    const alphaRounded = Math.round(Math.min(1, Math.max(0, alpha)) * 100) / 100;
    return `rgba(${r}, ${g}, ${b}, ${alphaRounded})`;
}

export function applySettings(settings: DesktopButtonsSettings) {
    eventBus.emit('desktopButtonsSettings', settings);
}
