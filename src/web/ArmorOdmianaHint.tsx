import React, { useEffect, useState } from 'react';
import eventBus from '@modules/core/eventBus';
import { getBehaviorSettings, onBehaviorSettingsChange } from '@modules/core/settings';
import { getZlomSnapshot, subscribeZlom } from '@modules/data/zlomStore';
import { ensureOdmianaLoaded, getOdmianaSnapshot, subscribeOdmiana } from '@modules/data/odmianaStore';
import { undeclinedPieces } from '@client/scripts/armor';

/**
 * For a player who shares with the crowd list: the worn pieces whose
 * declension is still missing, one click from `odmien`. The reply is read
 * passively (odmiana.ts), so a piece drops off the list once it arrives.
 */
const ArmorOdmianaHint: React.FC<{ slots: Record<string, string> }> = ({ slots }) => {
    const [contributing, setContributing] = useState(() => getBehaviorSettings().crowdContribute);
    const [zlom, setZlom] = useState(getZlomSnapshot);
    const [odmiany, setOdmiany] = useState(getOdmianaSnapshot);

    useEffect(() => onBehaviorSettingsChange(settings => setContributing(settings.crowdContribute)), []);
    useEffect(() => subscribeZlom(setZlom), []);
    useEffect(() => {
        void ensureOdmianaLoaded().then(() => setOdmiany(getOdmianaSnapshot()));
        return subscribeOdmiana(setOdmiany);
    }, []);

    if (!contributing) return null;
    const missing = undeclinedPieces(slots, zlom, odmiany);
    if (!missing.length) return null;

    return (
        <div className="armor-popup__odmiana">
            <div className="armor-popup__todo-hint">
                Brak odmiany. Kliknij, żeby sprawdzić ją komendą <code>odmien</code> i dodać do wspólnego spisu.
            </div>
            <div className="armor-popup__odmiana-list">
                {missing.map(name => (
                    <button
                        key={name}
                        type="button"
                        className="armor-popup__todo-piece"
                        onClick={() => eventBus.emit('sendCommand', { command: `odmien ${name}` })}
                    >
                        odmien {name}
                    </button>
                ))}
            </div>
        </div>
    );
};

export default ArmorOdmianaHint;
