import { useBuiltInPanelSetting } from '../../hooks/useBuiltInPanelSetting';
import eventBus from '@modules/core/eventBus';
import { useEffect, useState } from 'react';
import { ObjectListHeaderMenu } from './ObjectListHeaderMenu';
import type { ObjectListViewMode } from '@web/objectList/context';
import { getObjectListChrome } from '../builtInChrome';

// Document Picture-in-Picture is progressively enhanced; only offer the button
// where the browser supports it.
const PIP_SUPPORTED = typeof window !== 'undefined' && !!window.documentPictureInPicture;

const PANEL_ID = 'objectList';

export type { ObjectListViewMode };

const VIEW_MODE_CYCLE: ObjectListViewMode[] = ['list', 'card', 'compact', 'compact-dots', 'raid', 'nearby'];

const VIEW_MODE_LABELS: Record<ObjectListViewMode, string> = {
    list: 'Lista',
    card: 'Karty',
    compact: 'Kompakt',
    'compact-dots': 'Kropki',
    raid: 'Raid',
    nearby: 'W poblizu'
};

const VIEW_MODE_TITLES: Record<ObjectListViewMode, string> = {
    list: 'Widok listy',
    card: 'Widok kart',
    compact: 'Widok kompaktowy',
    'compact-dots': 'Widok kompaktowy z kropkami',
    raid: 'Widok raid (siatka z paskami HP)',
    nearby: 'Widok W poblizu'
};

export function ObjectListHeaderActions() {
    const [viewMode, setViewMode] = useBuiltInPanelSetting<ObjectListViewMode>(
        PANEL_ID,
        'viewMode',
        getObjectListChrome().defaultViewMode ?? 'list',
    );

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

    // Picture-in-Picture toggle: the ObjectList class owns the PiP window and
    // reports its open/closed state; this button just drives it.
    const [pipActive, setPipActive] = useState(false);
    useEffect(() => {
        if (!PIP_SUPPORTED) return;
        const onChange = (active: boolean) => setPipActive(active);
        eventBus.on('objectList.pipActiveChanged', onChange);
        return () => { eventBus.off('objectList.pipActiveChanged', onChange); };
    }, []);

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
            {PIP_SUPPORTED && (
                <button
                    type="button"
                    className={`object-list__pip-toggle${pipActive ? ' object-list__pip-toggle--active' : ''}`}
                    onClick={() => eventBus.emit('objectList.togglePip')}
                    title={pipActive ? 'Zamknij Picture-in-Picture' : 'Picture-in-Picture'}
                >
                    ⤢
                </button>
            )}
            <ObjectListHeaderMenu />
        </>
    );
}
