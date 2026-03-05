import React, { useCallback, useEffect, useState } from 'react';
import eventBus from '@modules/core/eventBus';
import { globalStorage } from '@modules/core/storage';
import { DockablePopupWrapper } from './layout/components/DockablePopupWrapper';
import { usePopup } from './hooks/usePopup';

interface ShortcutEntry {
    key: string;
    id: number;
    label: string;
}

const POPUP_ID = 'popup:skroty';

const SkrotyPopup: React.FC = () => {
    const [shortcuts, setShortcuts] = useState<ShortcutEntry[]>([]);

    const { wrapperProps } = usePopup(POPUP_ID, {
        openEvent: 'skroty.popup.open',
    });

    useEffect(() => {
        const saved = globalStorage.get('shortcuts') as any;
        const arr = Array.isArray(saved) ? saved : [];
        setShortcuts(arr);
    }, []);

    useEffect(() => {
        return globalStorage.onChange('shortcuts', (newValue) => {
            const arr = newValue ? (Array.isArray(newValue) ? newValue : Object.values(newValue)) : [];
            setShortcuts(arr);
        });
    }, []);

    const handleProwadz = useCallback((id: number) => {
        eventBus.emit('leadTo', id);
    }, []);

    const handleIdz = useCallback((id: number) => {
        eventBus.emit('sendCommand', { command: `/idz ${id}` });
    }, []);

    const handlePokaz = useCallback((id: number) => {
        eventBus.emit('map.centerOn', { roomId: id });
    }, []);

    const handleUstaw = useCallback((id: number) => {
        eventBus.emit('map.setLocation', { roomId: id });
    }, []);

    return (
        <DockablePopupWrapper
            {...wrapperProps}
            popupType="skroty"
            title={`Skroty (${shortcuts.length})`}
            minWidth={280}
            minHeight={100}
            initialWidth={340}
            initialHeight={250}
            className="skroty-window"
            bodyClassName="skroty-window-body"
        >
            {shortcuts.length === 0 ? (
                <div className="skroty-empty">Brak zapisanych skrotow.</div>
            ) : (
                <div className="skroty-list">
                    {shortcuts.map(shortcut => (
                        <div key={shortcut.key} className="skroty-item">
                            <div className="skroty-item-row">
                                <span className="skroty-item-key">{shortcut.key}</span>
                                <span className="skroty-item-id">({shortcut.id})</span>
                                <div className="skroty-item-actions">
                                    <button
                                        type="button"
                                        className="skroty-btn"
                                        onClick={() => handleProwadz(shortcut.id)}
                                        title="Pokaz sciezke na mapie"
                                    >
                                        Prowadz
                                    </button>
                                    <button
                                        type="button"
                                        className="skroty-btn"
                                        onClick={() => handlePokaz(shortcut.id)}
                                        title="Wycentruj mape na lokacji"
                                    >
                                        Pokaz
                                    </button>
                                    <button
                                        type="button"
                                        className="skroty-btn"
                                        onClick={() => handleUstaw(shortcut.id)}
                                        title="Ustaw lokacje na mapie"
                                    >
                                        Ustaw
                                    </button>
                                    <button
                                        type="button"
                                        className="skroty-btn skroty-btn--primary"
                                        onClick={() => handleIdz(shortcut.id)}
                                        title="Rozpocznij chodzenie do lokacji"
                                    >
                                        Idz
                                    </button>
                                </div>
                            </div>
                            {shortcut.label && (
                                <div className="skroty-item-label">{shortcut.label}</div>
                            )}
                        </div>
                    ))}
                </div>
            )}
        </DockablePopupWrapper>
    );
};

export default SkrotyPopup;
