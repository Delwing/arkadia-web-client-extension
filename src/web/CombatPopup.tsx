import React, { useEffect, useLayoutEffect, useState, useRef, useCallback } from 'react';
import eventBus from '@modules/core/eventBus';
import { DockablePopupWrapper } from './layout/components/DockablePopupWrapper';
import { usePopup } from './hooks/usePopup';
import { usePopupSetting } from './hooks/usePopupSetting';
import {
    getCombatHistory,
    setCombatRedirectSetting,
    CombatEntry,
    CombatMessageType
} from '../client/scripts/combatWindow';

const POPUP_ID = 'popup:combat';
const DISPLAY_LIMIT = 200;

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
    const { wrapperProps, setIsOpen, isOpen } = usePopup(POPUP_ID);
    const [messages, setMessages] = useState<CombatEntry[]>([]);
    const containerRef = useRef<HTMLDivElement>(null);
    const [autoScroll, setAutoScroll] = useState(true);

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

    // Load initial history when popup opens
    useEffect(() => {
        if (isOpen) {
            setMessages([...getCombatHistory()]);
        }
    }, [isOpen]);

    // Listen for new messages
    useEffect(() => {
        const handleNewMessage = (entry: CombatEntry) => {
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

        eventBus.on('combat.newMessage', handleNewMessage);
        eventBus.on('combat.cleared', handleCleared);

        return () => {
            eventBus.off('combat.newMessage', handleNewMessage);
            eventBus.off('combat.cleared', handleCleared);
        };
    }, []);

    // Auto-scroll to bottom when new messages arrive
    useLayoutEffect(() => {
        if (autoScroll && containerRef.current) {
            const container = containerRef.current;
            container.scrollTop = container.scrollHeight;
            requestAnimationFrame(() => {
                container.scrollTop = container.scrollHeight;
            });
        }
    }, [messages, autoScroll]);

    // Handle scroll to detect if user scrolled up
    const handleScroll = useCallback(() => {
        if (!containerRef.current) return;
        const { scrollTop, scrollHeight, clientHeight } = containerRef.current;
        const isNearBottom = scrollHeight - scrollTop - clientHeight < 50;
        setAutoScroll(isNearBottom);
    }, []);

    // Listen for open event
    useEffect(() => {
        const handleOpen = () => {
            setIsOpen(true);
        };

        eventBus.on('combat.popup.open', handleOpen);

        return () => {
            eventBus.off('combat.popup.open', handleOpen);
        };
    }, [setIsOpen]);

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

    // Filter messages based on active toggles, then clean up separators
    const filteredMessages = messages.filter(m =>
        m.type === "separator" || toggleStates[m.type]
    );

    // Remove separators that don't actually separate visible messages
    const displayedMessages = filteredMessages.filter((entry, index, arr) => {
        if (entry.type !== "separator") return true;

        // Check if there's a non-separator message before this separator
        const hasMsgBefore = arr.slice(0, index).some(e => e.type !== "separator");
        // Check if there's a non-separator message after this separator
        const hasMsgAfter = arr.slice(index + 1).some(e => e.type !== "separator");

        return hasMsgBefore && hasMsgAfter;
    });

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
            <div
                className="combat-popup__messages"
                ref={containerRef}
                onScroll={handleScroll}
            >
                {displayedMessages.length === 0 ? (
                    <div className="combat-popup__empty">
                        Brak wiadomosci walki.
                    </div>
                ) : (
                    displayedMessages.map((entry, index) =>
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
                        )
                    )
                )}
            </div>
        </DockablePopupWrapper>
    );
};

export default CombatPopup;
