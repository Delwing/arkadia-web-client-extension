import type { NotificationLevel, NotificationSource } from '@shared/events/clientEvents.ts';
import type { ShellSettings, ToastPosition } from '@shared/uiSettingsTypes.ts';
import { defaultShellSettings } from '@shared/settingsDefaults.ts';

export type ToastSettings = Pick<ShellSettings,
    'toastPosition' | 'toastDurationScale' | 'toastMaxVisible' | 'toastMutedSources' | 'toastDoNotDisturb'>;

export const TOAST_POSITIONS: { value: ToastPosition; label: string }[] = [
    { value: 'top-left', label: 'Lewa góra' },
    { value: 'top-right', label: 'Prawa góra' },
    { value: 'bottom-right', label: 'Prawy dół' },
    { value: 'bottom-center', label: 'Nad poleceniami' },
];

export const TOAST_SOURCES: { value: NotificationSource; label: string }[] = [
    { value: 'walk', label: 'Prowadzenie' },
    { value: 'map', label: 'Mapa' },
    { value: 'clock', label: 'Zegar' },
    { value: 'sync', label: 'Synchronizacja' },
    { value: 'trigger', label: 'Wyzwalacze' },
    { value: 'plugin', label: 'Wtyczki' },
    { value: 'client', label: 'Klient' },
];

/** Under "do not disturb" these still pop up. */
export const URGENT_LEVELS: readonly NotificationLevel[] = ['warning', 'error'];

export const TOAST_DURATION_MIN = 0.5;
export const TOAST_DURATION_MAX = 3;
export const TOAST_MAX_VISIBLE_MIN = 1;
export const TOAST_MAX_VISIBLE_MAX = 8;

const clamp = (n: number, min: number, max: number) => Math.min(max, Math.max(min, n));

/** The toast fields of a stored settings blob, with anything malformed replaced by its default. */
export function normalizeToastSettings(raw: Partial<Record<keyof ToastSettings, unknown>>): ToastSettings {
    const d = defaultShellSettings;
    const position = TOAST_POSITIONS.some(p => p.value === raw.toastPosition)
        ? raw.toastPosition as ToastPosition
        : d.toastPosition;
    const scale = typeof raw.toastDurationScale === 'number' && Number.isFinite(raw.toastDurationScale)
        ? clamp(raw.toastDurationScale, TOAST_DURATION_MIN, TOAST_DURATION_MAX)
        : d.toastDurationScale;
    const maxVisible = typeof raw.toastMaxVisible === 'number' && Number.isFinite(raw.toastMaxVisible)
        ? clamp(Math.round(raw.toastMaxVisible), TOAST_MAX_VISIBLE_MIN, TOAST_MAX_VISIBLE_MAX)
        : d.toastMaxVisible;
    const muted = Array.isArray(raw.toastMutedSources)
        ? raw.toastMutedSources.filter((s): s is NotificationSource => TOAST_SOURCES.some(t => t.value === s))
        : d.toastMutedSources;
    return {
        toastPosition: position,
        toastDurationScale: scale,
        toastMaxVisible: maxVisible,
        toastMutedSources: muted,
        toastDoNotDisturb: typeof raw.toastDoNotDisturb === 'boolean' ? raw.toastDoNotDisturb : d.toastDoNotDisturb,
    };
}
