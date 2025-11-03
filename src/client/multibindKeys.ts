export interface MultibindKeyDefinition {
    key: string;
    ctrl?: boolean;
    alt?: boolean;
    shift?: boolean;
}

export const MULTIBIND_KEYS: Record<number, MultibindKeyDefinition> = {
    1: { key: 'Digit1', alt: true },
    2: { key: 'Digit2', alt: true },
    3: { key: 'Digit3', alt: true },
    4: { key: 'Digit4', alt: true },
};

function formatKey(def?: MultibindKeyDefinition) {
    if (!def) {
        return '';
    }
    let key = def.key || '';
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
    if (def.alt) parts.push('ALT');
    if (def.shift) parts.push('SHIFT');
    parts.push(key);
    return parts.join('+');
}

export function getMultibindLabel(index: number) {
    const label = formatKey(MULTIBIND_KEYS[index]);
    return label || `MB${index}`;
}
