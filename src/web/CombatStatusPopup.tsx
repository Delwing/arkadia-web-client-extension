import React, { useEffect, useState } from 'react';
import eventBus from '@modules/core/eventBus';
import { DockablePopupWrapper } from './layout/components/DockablePopupWrapper';
import { usePopup } from './hooks/usePopup';
import './CombatStatusPopup.css';

const POPUP_ID = 'popup:combatStatus';

// Cooldown ceilings, mirrored from the client scripts so the charge bars can be
// drawn as a fraction: coverTimer.ts COVER_TIME (5s), orderTimer.ts ORDER_TIME (15s).
const COVER_MAX = 5;
const ORDER_MAX = 15;

/** On/off pill: an optional short state word, followed by a coloured LED. */
function StatToggle({ on, onWord, offWord }: { on: boolean | null; onWord?: string; offWord?: string }) {
    const key = on === null ? 'unknown' : on ? 'on' : 'off';
    const showWord = onWord !== undefined && offWord !== undefined;
    const word = on === null ? '—' : on ? onWord : offWord;
    return (
        <span className={`cs-toggle cs-toggle--${key}`}>
            {showWord && <span className="cs-word">{word}</span>}
            <span className="cs-led" />
        </span>
    );
}

/**
 * Cooldown charge bar. The fill grows from empty toward full as the timer runs
 * down, so a full bar reading "GOTOW" means the action is ready again.
 */
function StatBar({ left, max }: { left: number | null; max: number }) {
    const secs = left ?? 0;
    const active = secs > 0;
    const pct = active ? Math.max(4, Math.min(100, ((max - secs) / max) * 100)) : 100;
    return (
        <span className={`cs-gauge ${active ? 'cs-gauge--charge' : 'cs-gauge--ready'}`}>
            <span className="cs-gauge__fill" style={{ width: `${pct}%` }} />
            <span className="cs-gauge__num">{active ? `${secs.toFixed(1)}s` : 'GOTOW'}</span>
        </span>
    );
}

const IconSword = () => (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
        <path d="M15.5 3.5 8 11l1.5 1.5L17 5V3.5h-1.5Z" />
        <path d="M8 11l-4.5 4.5M5 13l2 2M4 15.5 4.5 16" />
    </svg>
);
const IconShield = () => (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
        <path d="M10 2.5 4 4.5v5c0 4 2.6 6.6 6 8 3.4-1.4 6-4 6-8v-5L10 2.5Z" />
    </svg>
);
const IconRelease = () => (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
        <path d="M10 3v7M6.5 6.5 10 10l3.5-3.5" />
        <path d="M4 12c0 3.3 2.7 5 6 5s6-1.7 6-5" />
    </svg>
);
const IconBanner = () => (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
        <path d="M5.5 3v14" />
        <path d="M5.5 4h9l-2 3 2 3h-9" />
    </svg>
);

/**
 * "Postawa" — a compact combat-readiness popup ported from forge-ui's
 * StatusPanel. Surfaces four bits of client state at a glance: whether a weapon
 * is drawn (`weapon_state`), the cover cooldown (`coverTimer`), the auto-release
 * guard toggle (`releaseGuard`, driven by the `/puszczaj` alias) and the
 * team-order cooldown (`orderTimer`, only meaningful while leading a team).
 *
 * Named distinctly from the stock combat message log ("Walka", popup:combat).
 */
const CombatStatusPopup: React.FC = () => {
    const { wrapperProps } = usePopup(POPUP_ID, { openEvent: 'combatStatus.popup.open' });

    const [weapon, setWeapon] = useState<boolean | null>(null);
    const [cover, setCover] = useState<number | null>(null);
    const [order, setOrder] = useState<number | null>(null);
    // Guard-release starts on: objectAliases seeds `releaseGuard = true`, but the
    // popup may mount after that first emit — match the client default.
    const [releaseGuard, setReleaseGuard] = useState<boolean>(true);
    const [isLeader, setIsLeader] = useState(false);

    useEffect(() => {
        const onWeapon = (v: boolean) => setWeapon(Boolean(v));
        const onCover = (v: number | null) => setCover(v);
        const onOrder = (v: number | null) => setOrder(v);
        const onGuard = (v: boolean) => setReleaseGuard(Boolean(v));
        const onLeader = (v: boolean) => setIsLeader(Boolean(v));
        eventBus.on('weapon_state', onWeapon);
        eventBus.on('coverTimer', onCover);
        eventBus.on('orderTimer', onOrder);
        eventBus.on('releaseGuard', onGuard);
        eventBus.on('isTeamLeader', onLeader);
        return () => {
            eventBus.off('weapon_state', onWeapon);
            eventBus.off('coverTimer', onCover);
            eventBus.off('orderTimer', onOrder);
            eventBus.off('releaseGuard', onGuard);
            eventBus.off('isTeamLeader', onLeader);
        };
    }, []);

    // Toggle guard-release. Emitting on the shared bus updates both the client
    // (objectAliases listens on `releaseGuard`) and this popup's own state.
    const toggleGuard = () => eventBus.emit('releaseGuard', !releaseGuard);

    return (
        <DockablePopupWrapper
            {...wrapperProps}
            popupType="combatStatus"
            title="Postawa"
            minWidth={180}
            initialWidth={230}
            bodyClassName="combat-status-popup"
        >
            <div className="cs-row">
                <span className="cs-ico"><IconSword /></span>
                <span className="cs-label">Bron</span>
                <StatToggle on={weapon} onWord="dobyta" offWord="schowana" />
            </div>
            <div className="cs-row">
                <span className="cs-ico"><IconShield /></span>
                <span className="cs-label">Zaslona</span>
                <StatBar left={cover} max={COVER_MAX} />
            </div>
            <button type="button" className="cs-row cs-row--btn" onClick={toggleGuard} title="Przelacz puszczanie zaslon">
                <span className="cs-ico"><IconRelease /></span>
                <span className="cs-label">Puszczaj zaslony</span>
                <StatToggle on={releaseGuard} />
            </button>
            <div className={`cs-row${isLeader ? '' : ' cs-row--idle'}`}>
                <span className="cs-ico"><IconBanner /></span>
                <span className="cs-label">Rozkaz</span>
                {isLeader
                    ? <StatBar left={order} max={ORDER_MAX} />
                    : <span className="cs-toggle cs-toggle--unknown"><span className="cs-word">{'—'}</span><span className="cs-led" /></span>}
            </div>
        </DockablePopupWrapper>
    );
};

export default CombatStatusPopup;
