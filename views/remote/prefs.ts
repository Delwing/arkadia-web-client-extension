/** The phone's own preferences. Kept on the phone; the PC knows nothing of them. */

const PREFIX = 'arkadia.remote.';
const HISTORY_LIMIT = 100;

function read<T>(key: string, fallback: T, valid: (value: unknown) => value is T): T {
    try {
        const raw = localStorage.getItem(PREFIX + key);
        if (raw === null) return fallback;
        const value: unknown = JSON.parse(raw);
        return valid(value) ? value : fallback;
    } catch {
        return fallback;
    }
}

function write(key: string, value: unknown): void {
    try {
        localStorage.setItem(PREFIX + key, JSON.stringify(value));
    } catch {
        // Private mode or full storage: the preference just does not stick
    }
}

const isStringArray = (value: unknown): value is string[] =>
    Array.isArray(value) && value.every(item => typeof item === 'string');
const isNumber = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);
const isString = (value: unknown): value is string => typeof value === 'string';

export type Panel = 'objects' | 'quick' | 'none';
const isPanel = (value: unknown): value is Panel => value === 'objects' || value === 'quick' || value === 'none';
const isBoolean = (value: unknown): value is boolean => typeof value === 'boolean';
const isStringRecord = (value: unknown): value is Record<string, string> =>
    !!value && typeof value === 'object' && !Array.isArray(value)
    && Object.values(value as Record<string, unknown>).every(item => typeof item === 'string');

export const DEFAULT_QUICK = ['zerknij', 'kondycja', 'i', 'kto'];

export const prefs = {
    history: () => read('history', [] as string[], isStringArray),
    pushHistory(command: string): string[] {
        const history = prefs.history().filter(item => item !== command);
        history.push(command);
        const trimmed = history.slice(-HISTORY_LIMIT);
        write('history', trimmed);
        return trimmed;
    },
    quick: () => read('quick', DEFAULT_QUICK, isStringArray),
    setQuick: (commands: string[]) => write('quick', commands),
    fontSize: () => read('fontSize', 14, isNumber),
    setFontSize: (size: number) => write('fontSize', size),
    panel: () => read('panel', 'none' as Panel, isPanel),
    setPanel: (panel: Panel) => write('panel', panel),
    mapOpen: () => read('mapOpen', false, isBoolean),
    setMapOpen: (open: boolean) => write('mapOpen', open),
    /** Pairing codes from scanned QRs, by PC. */
    pairCode: (hostId: string): string | null => read('pairs', {} as Record<string, string>, isStringRecord)[hostId] ?? null,
    setPairCode(hostId: string, code: string) {
        write('pairs', { ...read('pairs', {} as Record<string, string>, isStringRecord), [hostId]: code });
    },
    /** PCs this phone has a pairing code for, with the character last seen there. */
    pairedHosts(): { hostId: string; name: string | null }[] {
        const names = read('hostNames', {} as Record<string, string>, isStringRecord);
        return Object.keys(read('pairs', {} as Record<string, string>, isStringRecord))
            .map(hostId => ({ hostId, name: names[hostId] ?? null }));
    },
    setHostName(hostId: string, name: string) {
        write('hostNames', { ...read('hostNames', {} as Record<string, string>, isStringRecord), [hostId]: name });
    },
    lastHost: () => read('lastHost', '', isString),
    setLastHost: (hostId: string) => write('lastHost', hostId),
};
