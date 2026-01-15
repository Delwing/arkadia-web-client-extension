import React, { useEffect, useRef, useCallback } from 'react';
import { DockablePopupWrapper } from './layout/components/DockablePopupWrapper';
import { usePopup } from './hooks/usePopup';
import { usePopupSetting } from './hooks/usePopupSetting';
import { usePopupData } from './hooks/usePopupData';
import { getKillData, KillData } from '../client/scripts/kill';

const POPUP_ID = 'popup:zabici';

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

    // Scroll to bottom when data changes
    useEffect(() => {
        if (containerRef.current) {
            containerRef.current.scrollTop = containerRef.current.scrollHeight;
        }
    }, [data]);

    const kills = data?.kills ?? {};
    const teamKills = data?.teamKills ?? {};
    const totals = data?.totals ?? { my: 0, team: 0 };

    // Get my kills sorted by name
    const myKillEntries = Object.entries(kills)
        .filter(([_, entry]) => entry.mySession > 0)
        .sort(([a], [b]) => a.localeCompare(b));

    // Get team member entries sorted by player name
    const teamMemberEntries = Object.entries(teamKills)
        .filter(([_, mobs]) => Object.values(mobs).reduce((s, c) => s + c, 0) > 0)
        .sort(([a], [b]) => a.localeCompare(b));

    // Toggle button in header
    const headerActions = (
        <button
            type="button"
            className={`zabici-popup__team-toggle${showTeam ? ' zabici-popup__team-toggle--active' : ''}`}
            onClick={() => setShowTeam(!showTeam)}
            title={showTeam ? 'Ukryj druzyne' : 'Pokaz druzyne'}
        >
            Druzyna
        </button>
    );

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
            bodyClassName="zabici-popup-body"
            headerActions={headerActions}
        >
            <div className="zabici-popup__content" ref={containerRef}>
                {myKillEntries.length === 0 && (!showTeam || teamMemberEntries.length === 0) ? (
                    <div className="zabici-popup__empty">
                        Brak zabitych.
                    </div>
                ) : (
                    <>
                        {/* My kills section */}
                        {myKillEntries.length > 0 && (
                            <div className="zabici-popup__section">
                                <div className="zabici-popup__section-header">JA</div>
                                {myKillEntries.map(([name, entry]) => (
                                    <div key={name} className="zabici-popup__kill-row">
                                        <span className="zabici-popup__mob-name">{name}</span>
                                        <span className="zabici-popup__kill-count">{entry.mySession}</span>
                                    </div>
                                ))}
                                <div className="zabici-popup__section-total">
                                    <span>Lacznie</span>
                                    <span>{totals.my}</span>
                                </div>
                            </div>
                        )}

                        {/* Team kills section */}
                        {showTeam && teamMemberEntries.map(([player, mobs]) => {
                            const mobEntries = Object.entries(mobs)
                                .filter(([_, count]) => count > 0)
                                .sort(([a], [b]) => a.localeCompare(b));
                            const playerTotal = Object.values(mobs).reduce((s, c) => s + c, 0);

                            return (
                                <div key={player} className="zabici-popup__section zabici-popup__section--team">
                                    <div className="zabici-popup__section-header zabici-popup__section-header--team">{player}</div>
                                    {mobEntries.map(([mobName, count]) => (
                                        <div key={mobName} className="zabici-popup__kill-row">
                                            <span className="zabici-popup__mob-name">{mobName}</span>
                                            <span className="zabici-popup__kill-count">{count}</span>
                                        </div>
                                    ))}
                                    <div className="zabici-popup__section-total">
                                        <span>Lacznie</span>
                                        <span>{playerTotal}</span>
                                    </div>
                                </div>
                            );
                        })}

                        {/* Grand total */}
                        <div className="zabici-popup__grand-total">
                            <span>Druzyna lacznie</span>
                            <span>{totals.my + totals.team}</span>
                        </div>
                    </>
                )}
            </div>
        </DockablePopupWrapper>
    );
};

export default ZabiciPopup;
