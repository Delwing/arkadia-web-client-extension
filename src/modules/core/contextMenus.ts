import {mudletColorLine} from "./Colors";
import type {HerbUse} from "@client/scripts/herbsLoader";
import {getBindableUses, isHerbSmokable} from "@modules/data/dataStores/herbsStore";
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
    amounts?: number[];
}

// The configured pre/post-use commands are emitted by the `/zi` alias itself
// (see herbCounter), so the menu must not wrap the command again: that both
// duplicated the pre-command and fired the post-command before the alias'
// asynchronous take-from-bag sequence had a chance to run.
export function buildHerbContextMenuItems(
    herbId: string,
    actions: HerbUse[] | undefined,
    commandPrefix: string,
    amounts: number[]
): ContextMenuItem[] {
    const bindableActions = getBindableUses(actions);

    const items: ContextMenuItem[] = bindableActions.flatMap(action =>
        amounts.map(amount => {
            const rawEffect = typeof action.effect === "string" ? action.effect.trim() : "";
            const parsedEffect = rawEffect ? mudletColorLine(rawEffect).text : "";
            const effectLabel = parsedEffect ? ` (${parsedEffect})` : "";
            return {
                label: `${action.action} ${amount}${effectLabel}`,
                action: () => {
                    eventBus.emit('sendCommand', { command: `${commandPrefix} ${action.action} ${herbId} ${amount}` });
                }
            };
        })
    );

    // Smokable herbs get a "nabij fajke" entry that loads the pipe (routed
    // through the /ziola_fajka alias, which takes the herb and uses the
    // instrumental form).
    if (isHerbSmokable(actions)) {
        items.push({
            label: 'Nabij fajke',
            action: () => eventBus.emit('sendCommand', { command: `/ziola_fajka ${herbId}` }),
        });
    }

    return items;
}

export function openHerbContextMenu(options: HerbMenuOptions) {
    const {
        herbId,
        actions,
        x,
        y,
        commandPrefix,
        amounts = DEFAULT_AMOUNTS,
    } = options;

    const items = buildHerbContextMenuItems(
        herbId,
        actions,
        commandPrefix,
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
