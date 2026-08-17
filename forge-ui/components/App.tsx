import { useEffect, useMemo } from 'react';
import { LayoutManagerWrapper } from '@web/layout';
import IconDefs from './IconDefs';
import World from './World';
import CommandRail from './CommandRail';
import ContextMenu from './ContextMenu';
import LocationNoteHost from './LocationNoteHost';
import { useClient } from '../client/ClientContext';
import { ConnectionProvider } from '../client/ConnectionContext';
import { mountForgedMap } from '../map/forgedMap';
import LoginGate from './LoginGate';

/**
 * The Forged HUD shell, built on the SHARED dock manager.
 *
 * The DOM mirrors the stock skeleton ids (`#main-container` > `#content-area`
 * grid + `#input-area` + `#layout-bottom-dock-host`) so the shared
 * `LayoutManagerWrapper` works with ZERO changes to src/web/layout/*: the dock
 * grid activates on `#content-area`, the bottom dock portals below the input,
 * and every catalog / non-catalog / plugin popup mounts from the wrapper. The
 * forged look comes entirely from layout-theme.css.
 *
 * The built-in map panel is fed the real forged map (`#map`, styled DarkModern
 * by mountForgedMap); the built-in objectList slot relocates the shared
 * `#objects-list` node (painted by the shared `ObjectList`, instantiated in
 * bootstrap). Forge defaults it to the "W poblizu" flavor via setObjectListChrome
 * — it's just another row-strategy of the one shared panel now, not a fork.
 */
export default function App() {
    const client = useClient();

    // The static #map / #objects-list hosts live in index.html (offscreen). Hand
    // them to the built-in panels, which relocate them into whichever dock/float
    // owns them.
    const mapElement = useMemo(() => document.getElementById('map'), []);
    const objectListElement = useMemo(() => document.getElementById('objects-list'), []);

    // Mount the real forged map into #map. EmbeddedMap binds to #map by id, so
    // this works whether or not MapPanel has already relocated the node.
    useEffect(() => {
        void mountForgedMap(client);
    }, [client]);

    return (
        <ConnectionProvider>
            <IconDefs />
            <div className="backdrop" />
            <div className="screen" id="main-container">
                {/* Rail hosts (siblings of #content-area) — in "rails span
                    everything" mode the left/right DockAreas portal in here so
                    they become full-height tracks of the #main-container grid.
                    display:contents keeps them inert otherwise. */}
                <div id="layout-left-dock-host" />
                <div id="content-area">
                    <World />
                    <LayoutManagerWrapper
                        mapElement={mapElement}
                        objectListElement={objectListElement}
                        objectListTitle="W poblizu"
                    />
                </div>
                <div id="layout-right-dock-host" />
                <div id="input-area">
                    <CommandRail />
                </div>
                <div id="layout-bottom-dock-host" />
            </div>
            <ContextMenu />
            {/* The stock note editor, opened from the map context menu / the
                "Notatki lokacji" panel. Loads itself on the first note event. */}
            <LocationNoteHost />
            {/* Last, so it layers over the whole HUD without needing a higher
                z-index than forge's own floating chrome. */}
            <LoginGate />
        </ConnectionProvider>
    );
}
