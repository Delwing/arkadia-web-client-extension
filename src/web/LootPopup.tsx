import React, { useState, useCallback, useEffect, useMemo } from 'react';
import eventBus from '@modules/core/eventBus';
import { DockablePopupWrapper } from './layout/components/DockablePopupWrapper';
import { usePopup } from './hooks/usePopup';
import type { LootPopupPayload, LootItem } from '@client/scripts/lootParser';

interface BodyEntry {
    description: string;
    items: LootItem[];
}

interface SpecialItem {
    item: LootItem;
    bodyIndex: number;
    itemIndex: number;
}

const POPUP_ID = 'popup:loot';

const LootPopup: React.FC = () => {
    const [bodies, setBodies] = useState<BodyEntry[]>([]);

    const handleOpen = useCallback((data: LootPopupPayload) => {
        setBodies(prev => {
            const existing = prev.findIndex(b => b.description === data.description);
            if (existing >= 0) {
                const updated = [...prev];
                updated[existing] = { description: data.description, items: data.items };
                return updated;
            }
            return [...prev, { description: data.description, items: data.items }];
        });
    }, []);

    const { wrapperProps, close, isOpen } = usePopup<'loot.popup.open'>(POPUP_ID, {
        openEvent: 'loot.popup.open',
        onOpen: handleOpen,
    });

    const wasOpenRef = React.useRef(false);
    useEffect(() => {
        if (wasOpenRef.current && !isOpen) {
            eventBus.emit('loot.popup.closed');
        }
        wasOpenRef.current = isOpen;
    }, [isOpen]);

    // Clear all loot data on room change
    useEffect(() => {
        return eventBus.on('loot.cleared', () => {
            setBodies([]);
            close();
        });
    }, [close]);

    // Auto-close when all bodies are empty
    useEffect(() => {
        if (bodies.length > 0 && bodies.every(b => b.items.length === 0)) {
            setBodies([]);
            close();
        }
    }, [bodies, close]);

    // Collect special items (magics/keys) across all bodies
    const specialItems = useMemo<SpecialItem[]>(() => {
        const result: SpecialItem[] = [];
        bodies.forEach((body, bodyIndex) => {
            body.items.forEach((item, itemIndex) => {
                if (item.special) {
                    result.push({ item, bodyIndex, itemIndex });
                }
            });
        });
        return result;
    }, [bodies]);

    const handleItemClick = useCallback((bodyIndex: number, itemIndex: number) => {
        const body = bodies[bodyIndex];
        if (!body) return;
        const item = body.items[itemIndex];
        if (!item) return;

        eventBus.emit('sendCommand', { command: `wez ${item.fullName} z ciala ${body.description}` });

        setBodies(prev => {
            const updated = [...prev];
            const updatedBody = { ...updated[bodyIndex], items: [...updated[bodyIndex].items] };
            updatedBody.items.splice(itemIndex, 1);
            if (updatedBody.items.length === 0) {
                updated.splice(bodyIndex, 1);
            } else {
                updated[bodyIndex] = updatedBody;
            }
            return updated;
        });
    }, [bodies]);

    return (
        <DockablePopupWrapper
            {...wrapperProps}
            popupType="loot"
            title="Loot"
            minWidth={200}
            minHeight={100}
            initialWidth={350}
            initialHeight={300}
            className="loot-popup"
            bodyClassName="loot-popup-body"
        >
            <div className="loot-popup__content">
                {bodies.length === 0 ? (
                    <div className="loot-popup__empty">Brak przedmiotow.</div>
                ) : (
                    <>
                        {specialItems.length > 0 && (
                            <div className="loot-popup__section loot-popup__section--special">
                                <div className="loot-popup__section-header loot-popup__section-header--special">Magiki i klucze</div>
                                <div className="loot-popup__items">
                                    {specialItems.map((si) => (
                                        <button
                                            key={`special-${si.bodyIndex}-${si.itemIndex}-${si.item.name}`}
                                            type="button"
                                            className="loot-popup__item"
                                            onClick={() => handleItemClick(si.bodyIndex, si.itemIndex)}
                                            title={`wez ${si.item.fullName} z ciala ${bodies[si.bodyIndex]?.description}`}
                                            style={si.item.color ? { color: si.item.color } : undefined}
                                        >
                                            {si.item.fullName}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        )}
                        {bodies.map((body, bodyIndex) => {
                            const regularItems = body.items.filter(item => !item.special);
                            if (regularItems.length === 0) return null;
                            return (
                                <div key={body.description} className="loot-popup__section">
                                    <div className="loot-popup__section-header">{body.description}</div>
                                    <div className="loot-popup__items">
                                        {body.items.map((item, itemIndex) => {
                                            if (item.special) return null;
                                            return (
                                                <button
                                                    key={`${item.name}-${itemIndex}`}
                                                    type="button"
                                                    className="loot-popup__item"
                                                    onClick={() => handleItemClick(bodyIndex, itemIndex)}
                                                    title={`wez ${item.fullName} z ciala ${body.description}`}
                                                    style={item.color ? { color: item.color } : undefined}
                                                >
                                                    {item.fullName}
                                                </button>
                                            );
                                        })}
                                    </div>
                                </div>
                            );
                        })}
                    </>
                )}
            </div>
        </DockablePopupWrapper>
    );
};

export default LootPopup;
