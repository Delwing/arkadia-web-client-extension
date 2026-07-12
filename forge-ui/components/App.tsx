import { Fragment } from 'react';
import IconDefs from './IconDefs';
import Sidebar from './Sidebar';
import World from './World';
import CommandRail from './CommandRail';
import ContextMenu from './ContextMenu';
import { POPUP_CATALOG } from '@web/popups/popupCatalog';
import FloatingPopupHost from './FloatingPopupHost';
import './floatingPopup.css';

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

            {/* Stock dockable popups, reused verbatim from the shared catalog and
                shown as plain floating windows. Each popup is headless until its
                open event fires; FloatingPopupHost supplies the floating frame,
                drag, resize and close. Staggered so multiple opens don't stack. */}
            {POPUP_CATALOG.map(({ id, Component }, i) => (
                <Fragment key={id}>
                    <Component />
                    <FloatingPopupHost
                        popupId={id}
                        initialX={120 + (i % 6) * 26}
                        initialY={90 + (i % 6) * 26}
                    />
                </Fragment>
            ))}
        </>
    );
}
