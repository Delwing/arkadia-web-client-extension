import React, { useState, useMemo, useCallback } from 'react';
import { DockablePopupWrapper } from './layout/components/DockablePopupWrapper';
import { usePopup } from './hooks/usePopup';
import { usePopupData } from './hooks/usePopupData';
import { getDepositsData, getTotalCopper, type DepositInfo } from '@client/scripts/deposits';
import { splitCurrency } from '@client/scripts/priceEvaluation';
import { getTransformDefinitions, type ContainerItem } from '@client/scripts/prettyContainers';
import { AnsiAwareBuffer } from '@client/ansi/FormatState';

const POPUP_ID = 'popup:deposits';

function buildItemBuffer(item: ContainerItem): AnsiAwareBuffer {
    const transforms = getTransformDefinitions();
    let buffer = new AnsiAwareBuffer(item.name);
    for (const tr of transforms) {
        buffer = tr.transform(buffer, item, '');
    }
    return buffer;
}

function transformItemName(item: ContainerItem): string {
    return buildItemBuffer(item).toHtml();
}

/** Plain text of the rendered item name, including transform-added badges like "[Ag]". */
function itemSearchText(item: ContainerItem): string {
    return buildItemBuffer(item).text;
}

interface DepositCard {
    bankName: string;
    bankId: number;
    deposit: DepositInfo;
}

/** Sort order: full deposits first, then empty, then no deposit */
function cardSortOrder(card: DepositCard): number {
    if (card.deposit.items === null) return 2;
    if (card.deposit.items.length === 0) return 1;
    return 0;
}

function matchesFilter(card: DepositCard, filter: string): boolean {
    const lower = filter.toLowerCase();
    if (card.bankName.toLowerCase().includes(lower)) return true;
    if (card.deposit.items) {
        return card.deposit.items.some(item => itemSearchText(item).toLowerCase().includes(lower));
    }
    return false;
}

const DepositsPopup: React.FC = () => {
    const [filter, setFilter] = useState('');

    const handleOpen = useCallback((data: { filter?: string }) => {
        setFilter(data?.filter ?? '');
    }, []);

    const { wrapperProps, isOpen } = usePopup<'deposits.popup.open'>(POPUP_ID, {
        openEvent: 'deposits.popup.open',
        onOpen: handleOpen,
    });

    const { data: deposits } = usePopupData<Record<number, DepositInfo>>(isOpen, {
        getInitialData: useCallback(() => getDepositsData(), []),
        updateEvent: 'deposits.updated',
        transformUpdate: useCallback(() => getDepositsData(), []),
    });

    const cards: DepositCard[] = useMemo(() => {
        return Object.entries(deposits)
            .map(([id, deposit]) => ({
                bankName: deposit.name,
                bankId: Number(id),
                deposit,
            }))
            .sort((a, b) => cardSortOrder(a) - cardSortOrder(b));
    }, [deposits]);

    const filteredCards = useMemo(() => {
        if (!filter.trim()) return cards;
        return cards.filter(card => matchesFilter(card, filter));
    }, [cards, filter]);

    const totalCopper = useMemo(() => getTotalCopper(deposits), [deposits]);

    const headerActions = (
        <input
            type="text"
            className="deposits-popup__filter"
            placeholder="Filtruj..."
            value={filter}
            onChange={e => setFilter(e.target.value)}
        />
    );

    return (
        <DockablePopupWrapper
            {...wrapperProps}
            popupType="deposits"
            title={`Depozyty (${cards.length})`}
            minWidth={300}
            minHeight={200}
            initialWidth={500}
            initialHeight={450}
            className="deposits-popup"
            bodyClassName="deposits-popup-body"
            headerActions={headerActions}
        >
            <div className="deposits-popup__content">
                {filteredCards.length === 0 ? (
                    <div className="deposits-popup__empty">
                        {cards.length === 0 ? 'Brak zapisanych depozytow.' : 'Brak wynikow.'}
                    </div>
                ) : (
                    <div className="deposits-popup__grid">
                        {filteredCards.map(({ bankName, deposit }) => (
                            <div key={bankName} className={`deposits-popup__card${!deposit.items || deposit.items.length === 0 ? ' deposits-popup__card--empty' : ''}`}>
                                <div className="deposits-popup__card-header">
                                    <span className="deposits-popup__bank-name">{bankName}</span>
                                    {deposit.items && deposit.items.length > 0 && (
                                        <span className="deposits-popup__item-total">({deposit.items.length})</span>
                                    )}
                                </div>
                                <div className="deposits-popup__card-body">
                                    {deposit.items === null ? (
                                        <div className="deposits-popup__card-status">brak depozytu</div>
                                    ) : deposit.items.length === 0 ? (
                                        <div className="deposits-popup__card-status">(pusty)</div>
                                    ) : (
                                        deposit.items
                                            .filter(item => !filter.trim() || itemSearchText(item).toLowerCase().includes(filter.toLowerCase()) || bankName.toLowerCase().includes(filter.toLowerCase()))
                                            .map((item, idx) => (
                                                <div key={idx} className="deposits-popup__item-row">
                                                    <span className="deposits-popup__item-name" dangerouslySetInnerHTML={{ __html: transformItemName(item) }} />
                                                    <span className="deposits-popup__item-count">{item.count}</span>
                                                </div>
                                            ))
                                    )}
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>
            {totalCopper > 0 && (
                <div className="deposits-popup__footer">
                    {(() => {
                        const c = splitCurrency(totalCopper);
                        return <>
                            {c.mithril > 0 && <span className="deposits-popup__coin--mithril">{c.mithril}m</span>}
                            {c.gold > 0 && <span className="deposits-popup__coin--gold">{c.gold}g</span>}
                            {c.silver > 0 && <span className="deposits-popup__coin--silver">{c.silver}s</span>}
                            {c.copper > 0 && <span className="deposits-popup__coin--copper">{c.copper}c</span>}
                        </>;
                    })()}
                </div>
            )}
        </DockablePopupWrapper>
    );
};

export default DepositsPopup;
