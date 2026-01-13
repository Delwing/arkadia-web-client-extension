import React, { useCallback } from 'react';
import { DockablePopupWrapper } from './layout/components/DockablePopupWrapper';
import { usePopup } from './hooks/usePopup';
import { usePopupSetting } from './hooks/usePopupSetting';
import { usePopupData } from './hooks/usePopupData';
import { useAutoScroll } from './hooks/useAutoScroll';
import { getChatHistory, ChatEntry } from '../client/scripts/chatHistory';

const POPUP_ID = 'popup:chat';
const DISPLAY_LIMIT = 100;

const ChatPopup: React.FC = () => {
    const { wrapperProps, isOpen } = usePopup(POPUP_ID, {
        openEvent: 'chat.popup.open',
    });
    const [showTeamOnly, setShowTeamOnly] = usePopupSetting(POPUP_ID, 'showTeamOnly', false);

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

    // Toggle button in header
    const headerActions = (
        <button
            type="button"
            className={`chat-popup__team-toggle${showTeamOnly ? ' chat-popup__team-toggle--active' : ''}`}
            onClick={() => setShowTeamOnly(!showTeamOnly)}
            title={showTeamOnly ? 'Pokaz wszystkie wiadomosci' : 'Pokaz tylko wiadomosci druzyny'}
        >
            Druzyna
        </button>
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
                className="chat-popup__messages"
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
                            <span className="chat-popup__timestamp">[{entry.timestamp}]</span>
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
