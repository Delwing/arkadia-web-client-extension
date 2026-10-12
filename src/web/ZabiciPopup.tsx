import React, { useEffect, useRef, useCallback, useState } from 'react';
import { DockablePopupWrapper } from './layout/components/DockablePopupWrapper';
import { usePopup } from './hooks/usePopup';
import { usePopupSetting } from './hooks/usePopupSetting';
import { usePopupData } from './hooks/usePopupData';
import { getKillData, KillData } from '../client/scripts/kill';
import { HeaderButton } from '@web-ui/primitives';

const POPUP_ID = 'popup:zabici';

/** Named (capitalised) mobs are the unique ones. */
const isUnique = (mob: string) => /^[A-Z]/.test(mob);

/** Unique mobs first, then by name; zero counts dropped. */
function sortedKills(counts: Record<string, number>): [string, number][] {
    return Object.entries(counts)
        .filter(([, count]) => count > 0)
        .sort(([a], [b]) => (isUnique(a) !== isUnique(b) ? (isUnique(a) ? -1 : 1) : a.localeCompare(b)));
}

const sum = (counts: Record<string, number>) => Object.values(counts).reduce((s, c) => s + c, 0);

const ME = '';
const rowKey = (player: string, mob: string) => `${player}\u0000${mob}`;

const ZabiciPopup: React.FC = () => {
    const { wrapperProps, isOpen } = usePopup(POPUP_ID, {
        openEvent: 'zabici.popup.open',
    });
    const containerRef = useRef<HTMLDivElement>(null);
    const [showTeam, setShowTeam] = usePopupSetting(POPUP_ID, 'showTeam', false);

    // Data management with automatic event subscription
    const { data } = usePopupData<KillData | null>(isOpen, {
        getInitialData: useCallback(() => getKillData(), []),
        updateEvent: 'zabici.updated',
    });

    const kills = data?.kills ?? {};
    const teamKills = data?.teamKills ?? {};
    const totals = data?.totals ?? { my: 0, team: 0 };

    const myKills: Record<string, number> = {};
    for (const [mob, entry] of Object.entries(kills)) myKills[mob] = entry.mySession;
    const myEntries = sortedKills(myKills);

    const teamEntries = Object.entries(teamKills)
        .filter(([, mobs]) => sum(mobs) > 0)
        .sort(([a], [b]) => a.localeCompare(b));

    // The row the latest kill changed: lit up briefly and scrolled into view.
    const [freshKey, setFreshKey] = useState<string | null>(null);
    const previousCounts = useRef<Map<string, number> | null>(null);
    useEffect(() => {
        if (!data) return;
        const counts = new Map<string, number>();
        for (const [mob, entry] of Object.entries(data.kills)) counts.set(rowKey(ME, mob), entry.mySession);
        for (const [player, mobs] of Object.entries(data.teamKills)) {
            for (const [mob, count] of Object.entries(mobs)) counts.set(rowKey(player, mob), count);
        }
        const previous = previousCounts.current;
        previousCounts.current = counts;
        if (!previous) return;
        for (const [key, count] of counts) {
            if (count > (previous.get(key) ?? 0)) {
                setFreshKey(key);
                return;
            }
        }
    }, [data]);

    useEffect(() => {
        if (!freshKey) return;
        const row = containerRef.current?.querySelector(`[data-kill-key="${CSS.escape(freshKey)}"]`);
        row?.scrollIntoView({ block: 'nearest' });
        // Dropping the class right away starts the fade back.
        const timer = window.setTimeout(() => setFreshKey(null), 100);
        return () => window.clearTimeout(timer);
    }, [freshKey]);

    const headerActions = (
        <HeaderButton active={showTeam} onClick={() => setShowTeam(!showTeam)} title={showTeam ? 'Ukryj drużynę' : 'Pokaż drużynę'}>
            Drużyna
        </HeaderButton>
    );

    const renderRows = (player: string, entries: [string, number][]) => entries.map(([mob, count]) => {
        const key = rowKey(player, mob);
        const classes = ['kill-list__row'];
        if (isUnique(mob)) classes.push('kill-list__row--unique');
        if (key === freshKey) classes.push('kill-list__row--fresh');
        return (
            <div key={mob} className={classes.join(' ')} data-kill-key={key}>
                <span className="kill-list__mob" title={mob}>{mob}</span>
                <span className="kill-list__count">{count}</span>
            </div>
        );
    });

    const isEmpty = myEntries.length === 0 && (!showTeam || teamEntries.length === 0);

    return (
        <DockablePopupWrapper
            {...wrapperProps}
            popupType="zabici"
            title="Zabici"
            minWidth={200}
            minHeight={150}
            initialWidth={325}
            initialHeight={375}
            className="zabici-popup"
            bodyClassName="popup-body zabici-popup__body"
            headerActions={headerActions}
        >
            <div className="kill-stats">
                <div className="kill-stats__item">
                    <span className="kill-stats__value">{totals.my}</span>
                    <span className="kill-stats__label">Ja</span>
                </div>
                {showTeam ? (
                    <>
                        <div className="kill-stats__item">
                            <span className="kill-stats__value">{totals.team}</span>
                            <span className="kill-stats__label">Drużyna</span>
                        </div>
                        <div className="kill-stats__item">
                            <span className="kill-stats__value">{totals.my + totals.team}</span>
                            <span className="kill-stats__label">Razem</span>
                        </div>
                    </>
                ) : (
                    <div className="kill-stats__item">
                        <span className="kill-stats__value">{myEntries.length}</span>
                        <span className="kill-stats__label">Różnych</span>
                    </div>
                )}
            </div>

            <div className="zabici-popup__content" ref={containerRef}>
                {isEmpty ? (
                    <div className="popup-empty">
                        Brak zabitych w tej sesji.
                    </div>
                ) : (
                    <>
                        <div className="kill-list__head">
                            <span>Przeciwnik</span>
                            <span>Ilość</span>
                        </div>
                        {myEntries.length > 0 && (
                            <>
                                <div className="kill-list__group">
                                    <span>Ja</span>
                                    <span className="kill-list__group-count">{totals.my}</span>
                                </div>
                                {renderRows(ME, myEntries)}
                            </>
                        )}
                        {showTeam && teamEntries.map(([player, mobs]) => (
                            <React.Fragment key={player}>
                                <div className="kill-list__group kill-list__group--team">
                                    <span>{player}</span>
                                    <span className="kill-list__group-count">{sum(mobs)}</span>
                                </div>
                                {renderRows(player, sortedKills(mobs))}
                            </React.Fragment>
                        ))}
                    </>
                )}
            </div>

            <div className="kill-list__footer">
                <span className="kill-list__footer-note">Sesja</span>
                <span>
                    {showTeam
                        ? <>Drużyna razem <b>{totals.my + totals.team}</b></>
                        : <>Łącznie <b>{totals.my}</b></>}
                </span>
            </div>
        </DockablePopupWrapper>
    );
};

export default ZabiciPopup;
