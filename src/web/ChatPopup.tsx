import React, { useCallback, useMemo, useRef } from 'react';
import { DockablePopupWrapper } from './layout/components/DockablePopupWrapper';
import type { WindowSettingField } from './layout/windowSettings';
import { usePopup } from './hooks/usePopup';
import { usePopupSetting } from './hooks/usePopupSetting';
import { usePopupData } from './hooks/usePopupData';
import { useAutoScroll } from './hooks/useAutoScroll';
import { getChatHistory, ChatEntry } from '../client/scripts/chatHistory';

const POPUP_ID = 'popup:chat';
const DISPLAY_LIMIT = 100;
// While the user is scrolled up reading, dropping the oldest entries would
// shift the lines they are reading — so the cap is raised (never removed) until
// they come back to the bottom, as the main output pauses its trim in split view.
const SPLIT_VIEW_LIMIT = 500;
// Newest lines mirrored into the sticky pane; the pane clips what does not fit.
const SPLIT_VIEW_LINES = 40;
const DEFAULT_SPLIT_HEIGHT = 120;

/** Chat options in the window settings cog (the team filter stays in the header). */
const CHAT_SETTINGS_FIELDS: WindowSettingField[] = [
    { type: 'toggle', key: 'noWrap', label: 'Zawijaj wiersze', default: false, inverted: true },
    { type: 'toggle', key: 'showTimestamp', label: 'Znacznik czasu', default: true },
];

const ChatPopup: React.FC = () => {
    const { wrapperProps, isOpen } = usePopup(POPUP_ID, {
        openEvent: 'chat.popup.open',
    });
    const [showTeamOnly, setShowTeamOnly] = usePopupSetting(POPUP_ID, 'showTeamOnly', false);
    const [noWrap] = usePopupSetting(POPUP_ID, 'noWrap', false);
    const [showTimestamp] = usePopupSetting(POPUP_ID, 'showTimestamp', true);

    // Read by the (memoized) update transform, which must not re-subscribe
    // whenever the split view opens or closes.
    const splitViewRef = useRef(false);

    // Data management with automatic event subscription
    const { data: messages } = usePopupData<ChatEntry[]>(isOpen, {
        getInitialData: useCallback(() => [...getChatHistory()], []),
        updateEvent: 'chat.newMessage',
        transformUpdate: useCallback((entry: ChatEntry) => (prev: ChatEntry[]) => {
            const updated = [...prev, entry];
            const limit = splitViewRef.current ? SPLIT_VIEW_LIMIT : DISPLAY_LIMIT;
            return updated.length > limit ? updated.slice(-limit) : updated;
        }, []),
        clearEvent: 'chat.cleared',
        clearedValue: [],
    });

    // Filter messages based on mode. Memoized: it is useAutoScroll's dep, and a
    // fresh array on an unrelated render (the split view opening) would re-pin.
    const displayedMessages = useMemo(
        () => showTeamOnly ? messages.filter(m => m.isTeamMember) : messages,
        [messages, showTeamOnly],
    );

    // Auto-scroll, plus the split view that keeps the newest lines in sight
    // while the scrollback is being read — the same engine the main output runs on.
    const [splitHeight, setSplitHeight] = usePopupSetting(POPUP_ID, 'splitHeight', DEFAULT_SPLIT_HEIGHT);
    const { containerRef, isSplitView, splitPaneRef, splitHandleProps } = useAutoScroll({
        deps: [displayedMessages],
        splitHeight,
        onSplitResize: setSplitHeight,
    });
    splitViewRef.current = isSplitView;

    const renderEntry = (entry: ChatEntry, index: number) => (
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
    );

    // Team filter in header; wrapping and timestamps live in the settings cog.
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
            bodyClassName="popup-body"
            headerActions={headerActions}
            settingsFields={CHAT_SETTINGS_FIELDS}
        >
            <div
                className={`chat-popup__messages${noWrap ? ' chat-popup__messages--no-wrap' : ''}`}
                ref={containerRef}
            >
                {displayedMessages.length === 0 ? (
                    <div className="chat-popup__empty">
                        {showTeamOnly
                            ? 'Brak wiadomosci od druzyny.'
                            : 'Brak zapisanych wiadomosci czatu.'}
                    </div>
                ) : (
                    displayedMessages.map(renderEntry)
                )}
                {isSplitView && (
                    <div
                        className="popup-split-bottom"
                        ref={splitPaneRef}
                        style={{ height: splitHeight }}
                    >
                        <div className="popup-split-handle" {...splitHandleProps} />
                        <div className="popup-split-sticky">
                            {displayedMessages.slice(-SPLIT_VIEW_LINES).map(renderEntry)}
                        </div>
                    </div>
                )}
            </div>
        </DockablePopupWrapper>
    );
};

export default ChatPopup;
