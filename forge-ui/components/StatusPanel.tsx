import { useState } from 'react';
import eventBus from '@modules/core/eventBus';
import { useClientEvent } from '../hooks/useClientEvent';
import Panel from './Panel';

// Cooldown ceilings, mirrored from the client scripts so the charge bars can be
// drawn as a fraction: coverTimer.ts COVER_TIME (5s), orderTimer.ts ORDER_TIME (15s).
const COVER_MAX = 5;
const ORDER_MAX = 15;

/**
 * On/off pill: a coloured LED, optionally followed by a short state word.
 * `word` is dropped on rows whose label is long enough to carry the meaning on
 * its own (the LED colour still signals on/off).
 */
function StatToggle({ on, onWord, offWord }: { on: boolean | null; onWord?: string; offWord?: string }) {
    const key = on === null ? 'unknown' : on ? 'on' : 'off';
    const showWord = onWord !== undefined && offWord !== undefined;
    const word = on === null ? '—' : on ? onWord : offWord;
    return (
        <span className={`st-toggle st-toggle--${key}`}>
            <span className="st-led" />
            {showWord && <span className="st-word">{word}</span>}
        </span>
    );
}

/**
 * Cooldown charge bar. The fill grows from empty toward full as the timer runs
 * down, so a full green bar reading "GOTOW" means the action is ready again; an
 * amber, partly-filled bar shows the remaining seconds while it recharges.
 */
function StatBar({ left, max }: { left: number | null; max: number }) {
    const secs = left ?? 0;
    const active = secs > 0;
    const pct = active ? Math.max(4, Math.min(100, ((max - secs) / max) * 100)) : 100;
    return (
        <span className={`st-gauge ${active ? 'st-gauge--charge' : 'st-gauge--ready'}`}>
            <span className="st-gauge__fill" style={{ width: `${pct}%` }} />
            <span className="st-gauge__num">{active ? `${secs.toFixed(1)}s` : 'GOTOW'}</span>
        </span>
    );
}

/**
 * Compact combat-status panel that sits below the clock. It surfaces four bits
 * of client state at a glance: whether a weapon is drawn (`weapon_state`), the
 * cover cooldown (`coverTimer`), the team-order cooldown (`orderTimer`, only
 * meaningful while leading a team) and the auto-release-guard toggle driven by
 * the `/puszczaj` alias (`releaseGuard`).
 */
export default function StatusPanel() {
    const [weapon, setWeapon] = useState<boolean | null>(null);
    const [cover, setCover] = useState<number | null>(null);
    const [order, setOrder] = useState<number | null>(null);
    // Guard-release starts on: objectAliases seeds `releaseGuard = true` and
    // emits it at setup, but the panel may mount after that first emit — so we
    // match the client's default rather than showing an unknown LED until the
    // next toggle.
    const [releaseGuard, setReleaseGuard] = useState<boolean>(true);
    const [isLeader, setIsLeader] = useState(false);

    useClientEvent('weapon_state', (v) => setWeapon(Boolean(v)));
    useClientEvent('coverTimer', (v) => setCover(v));
    useClientEvent('orderTimer', (v) => setOrder(v));
    useClientEvent('releaseGuard', (v) => setReleaseGuard(Boolean(v)));
    useClientEvent('isTeamLeader', (v) => setIsLeader(Boolean(v)));

    // Toggle guard-release. Emitting on the shared bus updates both the client
    // (objectAliases listens on `releaseGuard`) and this panel's own state, so
    // there is no local flip to keep in sync.
    const toggleGuard = () => eventBus.emit('releaseGuard', !releaseGuard);

    return (
        <Panel title="Walka" className="panel--status" bodyClassName="statpane">
            <div className="st-row">
                <span className="st-ico"><svg viewBox="0 0 20 20"><use href="#i-sword" stroke="currentColor" /></svg></span>
                <span className="st-label">Bron</span>
                <StatToggle on={weapon} onWord="dobyta" offWord="schowana" />
            </div>
            <div className="st-row">
                <span className="st-ico"><svg viewBox="0 0 20 20"><use href="#i-shield" stroke="currentColor" /></svg></span>
                <span className="st-label">Zaslona</span>
                <StatBar left={cover} max={COVER_MAX} />
            </div>
            <button type="button" className="st-row st-row--btn" onClick={toggleGuard} title="Przelacz puszczanie zaslon">
                <span className="st-ico"><svg viewBox="0 0 20 20"><use href="#i-release" stroke="currentColor" /></svg></span>
                <span className="st-label">Puszczaj zaslony</span>
                <StatToggle on={releaseGuard} />
            </button>
            <div className={`st-row${isLeader ? '' : ' st-row--idle'}`}>
                <span className="st-ico"><svg viewBox="0 0 20 20"><use href="#i-banner" stroke="currentColor" /></svg></span>
                <span className="st-label">Rozkaz</span>
                {isLeader
                    ? <StatBar left={order} max={ORDER_MAX} />
                    : <span className="st-toggle st-toggle--unknown"><span className="st-led" /><span className="st-word">{'—'}</span></span>}
            </div>
        </Panel>
    );
}
