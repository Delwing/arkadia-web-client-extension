import { useEffect, useMemo } from 'react';
import { LayoutManagerWrapper } from '@web/layout';
import IconDefs from './IconDefs';
import World from './World';
import CommandRail from './CommandRail';
import ContextMenu from './ContextMenu';
import ShellPickerButton from './ShellPickerButton';
import { useClient } from '../client/ClientContext';
import { mountForgedMap } from '../map/forgedMap';
import ObjectsPanel from './ObjectsPanel';

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
 * by mountForgedMap); the built-in objectList slot renders the forged
 * "W poblizu" panel (ObjectsPanel) instead of the stock "Kondycje" list.
 */
export default function App() {
    const client = useClient();

    // The static #map host lives in index.html (offscreen). Hand it to the
    // built-in MapPanel, which relocates it into whichever dock/float owns it.
    const mapElement = useMemo(() => document.getElementById('map'), []);

    // Mount the real forged map into #map. EmbeddedMap binds to #map by id, so
    // this works whether or not MapPanel has already relocated the node.
    useEffect(() => {
        void mountForgedMap(client);
    }, [client]);

    return (
        <>
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
                        objectListElement={null}
                        objectListTitle="W poblizu"
                        renderObjectList={() => <ObjectsPanel bare />}
                    />
                </div>
                <div id="layout-right-dock-host" />
                <div id="input-area">
                    <CommandRail />
                </div>
                <div id="layout-bottom-dock-host" />
            </div>
            <ContextMenu />
            <ShellPickerButton />
        </>
    );
}
