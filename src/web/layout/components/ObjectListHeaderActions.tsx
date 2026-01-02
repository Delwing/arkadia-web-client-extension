import { useBuiltInPanelSetting } from '../../hooks/useBuiltInPanelSetting';
import eventBus from '@modules/core/eventBus';
import { useEffect } from 'react';

const PANEL_ID = 'objectList';

export function ObjectListHeaderActions() {
    const [cardViewMode, setCardViewMode] = useBuiltInPanelSetting(PANEL_ID, 'cardViewMode', false);

    // Emit event when card view mode changes (including initial mount)
    useEffect(() => {
        eventBus.emit('objectListCardViewMode', cardViewMode);
    }, [cardViewMode]);

    return (
        <button
            type="button"
            className={`object-list__card-toggle${cardViewMode ? ' object-list__card-toggle--active' : ''}`}
            onClick={() => setCardViewMode(!cardViewMode)}
            title={cardViewMode ? 'Widok listy' : 'Widok kart'}
        >
            Karty
        </button>
    );
}
