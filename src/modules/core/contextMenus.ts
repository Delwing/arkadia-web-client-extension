import {mudletColorLine} from "./Colors";
import type {HerbUse} from "@client/scripts/herbsLoader";
import {getBindableUses, isHerbSmokable} from "@modules/data/dataStores/herbsStore";
import {showContextMenu, type ContextMenuEntry} from "@web/contextMenu";
import {getEmbeddedMap} from "@web/embedRegistry";
import {characterStorage} from "./storage";
import eventBus from "@modules/core/eventBus";
import {Flame, Footprints, Info, Leaf, Map as MapIcon, MapPin, Navigation, Route, StickyNote, Zap} from "lucide-react";

export type ContextMenuItem = ContextMenuEntry;

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
    // One row per use: the verb, its effect under it, and the amounts at the end.
    const items: ContextMenuItem[] = getBindableUses(actions).map(use => {
        const rawEffect = typeof use.effect === "string" ? use.effect.trim() : "";
        const effect = rawEffect ? mudletColorLine(rawEffect).text : "";
        return {
            label: use.action,
            detail: effect || undefined,
            action: () => {},
            choices: amounts.map(amount => ({
                label: String(amount),
                title: `${use.action} ${amount}`,
                action: () => {
                    eventBus.emit('sendCommand', { command: `${commandPrefix} ${use.action} ${herbId} ${amount}` });
                },
            })),
        };
    });

    // Smokable herbs get a "nabij fajke" entry that loads the pipe (routed
    // through the /ziola_fajka alias, which takes the herb and uses the
    // instrumental form).
    if (isHerbSmokable(actions)) {
        items.push({
            label: 'Nabij fajkę',
            icon: Flame,
            separator: items.length > 0,
            action: () => eventBus.emit('sendCommand', { command: `/ziola_fajka ${herbId}` }),
        });
    }

    items.push({
        label: 'Pokaż w Ziołach',
        icon: Leaf,
        separator: !isHerbSmokable(actions) && items.length > 0,
        opensWindow: true,
        action: () => eventBus.emit('sendCommand', { command: '/ziola' }),
    });

    return items;
}

/** How many of the herb the character's bags hold, or null before any count. */
function herbsInBags(herbId: string): number | null {
    const bags = characterStorage.get("herb_counts") as Record<string, { herbs?: Record<string, number> }> | null;
    if (!bags || typeof bags !== "object") return null;
    let total = 0;
    for (const bag of Object.values(bags)) {
        const count = bag?.herbs?.[herbId];
        if (typeof count === "number") total += count;
    }
    return total;
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

    const count = herbsInBags(herbId);
    showContextMenu(items, x, y, {
        header: herbId,
        headerMeta: count === null ? undefined : `${count} w woreczkach`,
        smallHeader: true,
        width: 320,
    });
}

/** "Kuznia przy Rynku" and "Novigrad · #3187", from the map when it has the room. */
function roomHeader(roomId: number): { header: string; headerMeta: string } {
    const reader = getEmbeddedMap()?.reader;
    const room = reader?.getRoom(roomId) as { name?: string; area?: number } | undefined;
    const name = room?.name && room.name !== String(roomId) ? room.name : "";
    const area = room?.area !== undefined ? reader?.getArea?.(room.area) : undefined;
    const areaName = area?.getAreaName?.() ?? "";
    if (!name) return { header: `Lokacja #${roomId}`, headerMeta: areaName };
    return { header: name, headerMeta: areaName ? `${areaName} · #${roomId}` : `#${roomId}` };
}

export function openMapContextMenu(roomId: number, x: number, y: number, extraItems?: ContextMenuItem[]) {
    const items: ContextMenuItem[] = [
        {
            label: 'Idź',
            icon: Footprints,
            variant: 'quick',
            active: true,
            action: () => eventBus.emit('sendCommand', { command: `/idz ${roomId}` }),
        },
        {
            label: 'Prowadź',
            icon: Navigation,
            variant: 'quick',
            action: () => eventBus.emit('leadTo', roomId),
        },
        {
            label: 'Tu jestem',
            icon: MapPin,
            variant: 'quick',
            action: () => eventBus.emit('map.setLocation', { roomId }),
        },
        ...(extraItems ?? []).map((item, i) => ({ ...item, separator: i === 0 })),
        {
            section: 'Oznacz',
            label: 'Skrót',
            icon: Zap,
            action: () => eventBus.emit('shortcuts.addWithRoom', { roomId }),
            opensWindow: true,
        },
        {
            section: 'Oznacz',
            label: 'Notatka',
            icon: StickyNote,
            action: () => eventBus.emit('locationNote.edit', { roomId }),
            opensWindow: true,
        },
        {
            section: 'Oznacz',
            label: 'Przystanek w planie trasy',
            icon: Route,
            action: () => eventBus.emit('tripPlanner.addStop', { roomId }),
            opensWindow: true,
        },
        {
            separator: true,
            label: 'Informacje o lokacji',
            icon: Info,
            action: () => eventBus.emit('roomInfo.popup.open', { roomId }),
            opensWindow: true,
        },
        {
            label: 'Otwórz w oknie mapy',
            icon: MapIcon,
            action: () => eventBus.emit('staticmap.popup.open', { roomId }),
            opensWindow: true,
        },
    ];

    showContextMenu(items, x, y, {
        ...roomHeader(roomId),
        smallHeader: true,
        width: 300,
    });
}
