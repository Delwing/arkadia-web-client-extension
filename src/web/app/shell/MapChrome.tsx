import { LocationLabel } from "@web-ui/components/map/LocationLabel";
import { PauseIcon } from "@web-ui/components/map/PauseIcon";
import { MapLostBadge } from "@web-ui/components/map/MapLostBadge";

/**
 * What sits over the map wherever it is shown: the location label with the
 * pause icon (top left), and the lost-position badge (top right). It stays
 * visible with the label hidden: it is a warning, not chrome. Rendered by the
 * map's default spot or by the layout panel holding the map; each piece asks
 * for its current state when it mounts.
 */
export function MapChrome({ labelVisible = true }: { labelVisible?: boolean }) {
    return (
        <>
            <div id="location-wrapper" style={labelVisible ? undefined : { display: "none" }}>
                <div id="location-label">
                    <span id="location-text"><LocationLabel /></span>
                </div>
                <span id="pause-icon"><PauseIcon /></span>
            </div>
            <div id="map-lost-wrapper"><MapLostBadge /></div>
        </>
    );
}
