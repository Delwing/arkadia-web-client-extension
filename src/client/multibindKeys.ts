import { globalStorage } from '@modules/core/storage';
import { defaultBinds } from '@modules/core/keymapStorage';
import { MAX_MULTIBIND_SLOTS, type Bind } from '@modules/core/keymapTypes';

const isMac = typeof navigator !== 'undefined' && /Mac/.test(navigator.platform);
const ALT_LABEL = isMac ? '⌥' : 'ALT';

/**
 * Keys of the multibind slots in the active keymap: slot n on index n-1. The
 * length is the number of slots; a slot with an empty key has no key.
 */
export function getMultibindKeys(): Bind[] {
    const list = globalStorage.get('binds')?.multibinds;
    return Array.isArray(list) ? list.slice(0, MAX_MULTIBIND_SLOTS) : defaultBinds.multibinds!;
}

export function formatBindKey(def?: Bind) {
    if (!def || !def.key) {
        return '';
    }
    let key = def.key;
    if (key.startsWith('Digit')) {
        key = key.substring(5);
    } else if (key.startsWith('Key')) {
        key = key.substring(3);
    } else if (key === 'BracketRight') {
        key = ']';
    } else if (key === 'BracketLeft') {
        key = '[';
    } else if (key === 'Backquote') {
        key = '`';
    }
    const parts: string[] = [];
    if (def.ctrl) parts.push('CTRL');
    if (def.alt) parts.push(ALT_LABEL);
    if (def.shift) parts.push('SHIFT');
    parts.push(key);
    return parts.join('+');
}

/** The key of multibind slot `index` (1-based), e.g. "ALT+1"; empty when the slot has none. */
export function getMultibindKeyLabel(index: number) {
    return formatBindKey(getMultibindKeys()[index - 1]);
}

/** The key of slot `index`, or "MB5" for a slot without one: for printed lists. */
export function getMultibindLabel(index: number) {
    return getMultibindKeyLabel(index) || `MB${index}`;
}
