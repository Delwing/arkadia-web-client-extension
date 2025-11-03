export const DEFAULT_ATTACK_COMMAND = 'zabij';

export function normalizeAttackCommand(value: unknown): string {
    if (typeof value !== 'string') {
        return DEFAULT_ATTACK_COMMAND;
    }
    const trimmed = value.trim();
    return trimmed || DEFAULT_ATTACK_COMMAND;
}
