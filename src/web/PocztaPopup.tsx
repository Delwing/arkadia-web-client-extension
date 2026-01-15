import React, { useCallback, useEffect, useRef, useState } from 'react';
import eventBus from '@modules/core/eventBus';
import { DockablePopupWrapper } from './layout/components/DockablePopupWrapper';
import { usePopup } from './hooks/usePopup';
import { usePopupSetting } from './hooks/usePopupSetting';
import { gmcp } from '@client/gmcp';
import type { MailEntry, MailType } from '@client/scripts/poczta';

const POPUP_ID = 'popup:poczta';

const PocztaPopup: React.FC = () => {
    const [mails, setMails] = useState<MailEntry[]>([]);
    const [activeTab, setActiveTab] = usePopupSetting<MailType>(POPUP_ID, 'activeTab', 'nieprzeczytane');
    const [isLoading, setIsLoading] = useState(false);
    const pendingFetchRef = useRef<MailType | null>(null);

    const { wrapperProps, isOpen } = usePopup(POPUP_ID, {
        openEvent: 'poczta.popup.open',
    });

    const fetchMails = useCallback((type: MailType) => {
        if (!gmcp.char?.info) {
            pendingFetchRef.current = type;
            setIsLoading(true);
            return;
        }
        setIsLoading(true);
        setMails([]);
        eventBus.emit('poczta.fetch', { type });
    }, []);

    const handleTabChange = useCallback((type: MailType) => {
        setActiveTab(type);
        fetchMails(type);
    }, [setActiveTab, fetchMails]);

    useEffect(() => {
        if (isOpen) {
            fetchMails(activeTab);
        }
    }, [isOpen]);

    useEffect(() => {
        const handleCharInfo = () => {
            if (pendingFetchRef.current && isOpen) {
                const type = pendingFetchRef.current;
                pendingFetchRef.current = null;
                setMails([]);
                eventBus.emit('poczta.fetch', { type });
            }
        };

        return eventBus.on('gmcp.char.info', handleCharInfo);
    }, [isOpen]);

    useEffect(() => {
        const handleLoaded = (data: { type: MailType; mails: MailEntry[] }) => {
            if (data.type === activeTab) {
                setMails(data.mails);
                setIsLoading(false);
            }
        };

        return eventBus.on('poczta.loaded', handleLoaded);
    }, [activeTab]);

    const handleReadLetter = useCallback((number: number) => {
        setMails(prev => prev.map(mail =>
            mail.number === number ? { ...mail, isRead: true } : mail
        ));
        eventBus.emit('poczta.read', { number });
    }, []);

    const headerActions = (
        <div className="poczta-tabs">
            <button
                type="button"
                className={`poczta-tab-btn${activeTab === 'nieprzeczytane' ? ' poczta-tab-btn--active' : ''}`}
                onClick={() => handleTabChange('nieprzeczytane')}
            >
                Nowe
            </button>
            <button
                type="button"
                className={`poczta-tab-btn${activeTab === 'odebrane' ? ' poczta-tab-btn--active' : ''}`}
                onClick={() => handleTabChange('odebrane')}
            >
                Odebrane
            </button>
            <button
                type="button"
                className={`poczta-tab-btn${activeTab === 'wyslane' ? ' poczta-tab-btn--active' : ''}`}
                onClick={() => handleTabChange('wyslane')}
            >
                Wyslane
            </button>
            <button
                type="button"
                className={`poczta-tab-btn${activeTab === 'niewyslane' ? ' poczta-tab-btn--active' : ''}`}
                onClick={() => handleTabChange('niewyslane')}
            >
                Niewyslane
            </button>
        </div>
    );

    return (
        <DockablePopupWrapper
            {...wrapperProps}
            popupType="poczta"
            title="Poczta"
            minWidth={350}
            minHeight={200}
            initialWidth={500}
            initialHeight={400}
            className="poczta-window"
            bodyClassName="poczta-window-body"
            headerActions={headerActions}
        >
            {isLoading ? (
                <div className="poczta-loading">Ladowanie...</div>
            ) : mails.length === 0 ? (
                <div className="poczta-empty">Brak listow.</div>
            ) : (
                <div className="poczta-list">
                    {[...mails].reverse().map((mail) => {
                        const isOutgoing = activeTab === 'wyslane' || activeTab === 'niewyslane';
                        return (
                        <div
                            key={mail.number}
                            className={`poczta-item${mail.isRead && !isOutgoing ? ' poczta-item--read' : ''}`}
                            onClick={() => handleReadLetter(mail.number)}
                        >
                            <span className="poczta-item-number">{mail.number}.</span>
                            <span className="poczta-item-subject">{mail.subject}</span>
                            <span className="poczta-item-sender">{mail.sender}</span>
                            <span className="poczta-item-date">{mail.date}</span>
                        </div>
                        );
                    })}
                </div>
            )}
        </DockablePopupWrapper>
    );
};

export default PocztaPopup;
