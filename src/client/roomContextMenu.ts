import { getUiPort } from './ports';

/** The bits of a mouse event the room menu needs; DOM and React events both have them. */
interface MenuMouseEvent {
    clientX: number;
    clientY: number;
    preventDefault(): void;
    stopPropagation(): void;
}

/**
 * Right-click handler for a room named in the game output: the UI's room menu
 * (see `UiPort.showRoomMenu`).
 */
export function roomContextMenuHandler(roomId: number) {
    return (ev: MenuMouseEvent) => {
        ev.preventDefault();
        ev.stopPropagation();
        getUiPort().showRoomMenu?.(roomId, ev.clientX, ev.clientY);
    };
}
