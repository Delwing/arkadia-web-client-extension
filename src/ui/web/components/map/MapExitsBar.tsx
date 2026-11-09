import { DIRECTION_ORDER, useRoomExits, walkExit } from "../../map/roomExits";

interface Item {
    command: string;
    kind: "dir" | "special" | "custom";
}

/**
 * A strip along the bottom of the map listing every exit of the current room: the
 * compass directions, the game's special exits and, set apart, the map's special
 * exits the game does not show. One line; what does not fit is cut off with an
 * ellipsis and the whole list is in the tooltip. A click walks the exit.
 */
export function MapExitsBar() {
    const exits = useRoomExits();
    const items: Item[] = [
        ...DIRECTION_ORDER.filter((dir) => exits.standard.has(dir)).map((command) => ({ command, kind: "dir" as const })),
        ...exits.special.map((command) => ({ command, kind: "special" as const })),
        ...exits.custom.map((command) => ({ command, kind: "custom" as const })),
    ];
    if (items.length === 0) return null;

    return (
        <div className="map-exits-bar" title={items.map((item) => item.command).join(", ")}>
            {items.map((item, index) => (
                <span key={`${item.kind}:${item.command}`}>
                    {index > 0 && <span className="map-exits-bar__sep">·</span>}
                    <span
                        className={`map-exits-bar__exit map-exits-bar__exit--${item.kind}`}
                        data-exit={item.command}
                        onClick={() => walkExit(item.command)}
                    >
                        {item.command}
                    </span>
                </span>
            ))}
        </div>
    );
}
