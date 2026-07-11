import MapPanel from './MapPanel';
import ObjectsPanel from './ObjectsPanel';

/** Left-gutter column: map on top, nearby objects below (split 50/50 by CSS). */
export default function Sidebar() {
    return (
        <aside className="sidebar">
            <MapPanel />
            <ObjectsPanel />
        </aside>
    );
}
