import React, { useCallback, useEffect, useRef, useState } from 'react';
import { DockablePopupWrapper } from './layout/components/DockablePopupWrapper';
import { usePopup } from './hooks/usePopup';
import { usePopupSetting } from './hooks/usePopupSetting';
import { usePopupData } from './hooks/usePopupData';
import { useAutoScroll } from './hooks/useAutoScroll';
import { getChatHistory, ChatEntry } from '../client/scripts/chatHistory';

const POPUP_ID = 'popup:chat';
const DISPLAY_LIMIT = 100;

interface ChatHeaderMenuProps {
    noWrap: boolean;
    setNoWrap: (value: boolean) => void;
    showTimestamp: boolean;
    setShowTimestamp: (value: boolean) => void;
}

const ChatHeaderMenu: React.FC<ChatHeaderMenuProps> = ({
    noWrap,
    setNoWrap,
    showTimestamp,
    setShowTimestamp,
}) => {
    const [isOpen, setIsOpen] = useState(false);
    const [dropdownStyle, setDropdownStyle] = useState<React.CSSProperties | null>(null);
    const menuRef = useRef<HTMLDivElement>(null);
    const toggleRef = useRef<HTMLButtonElement>(null);

    const calculateDropdownPosition = useCallback(() => {
        if (toggleRef.current) {
            const win = toggleRef.current.ownerDocument.defaultView ?? window;
            const rect = toggleRef.current.getBoundingClientRect();
            const availableSpace = win.innerHeight - rect.bottom - 16;
            const maxHeight = Math.max(100, Math.min(360, availableSpace));
            setDropdownStyle({
                position: 'fixed',
                top: rect.bottom + 4,
                right: win.innerWidth - rect.right,
                maxHeight,
            });
        }
    }, []);

    const toggleMenu = useCallback(() => {
        setIsOpen(prev => {
            if (!prev) calculateDropdownPosition();
            return !prev;
        });
    }, [calculateDropdownPosition]);

    const closeMenu = useCallback(() => { setIsOpen(false); }, []);

    useEffect(() => {
        if (!isOpen) return;

        const handleClickOutside = (event: PointerEvent) => {
            if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
                closeMenu();
            }
        };

        const handleEscape = (event: KeyboardEvent) => {
            if (event.key === 'Escape') closeMenu();
        };

        window.addEventListener('pointerdown', handleClickOutside);
        window.addEventListener('keydown', handleEscape);

        return () => {
            window.removeEventListener('pointerdown', handleClickOutside);
            window.removeEventListener('keydown', handleEscape);
        };
    }, [isOpen, closeMenu]);

    const handleToggleWrap = useCallback(() => {
        setNoWrap(!noWrap);
        closeMenu();
    }, [noWrap, setNoWrap, closeMenu]);

    const handleToggleTimestamp = useCallback(() => {
        setShowTimestamp(!showTimestamp);
        closeMenu();
    }, [showTimestamp, setShowTimestamp, closeMenu]);

    return (
        <div ref={menuRef} className="map-header-menu">
            <button
                ref={toggleRef}
                type="button"
                className="map-header-menu__toggle"
                onClick={toggleMenu}
                title="Ustawienia czatu"
            >
                <span className="map-header-menu__hamburger" />
            </button>
            {isOpen && (
                <div className="map-header-menu__dropdown" style={dropdownStyle ?? undefined}>
                    <button
                        type="button"
                        className="map-header-menu__item map-header-menu__item--checkbox"
                        onClick={handleToggleWrap}
                    >
                        <span className={`map-header-menu__checkbox${!noWrap ? ' map-header-menu__checkbox--checked' : ''}`} />
                        Zawijaj
                    </button>
                    <button
                        type="button"
                        className="map-header-menu__item map-header-menu__item--checkbox"
                        onClick={handleToggleTimestamp}
                    >
                        <span className={`map-header-menu__checkbox${showTimestamp ? ' map-header-menu__checkbox--checked' : ''}`} />
                        Znacznik czasu
                    </button>
                </div>
            )}
        </div>
    );
};

const ChatPopup: React.FC = () => {
    const { wrapperProps, isOpen } = usePopup(POPUP_ID, {
        openEvent: 'chat.popup.open',
    });
    const [showTeamOnly, setShowTeamOnly] = usePopupSetting(POPUP_ID, 'showTeamOnly', false);
    const [noWrap, setNoWrap] = usePopupSetting(POPUP_ID, 'noWrap', false);
    const [showTimestamp, setShowTimestamp] = usePopupSetting(POPUP_ID, 'showTimestamp', true);

    // Data management with automatic event subscription
    const { data: messages } = usePopupData<ChatEntry[]>(isOpen, {
        getInitialData: useCallback(() => [...getChatHistory()], []),
        updateEvent: 'chat.newMessage',
        transformUpdate: useCallback((entry: ChatEntry) => (prev: ChatEntry[]) => {
            const updated = [...prev, entry];
            return updated.length > DISPLAY_LIMIT ? updated.slice(-DISPLAY_LIMIT) : updated;
        }, []),
        clearEvent: 'chat.cleared',
        clearedValue: [],
    });

    // Filter messages based on mode
    const displayedMessages = showTeamOnly
        ? messages.filter(m => m.isTeamMember)
        : messages;

    // Auto-scroll behavior
    const { containerRef, handleScroll } = useAutoScroll({
        deps: [displayedMessages],
    });

    // Toggle buttons in header
    const headerActions = (
        <>
            <button
                type="button"
                className={`chat-popup__team-toggle${showTeamOnly ? ' chat-popup__team-toggle--active' : ''}`}
                onClick={() => setShowTeamOnly(!showTeamOnly)}
                title={showTeamOnly ? 'Pokaz wszystkie wiadomosci' : 'Pokaz tylko wiadomosci druzyny'}
            >
                Druzyna
            </button>
            <ChatHeaderMenu
                noWrap={noWrap}
                setNoWrap={setNoWrap}
                showTimestamp={showTimestamp}
                setShowTimestamp={setShowTimestamp}
            />
        </>
    );

    return (
        <DockablePopupWrapper
            {...wrapperProps}
            popupType="chat"
            title={showTeamOnly ? 'Czat druzyny' : 'Czat'}
            minWidth={300}
            minHeight={200}
            initialWidth={600}
            initialHeight={350}
            className="chat-popup"
            bodyClassName="chat-popup-body"
            headerActions={headerActions}
        >
            <div
                className={`chat-popup__messages${noWrap ? ' chat-popup__messages--no-wrap' : ''}`}
                ref={containerRef}
                onScroll={handleScroll}
            >
                {displayedMessages.length === 0 ? (
                    <div className="chat-popup__empty">
                        {showTeamOnly
                            ? 'Brak wiadomosci od druzyny.'
                            : 'Brak zapisanych wiadomosci czatu.'}
                    </div>
                ) : (
                    displayedMessages.map((entry, index) => (
                        <div
                            key={`${entry.timestamp}-${index}`}
                            className={`chat-popup__message${entry.isTeamMember ? ' chat-popup__message--team' : ''}`}
                        >
                            {showTimestamp && (
                                <span className="chat-popup__timestamp">[{entry.timestamp}]</span>
                            )}
                            <span
                                className="chat-popup__text"
                                dangerouslySetInnerHTML={{ __html: entry.buffer.toHtml() }}
                            />
                        </div>
                    ))
                )}
            </div>
        </DockablePopupWrapper>
    );
};

export default ChatPopup;
