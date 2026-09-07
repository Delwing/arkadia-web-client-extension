import { useEffect, useState } from "react";
import type { MapLostReason } from "@shared/map/MapHelper.ts";
import eventBus from "@modules/core/eventBus";
import { useClientEvent } from "../../hooks";

const REASONS: Record<MapLostReason, string> = {
    follow: "Nie udalo sie odtworzyc ruchu za druzyna - pozycja na mapie jest nieaktualna.",
    gmcp: "Gra podaje lokacje, ktorej nie ma na mapie - pozycja na mapie jest nieaktualna.",
};

const FALLBACK = "Mapper zgubil pozycje.";

/**
 * The mapper's own "I do not know where we are" warning. Sits next to the
 * location label, so it travels with the map into whichever panel or window
 * holds it.
 */
export const MapLostBadge = () => {
    const [state, setState] = useState<{ lost: boolean; reason: MapLostReason | null }>({
        lost: false,
        reason: null,
    });

    useClientEvent<{ lost: boolean; reason: MapLostReason | null }>("mapPositionLost", setState);

    useEffect(() => {
        eventBus.emit("requestMapPositionLost");
    }, []);

    if (!state.lost) {
        return null;
    }

    const hint = (state.reason && REASONS[state.reason]) || FALLBACK;

    return (
        <span className="map-lost-badge" title={`${FALLBACK} ${hint}`}>
            ZGUBIONY
        </span>
    );
};
