import React, { useEffect, useState, useRef, useCallback } from 'react';
import eventBus from '@modules/core/eventBus';
import { DockablePopupWrapper } from './layout/components/DockablePopupWrapper';
import { usePopup } from './hooks/usePopup';
import {
    getImproveData,
    ImproveData,
    ImproveEntry,
    formatDuration,
} from '../client/scripts/improveCounter';

const POPUP_ID = 'popup:postepy';

function formatTime(timestamp: number): string {
    const date = new Date(timestamp);
    const h = String(date.getHours()).padStart(2, '0');
    const m = String(date.getMinutes()).padStart(2, '0');
    const s = String(date.getSeconds()).padStart(2, '0');
    return `${h}:${m}:${s}`;
}

const PostepyPopup: React.FC = () => {
    const { wrapperProps, setIsOpen, isOpen } = usePopup(POPUP_ID);
    const [data, setData] = useState<ImproveData | null>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const [now, setNow] = useState(Date.now());

    // Load initial data when popup opens
    useEffect(() => {
        if (isOpen) {
            setData(getImproveData());
        }
    }, [isOpen]);

    // Listen for data updates
    useEffect(() => {
        const handleUpdate = (newData: ImproveData) => {
            setData(newData);
        };

        eventBus.on('postepy.updated', handleUpdate);

        return () => {
            eventBus.off('postepy.updated', handleUpdate);
        };
    }, []);

    // Listen for open event
    useEffect(() => {
        const handleOpen = () => {
            setIsOpen(true);
        };

        eventBus.on('postepy.popup.open', handleOpen);

        return () => {
            eventBus.off('postepy.popup.open', handleOpen);
        };
    }, [setIsOpen]);

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

    // Calculate mean time
    const meanTime = entries.length > 0
        ? entries.reduce((sum, e) => sum + e.delta, 0) / entries.length
        : 0;

    // Calculate time and kills since last improve
    const timeSinceLast = now - lastTime;
    const killsSinceLast = currentKills.my - lastKills.my;
    const teamKillsSinceLast = currentKills.team - lastKills.team;

    // Header with mean time
    const headerActions = meanTime > 0 ? (
        <span className="postepy-popup__mean-time">
            {formatDuration(meanTime)}
        </span>
    ) : null;

    return (
        <DockablePopupWrapper
            {...wrapperProps}
            popupType="postepy"
            title="Postepy"
            minWidth={200}
            minHeight={150}
            initialWidth={280}
            initialHeight={250}
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
