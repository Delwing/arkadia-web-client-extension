import IconDefs from './IconDefs';
import Sidebar from './Sidebar';
import World from './World';
import CommandRail from './CommandRail';
import ContextMenu from './ContextMenu';

/**
 * The Forged HUD shell. `IconDefs` seeds the SVG symbol library; `.backdrop` is
 * the stone image; `.screen` reserves the left gutter for the sidebar and lays
 * out the output and command rail. `ContextMenu` portals to the body, rendering
 * herb/book right-click menus off the shared store. When the transport is down,
 * the connect action is an inline prompt in the game log (see GameLog).
 */
export default function App() {
    return (
        <>
            <IconDefs />
            <div className="backdrop" />
            <div className="screen">
                <Sidebar />
                <World />
                <CommandRail />
            </div>
            <ContextMenu />
        </>
    );
}
