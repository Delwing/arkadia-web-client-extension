const skipLowercasePrefixes = [
    "'",
    'powiedz',
    "j'",
    'jpowiedz',
    'jppowiedz',
    'krzyknij',
    'jkrzyknij',
    'jpkrzyknij',
    'szepnij',
    'jszepnij',
    'jpszepnij',
];

export interface CommandOptions {
    preserveCase?: boolean;
}

export function normalizeCommand(command: string, options?: CommandOptions): string {
    const trimmedCommand = command.trimStart();
    if (!trimmedCommand || options?.preserveCase) {
        return command;
    }

    const shouldLowercase = !skipLowercasePrefixes.some(prefix => trimmedCommand.startsWith(prefix));
    if (!shouldLowercase) {
        return command;
    }

    const leadingWhitespaceLength = command.length - trimmedCommand.length;
    const leadingWhitespace = command.slice(0, leadingWhitespaceLength);
    return leadingWhitespace + trimmedCommand.toLowerCase();
}

