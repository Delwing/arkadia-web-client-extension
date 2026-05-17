import {mudletColorLine} from "./Colors";
import type {HerbUse} from "@client/scripts/herbsLoader";
import {showContextMenu} from "@web/contextMenu";
import eventBus from "@modules/core/eventBus";

export interface ContextMenuItem {
    label: string;
    action: () => void;
    opensWindow?: boolean;
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
                    preUseCommands.forEach(cmd => eventBus.emit('sendCommand', { command: cmd }));
                    eventBus.emit('sendCommand', { command: `${commandPrefix} ${action.action} ${herbId} ${amount}` });
                    postUseCommands.forEach(cmd => eventBus.emit('sendCommand', { command: cmd }));
                }
            };
        })
    );
}

export function openHerbContextMenu(options: HerbMenuOptions) {
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

export function openMapContextMenu(roomId: number, x: number, y: number, extraItems?: ContextMenuItem[]) {
    const items: ContextMenuItem[] = [
        ...(extraItems ?? []),
        {
            label: 'Ustaw lokację',
            action: () => eventBus.emit('map.setLocation', { roomId }),
        },
        {
            label: 'Prowadź do lokacji',
            action: () => eventBus.emit('leadTo', roomId),
        },
        {
            label: 'Idź do lokacji',
            action: () => eventBus.emit('sendCommand', { command: `/idz ${roomId}` }),
        },
        {
            label: 'Dodaj skrót',
            action: () => eventBus.emit('shortcuts.addWithRoom', { roomId }),
            opensWindow: true,
        },
        {
            label: 'Dodaj przystanek',
            action: () => eventBus.emit('tripPlanner.addStop', { roomId }),
            opensWindow: true,
        },
        {
            label: 'Notatka',
            action: () => eventBus.emit('locationNote.edit', { roomId }),
            opensWindow: true,
        },
        {
            label: 'Informacje o lokacji',
            action: () => eventBus.emit('roomInfo.popup.open', { roomId }),
            opensWindow: true,
        },
        {
            label: 'Otworz okno mapy',
            action: () => eventBus.emit('staticmap.popup.open', { roomId }),
            opensWindow: true,
        },
    ];

    showContextMenu(items, x, y, {
        header: `Lokacja: ${roomId}`,
        smallHeader: true,
    });
}
