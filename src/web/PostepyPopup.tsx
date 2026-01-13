import React, { useEffect, useState, useRef, useCallback } from 'react';
import eventBus from '@modules/core/eventBus';
import { DockablePopupWrapper } from './layout/components/DockablePopupWrapper';
import { usePopup } from './hooks/usePopup';
import {
    getImproveData,
    getFormattedPostepyTable,
    ImproveData,
    formatDuration,
} from '../client/scripts/improveCounter';
import { copyBufferAsImage } from './bufferToImage';

const POPUP_ID = 'popup:postepy';

const PostepyPopup: React.FC = () => {
    const { wrapperProps, isOpen } = usePopup(POPUP_ID, {
        openEvent: 'postepy.popup.open',
    });
    const [data, setData] = useState<ImproveData | null>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const [now, setNow] = useState(Date.now());

    // Load initial data when popup opens
    useEffect(() => {
        if (isOpen) {
            setData(getImproveData());
        }
    }, [isOpen]);

    // Listen for data updates from multiple sources
    useEffect(() => {
        const handleUpdate = (newData: ImproveData) => setData(newData);
        const handleKillsUpdate = () => setData(getImproveData());

        const unsub1 = eventBus.on('postepy.updated', handleUpdate);
        const unsub2 = eventBus.on('zabici.updated', handleKillsUpdate);

        return () => {
            unsub1();
            unsub2();
        };
    }, []);

    // Update "now" every second for live time display
    useEffect(() => {
        if (!isOpen) return;

        const interval = setInterval(() => {
            setNow(Date.now());
        }, 1000);

        return () => clearInterval(interval);
    }, [isOpen]);

    // Scroll to bottom when entries change
    useEffect(() => {
        if (containerRef.current) {
            containerRef.current.scrollTop = containerRef.current.scrollHeight;
        }
    }, [data?.entries.length]);

    const entries = data?.entries ?? [];
    const lastTime = data?.lastTime ?? Date.now();
    const lastKills = data?.lastKills ?? { my: 0, team: 0 };
    const currentKills = data?.currentKills ?? { my: 0, team: 0 };
    const waitingForFirstCombat = data?.waitingForFirstCombat ?? false;

    // Calculate mean time
    const meanTime = entries.length > 0
        ? entries.reduce((sum, e) => sum + e.delta, 0) / entries.length
        : 0;

    // Calculate time and kills since last improve
    const timeSinceLast = waitingForFirstCombat ? 0 : Math.max(0, now - lastTime);
    const killsSinceLast = waitingForFirstCombat ? 0 : currentKills.my - lastKills.my;
    const teamKillsSinceLast = waitingForFirstCombat ? 0 : currentKills.team - lastKills.team;

    const handleCopyAsImage = useCallback(async () => {
        const buffer = getFormattedPostepyTable();
        if (buffer) {
            await copyBufferAsImage(buffer);
        }
    }, []);

    // Header with mean time and image button
    const headerActions = (
        <>
            {meanTime > 0 && (
                <span className="postepy-popup__mean-time">
                    {formatDuration(meanTime)}
                </span>
            )}
            <button
                type="button"
                className="postepy-popup__image-btn"
                onClick={handleCopyAsImage}
                title="Kopiuj jako obraz"
            >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
                    <circle cx="8.5" cy="8.5" r="1.5"/>
                    <polyline points="21 15 16 10 5 21"/>
                </svg>
            </button>
        </>
    );

    return (
        <DockablePopupWrapper
            {...wrapperProps}
            popupType="postepy"
            title="Postepy"
            minWidth={200}
            minHeight={150}
            initialWidth={325}
            initialHeight={375}
            className="postepy-popup"
            bodyClassName="postepy-popup-body"
            headerActions={headerActions}
        >
            <div className="postepy-popup__content" ref={containerRef}>
                {entries.length === 0 ? (
                    <div className="postepy-popup__empty">
                        Brak postepow.
                    </div>
                ) : (
                    <div className="postepy-popup__entries">
                        {entries.map((entry, index) => (
                            <div key={index} className="postepy-popup__entry">
                                <span className="postepy-popup__entry-num">{index + 1}.</span>
                                <span className="postepy-popup__entry-state">{entry.state}</span>
                                <span className="postepy-popup__entry-time">{formatDuration(entry.delta)}</span>
                                <span className="postepy-popup__entry-kills">{entry.killsMy ?? 0}/{(entry.killsMy ?? 0) + (entry.killsTeam ?? 0)}</span>
                            </div>
                        ))}
                    </div>
                )}
                <div className="postepy-popup__since-last">
                    Od ostatniego: {formatDuration(timeSinceLast)} / {killsSinceLast}/{killsSinceLast + teamKillsSinceLast}
                </div>
            </div>
        </DockablePopupWrapper>
    );
};

export default PostepyPopup;
