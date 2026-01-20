import type Client from "@client/Client";
import {mudletColorLine} from "./Colors";
import type {HerbUse} from "@client/scripts/herbsLoader";
import {showContextMenu} from "@shared/dom/contextMenu";
import eventBus from "@modules/core/eventBus";

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

    const bindableActions = actions.filter(action => !action.dont_bind);
    if (bindableActions.length === 0) {
        return [];
    }

    return bindableActions.flatMap(action =>
        amounts.map(amount => {
            const rawEffect = typeof action.effect === "string" ? action.effect.trim() : "";
            const parsedEffect = rawEffect ? mudletColorLine(rawEffect).text : "";
            const effectLabel = parsedEffect ? ` (${parsedEffect})` : "";
            return {
                label: `${action.action} ${amount}${effectLabel}`,
                action: () => {
                    preUseCommands.forEach(cmd => client.sendCommand(cmd));
                    client.sendCommand(`${commandPrefix} ${action.action} ${herbId} ${amount}`);
                    postUseCommands.forEach(cmd => client.sendCommand(cmd));
                }
            };
        })
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

    showContextMenu(items, x, y, {
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
        {
            label: 'Dodaj skrót',
            action: () => eventBus.emit('shortcuts.addWithRoom', { roomId }),
        },
        {
            label: 'Notatka',
            action: () => eventBus.emit('locationNote.edit', { roomId }),
        },
        {
            label: 'Otworz okno mapy',
            action: () => eventBus.emit('staticmap.popup.open', { roomId }),
        },
    ];

    showContextMenu(items, x, y, {
        header: `Lokacja: ${roomId}`,
        smallHeader: true,
    });
}
