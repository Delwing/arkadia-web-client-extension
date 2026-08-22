import Client from "../Client";

export interface CommandOptions {
    preserveCase?: boolean;
    autoLowercaseCommands?: boolean;
    /**
     * The command was issued in bulk (e.g. attack-all), so a command hook that
     * would normally prompt for confirmation should veto silently instead.
     */
    suppressPrompts?: boolean;
}

const EXIT_PATTERNS = [
    /^Zaniechane/,
    /^Brak adresata/,
    /^Brak tematu/,
    /^Nie ma takiego adresata/,
    /^Przerywasz pisanie/,
    /^Rezygnujesz z pisania/,
];

let preserverCaseMode = false;

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

export function normalizeCommand(command: string, options?: CommandOptions): string {
    const trimmedCommand = command.trimStart();
    if (!trimmedCommand || options?.preserveCase || preserverCaseMode) {
        return command;
    }

    // If autoLowercaseCommands is explicitly set to false, don't lowercase
    if (options?.autoLowercaseCommands === false) {
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

export default function initCommandPreserveCaseMode(client: Client) {
    let playerNum: number | undefined;
    let gmcpEditingActive = false;

    const enterMode = () => {
        preserverCaseMode = true;
    };

    const exitMode = () => {
        gmcpEditingActive = false;
        preserverCaseMode = false;
    };

    client.on('command', (command = '') => {
        if (typeof command !== 'string') {
            return;
        }
        const trimmed = command.trimStart();
        if (trimmed.startsWith('napisz')) {
            enterMode();
        }
    });

    client.on('gmcp.char.info', (info) => {
        if (typeof info?.object_num !== 'undefined') {
            playerNum = info.object_num;
        }
    });

    client.on('gmcp.objects.data', (objects) => {
        if (!playerNum) {
            return;
        }

        const own = objects[playerNum];
        if (!own || typeof own.editing === 'undefined') {
            return;
        }
        const isEditing = !!own.editing;
        if (isEditing) {
            gmcpEditingActive = true;
            enterMode();
        } else if (gmcpEditingActive) {
            exitMode();
        } else {
            gmcpEditingActive = false;
        }
    });

    EXIT_PATTERNS.forEach(pattern => {
        client.Triggers.registerTrigger(pattern, (line) => {
            exitMode();
            return line;
        }, 'command-preserve-case-mode');
    });
}
