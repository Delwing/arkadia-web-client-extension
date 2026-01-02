export const DEFAULT_SUPPORT_COMMAND = 'wesprzyj';

export function normalizeSupportCommand(value: unknown): string {
    if (typeof value !== 'string') {
        return DEFAULT_SUPPORT_COMMAND;
    }
    const trimmed = value.trim();
    return trimmed || DEFAULT_SUPPORT_COMMAND;
}
