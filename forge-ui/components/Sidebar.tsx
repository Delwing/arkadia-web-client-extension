import MapPanel from './MapPanel';
import ObjectsPanel from './ObjectsPanel';
import TimePanel from './TimePanel';
import StatusPanel from './StatusPanel';

/**
 * Left-gutter column: the compact time/season clock sits on top, then the map
 * and nearby-objects list (they split the leftover height 50/50 by CSS), with
 * the combat-status panel pinned below at its natural height.
 */
export default function Sidebar() {
    return (
        <aside className="sidebar">
            <TimePanel />
            <MapPanel />
            <ObjectsPanel />
            <StatusPanel />
        </aside>
    );
}
