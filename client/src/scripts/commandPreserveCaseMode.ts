import Client from "../Client";

const EXIT_PATTERNS = [
    /^Zaniechane/,
    /^Brak adresata/,
    /^Nie ma takiego adresata/,
    /^Przerywasz pisanie/,
    /^Rezygnujesz z pisania/,
];

export default function initCommandPreserveCaseMode(client: Client) {
    let playerNum: string | undefined;
    let gmcpEditingActive = false;

    const enterMode = () => {
        client.setCommandPreserveCaseMode(true);
    };

    const exitMode = () => {
        gmcpEditingActive = false;
        client.setCommandPreserveCaseMode(false);
    };

    client.addEventListener('command', (ev: CustomEvent<string>) => {
        const command = ev.detail ?? '';
        if (typeof command !== 'string') {
            return;
        }
        const trimmed = command.trimStart();
        if (trimmed.startsWith('napisz')) {
            enterMode();
        }
    });

    client.addEventListener('gmcp.char.info', (ev: CustomEvent<{ object_num?: number | string }>) => {
        if (typeof ev.detail?.object_num !== 'undefined') {
            playerNum = String(ev.detail.object_num);
        }
    });

    client.addEventListener('gmcp.char.objects', (ev: CustomEvent<Record<string, { editing?: boolean }>>) => {
        if (!playerNum) {
            return;
        }
        const objects = ev.detail;
        if (!objects || typeof objects !== 'object') {
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
        client.Triggers.registerTrigger(pattern, () => {
            exitMode();
            return undefined;
        }, 'command-preserve-case-mode');
    });
}
