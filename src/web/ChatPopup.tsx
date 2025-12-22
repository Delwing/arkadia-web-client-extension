import React, { useEffect, useState, useRef, useCallback } from 'react';
import eventBus from '@modules/core/eventBus';
import { DockablePopupWrapper } from './layout/components/DockablePopupWrapper';
import { usePopup } from './hooks/usePopup';
import { getChatHistory, ChatEntry } from '../client/scripts/chatHistory';

const POPUP_ID = 'popup:chat';
const DISPLAY_LIMIT = 100;

const ChatPopup: React.FC = () => {
    const { wrapperProps, setIsOpen, isOpen } = usePopup(POPUP_ID);
    const [messages, setMessages] = useState<ChatEntry[]>([]);
    const [showTeamOnly, setShowTeamOnly] = useState(false);
    const containerRef = useRef<HTMLDivElement>(null);
    const [autoScroll, setAutoScroll] = useState(true);

    // Load initial history when popup opens
    useEffect(() => {
        if (isOpen) {
            setMessages([...getChatHistory()]);
        }
    }, [isOpen]);

    // Listen for new messages
    useEffect(() => {
        const handleNewMessage = (entry: ChatEntry) => {
            setMessages(prev => {
                const updated = [...prev, entry];
                // Keep only last DISPLAY_LIMIT messages
                if (updated.length > DISPLAY_LIMIT) {
                    return updated.slice(-DISPLAY_LIMIT);
                }
                return updated;
            });
        };

        const handleCleared = () => {
            setMessages([]);
        };

        eventBus.on('chat.newMessage', handleNewMessage);
        eventBus.on('chat.cleared', handleCleared);

        return () => {
            eventBus.off('chat.newMessage', handleNewMessage);
            eventBus.off('chat.cleared', handleCleared);
        };
    }, []);

    // Auto-scroll to bottom when new messages arrive
    useEffect(() => {
        if (autoScroll && containerRef.current) {
            containerRef.current.scrollTop = containerRef.current.scrollHeight;
        }
    }, [messages, autoScroll, showTeamOnly]);

    // Handle scroll to detect if user scrolled up
    const handleScroll = useCallback(() => {
        if (!containerRef.current) return;
        const { scrollTop, scrollHeight, clientHeight } = containerRef.current;
        // If user is near bottom (within 50px), enable auto-scroll
        const isNearBottom = scrollHeight - scrollTop - clientHeight < 50;
        setAutoScroll(isNearBottom);
    }, []);

    // Listen for open event
    useEffect(() => {
        const handleOpen = () => {
            setIsOpen(true);
        };

        eventBus.on('chat.popup.open', handleOpen);

        return () => {
            eventBus.off('chat.popup.open', handleOpen);
        };
    }, [setIsOpen]);

    // Filter messages based on mode
    const displayedMessages = showTeamOnly
        ? messages.filter(m => m.isTeamMember)
        : messages;

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
