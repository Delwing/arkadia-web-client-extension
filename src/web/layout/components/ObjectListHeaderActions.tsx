import { useBuiltInPanelSetting } from '../../hooks/useBuiltInPanelSetting';
import eventBus from '@modules/core/eventBus';
import { useEffect } from 'react';

const PANEL_ID = 'objectList';

export type ObjectListViewMode = 'list' | 'card' | 'compact';

const VIEW_MODE_CYCLE: ObjectListViewMode[] = ['list', 'card', 'compact'];

const VIEW_MODE_LABELS: Record<ObjectListViewMode, string> = {
    list: 'Lista',
    card: 'Karty',
    compact: 'Kompakt'
};

const VIEW_MODE_TITLES: Record<ObjectListViewMode, string> = {
    list: 'Widok listy',
    card: 'Widok kart',
    compact: 'Widok kompaktowy'
};

export function ObjectListHeaderActions() {
    const [viewMode, setViewMode] = useBuiltInPanelSetting<ObjectListViewMode>(PANEL_ID, 'viewMode', 'list');

    // Emit event when view mode changes (including initial mount)
    useEffect(() => {
        eventBus.emit('objectListViewMode', viewMode);
    }, [viewMode]);

    const cycleViewMode = () => {
        const currentIndex = VIEW_MODE_CYCLE.indexOf(viewMode);
        const nextIndex = (currentIndex + 1) % VIEW_MODE_CYCLE.length;
        setViewMode(VIEW_MODE_CYCLE[nextIndex]);
    };

    const nextMode = VIEW_MODE_CYCLE[(VIEW_MODE_CYCLE.indexOf(viewMode) + 1) % VIEW_MODE_CYCLE.length];

    return (
        <>
            <button
                type="button"
                className={`object-list__card-toggle${viewMode !== 'list' ? ' object-list__card-toggle--active' : ''}`}
                onClick={cycleViewMode}
                title={VIEW_MODE_TITLES[nextMode]}
            >
                {VIEW_MODE_LABELS[viewMode]}
            </button>
        </>
    );
}
