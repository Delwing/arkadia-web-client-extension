import MapPanel from './MapPanel';
import ObjectsPanel from './ObjectsPanel';
import TimePanel from './TimePanel';
import StatusPanel from './StatusPanel';

/**
 * Left-gutter column: map on top, nearby objects below (they split the leftover
 * height 50/50 by CSS). The compact time/season and combat-status panels sit
 * between them at their natural height.
 */
export default function Sidebar() {
    return (
        <aside className="sidebar">
            <MapPanel />
            <TimePanel />
            <StatusPanel />
            <ObjectsPanel />
        </aside>
    );
}
