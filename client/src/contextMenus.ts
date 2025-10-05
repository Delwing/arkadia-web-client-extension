import type Client from "./Client";
import type { HerbUse } from "./scripts/herbsLoader";

export interface ContextMenuItem {
    label: string;
    action: () => void;
}

const DEFAULT_AMOUNTS = [1, 3, 5];

interface HerbMenuOptions {
    herbId: string;
    actions?: HerbUse[];
    x: number;
    y: number;
    commandPrefix: string;
    preUseCommands?: string[];
    postUseCommands?: string[];
    amounts?: number[];
}

export function buildHerbContextMenuItems(
    client: Client,
    herbId: string,
    actions: HerbUse[] | undefined,
    commandPrefix: string,
    preUseCommands: string[],
    postUseCommands: string[],
    amounts: number[]
): ContextMenuItem[] {
    if (!actions || actions.length === 0) {
        return [];
    }

    return actions.flatMap(action =>
        amounts.map(amount => ({
            label: `${action.action} ${amount}`,
            action: () => {
                preUseCommands.forEach(cmd => client.sendCommand(cmd));
                client.sendCommand(`${commandPrefix} ${action.action} ${herbId} ${amount}`);
                postUseCommands.forEach(cmd => client.sendCommand(cmd));
            }
        }))
    );
}

export function openHerbContextMenu(client: Client, options: HerbMenuOptions) {
    const {
        herbId,
        actions,
        x,
        y,
        commandPrefix,
        preUseCommands = [],
        postUseCommands = [],
        amounts = DEFAULT_AMOUNTS,
    } = options;

    const items = buildHerbContextMenuItems(
        client,
        herbId,
        actions,
        commandPrefix,
        preUseCommands,
        postUseCommands,
        amounts,
    );

    if (items.length === 0) {
        return;
    }

    client.OutputHandler.showContextMenu(items, x, y, {
        header: `Ziolo: ${herbId}`,
        smallHeader: true,
    });
}

export function openMapContextMenu(client: Client, roomId: number, x: number, y: number) {
    const items: ContextMenuItem[] = [
        {
            label: 'Ustaw lokację',
            action: () => client.Map.setMapRoomById(roomId),
        },
        {
            label: 'Prowadź do lokacji',
            action: () => client.sendEvent('leadTo', roomId),
        },
        {
            label: 'Idź do lokacji',
            action: () => client.sendCommand(`/idz ${roomId}`),
        },
    ];

    client.OutputHandler.showContextMenu(items, x, y, {
        header: `Lokacja: ${roomId}`,
        smallHeader: true,
    });
}
