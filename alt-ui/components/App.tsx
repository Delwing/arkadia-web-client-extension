import IconDefs from './IconDefs';
import Sidebar from './Sidebar';
import World from './World';
import CommandRail from './CommandRail';
import Caption from './Caption';

/**
 * The Forged HUD shell. `IconDefs` seeds the SVG symbol library; `.backdrop` is
 * the stone image; `.screen` reserves the left gutter for the sidebar and lays
 * out the output, command rail, and caption.
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
                <Caption />
            </div>
        </>
    );
}
