export const DEFAULT_DRAW_WEAPON_COMMAND = 'dobadz';

export function normalizeDrawWeaponCommand(value: unknown): string {
    if (typeof value !== 'string') {
        return DEFAULT_DRAW_WEAPON_COMMAND;
    }
    let trimmed = value.trim();
    if (!trimmed) {
        return DEFAULT_DRAW_WEAPON_COMMAND;
    }
    const suffix = 'wszystkich broni';
    if (trimmed.toLowerCase().endsWith(suffix)) {
        trimmed = trimmed.slice(0, -suffix.length).trimEnd();
    }
    return trimmed || DEFAULT_DRAW_WEAPON_COMMAND;
}
