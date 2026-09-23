import React, { useEffect, useCallback, useMemo, useRef } from 'react';
import { DockablePopupWrapper } from './layout/components/DockablePopupWrapper';
import { usePopup } from './hooks/usePopup';
import { usePopupSetting } from './hooks/usePopupSetting';
import { usePopupData } from './hooks/usePopupData';
import { useAutoScroll } from './hooks/useAutoScroll';
import {
    getCombatHistory,
    setCombatRedirectSetting,
    CombatEntry,
    CombatMessageType
} from '../client/scripts/combatWindow';

const POPUP_ID = 'popup:combat';
const DISPLAY_LIMIT = 200;
// While the user is scrolled up reading the fight, dropping the oldest entries
// would shift the very lines they are reading — so the cap is raised (never
// removed) until they come back to the bottom, exactly as the main output
// pauses its trim in split view.
const SPLIT_VIEW_LIMIT = 1000;
// Newest lines mirrored into the sticky pane. The pane clips what does not fit,
// so this only has to be more than the tallest pane can show.
const SPLIT_VIEW_LINES = 40;
const DEFAULT_SPLIT_HEIGHT = 120;

type ToggleConfig = {
    label: string;
    type: CombatMessageType;
};

const TOGGLES: ToggleConfig[] = [
    { label: "Swoja", type: "combat.avatar" },
    { label: "Druzyny", type: "combat.team" },
    { label: "Innych", type: "combat.others" },
];

const CombatPopup: React.FC = () => {
    const { wrapperProps, isOpen } = usePopup(POPUP_ID, {
        openEvent: 'combat.popup.open',
    });

    // Toggle states for filtering which types to redirect
    const [showAvatar, setShowAvatar] = usePopupSetting(POPUP_ID, 'showAvatar', true);
    const [showTeam, setShowTeam] = usePopupSetting(POPUP_ID, 'showTeam', true);
    const [showOthers, setShowOthers] = usePopupSetting(POPUP_ID, 'showOthers', true);

    // Sync toggle states with redirect settings - only capture when popup is open
    useEffect(() => {
        setCombatRedirectSetting("combat.avatar", isOpen && showAvatar);
    }, [isOpen, showAvatar]);

    useEffect(() => {
        setCombatRedirectSetting("combat.team", isOpen && showTeam);
    }, [isOpen, showTeam]);

    useEffect(() => {
        setCombatRedirectSetting("combat.others", isOpen && showOthers);
    }, [isOpen, showOthers]);

    // Data management with automatic event subscription
    // Read by the (memoized) update transform, which must not re-subscribe
    // whenever the split view opens or closes.
    const splitViewRef = useRef(false);

    const { data: messages } = usePopupData<CombatEntry[]>(isOpen, {
        getInitialData: useCallback(() => [...getCombatHistory()], []),
        updateEvent: 'combat.newMessage',
        transformUpdate: useCallback((entry: CombatEntry) => (prev: CombatEntry[]) => {
            const updated = [...prev, entry];
            const limit = splitViewRef.current ? SPLIT_VIEW_LIMIT : DISPLAY_LIMIT;
            return updated.length > limit ? updated.slice(-limit) : updated;
        }, []),
        clearEvent: 'combat.cleared',
        clearedValue: [],
    });

    // Get current toggle states
    const toggleStates: Record<CombatMessageType, boolean> = {
        "combat.avatar": showAvatar,
        "combat.team": showTeam,
        "combat.others": showOthers,
    };

    const toggleSetters: Record<CombatMessageType, (value: boolean) => void> = {
        "combat.avatar": setShowAvatar,
        "combat.team": setShowTeam,
        "combat.others": setShowOthers,
    };

    // Memoized: it is useAutoScroll's dep, and a fresh array on an unrelated
    // render (the split view opening) would re-pin and swallow the next scroll.
    const displayedMessages = useMemo(() => {
        const shown: Record<CombatMessageType, boolean> = {
            "combat.avatar": showAvatar,
            "combat.team": showTeam,
            "combat.others": showOthers,
        };

        // Filter messages based on active toggles, then clean up separators
        const filteredMessages = messages.filter(m =>
            m.type === "separator" || shown[m.type]
        );

        // Remove separators that don't actually separate visible messages
        return filteredMessages.filter((entry, index, arr) => {
            if (entry.type !== "separator") return true;

            // Check if there's a non-separator message before this separator
            const hasMsgBefore = arr.slice(0, index).some(e => e.type !== "separator");
            // Check if there's a non-separator message after this separator
            const hasMsgAfter = arr.slice(index + 1).some(e => e.type !== "separator");

            return hasMsgBefore && hasMsgAfter;
        });
    }, [messages, showAvatar, showTeam, showOthers]);

    // Auto-scroll, plus the split view that lets the fight be read while it is
    // still scrolling past — the same engine the main output runs on.
    const [splitHeight, setSplitHeight] = usePopupSetting(POPUP_ID, 'splitHeight', DEFAULT_SPLIT_HEIGHT);
    const { containerRef, isSplitView, splitPaneRef, splitHandleProps } = useAutoScroll({
        deps: [displayedMessages],
        splitHeight,
        onSplitResize: setSplitHeight,
    });
    splitViewRef.current = isSplitView;

    const stickyMessages = isSplitView ? displayedMessages.slice(-SPLIT_VIEW_LINES) : [];

    const renderEntry = (entry: CombatEntry, index: number) =>
        entry.type === "separator" ? (
            <div
                key={`sep-${index}`}
                className="combat-popup__separator"
            />
        ) : (
            <div
                key={`${index}`}
                className={`combat-popup__message combat-popup__message--${entry.type.replace('combat.', '')}`}
            >
                <span
                    className="combat-popup__text"
                    dangerouslySetInnerHTML={{ __html: entry.buffer.toHtml() }}
                />
            </div>
        );

    // Toggle buttons in header
    const headerActions = (
        <>
            {TOGGLES.map(toggle => (
                <button
                    key={toggle.type}
                    type="button"
                    className={`combat-popup__toggle combat-popup__toggle--${toggle.type.replace('combat.', '')}${toggleStates[toggle.type] ? ' combat-popup__toggle--active' : ''}`}
                    onClick={() => toggleSetters[toggle.type](!toggleStates[toggle.type])}
                    title={toggleStates[toggle.type] ? `Ukryj: ${toggle.label}` : `Pokaz: ${toggle.label}`}
                >
                    {toggle.label}
                </button>
            ))}
        </>
    );

    return (
        <DockablePopupWrapper
            {...wrapperProps}
            popupType="combat"
            title="Walka"
            minWidth={300}
            minHeight={200}
            initialWidth={500}
            initialHeight={300}
            className="combat-popup"
            bodyClassName="combat-popup-body"
            headerActions={headerActions}
        >
            <div className="combat-popup__messages" ref={containerRef}>
                {displayedMessages.length === 0 ? (
                    <div className="popup-empty">
                        Brak wiadomosci walki.
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
                            {stickyMessages.map(renderEntry)}
                        </div>
                    </div>
                )}
            </div>
        </DockablePopupWrapper>
    );
};

export default CombatPopup;
