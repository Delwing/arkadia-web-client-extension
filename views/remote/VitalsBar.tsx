/**
 * Char.State vitals, compact for a phone. HP and fatigue always show; the rest
 * only when away from their resting value, as on the PC's bar.
 */

type Level = 'ok' | 'warn' | 'bad';

interface Vital {
    key: string;
    label: string;
    max: number;
    /** Resting value; a vital at it is hidden. */
    rest?: number;
    /** High is bad (fatigue, encumbrance, intoxication...). */
    highIsBad?: boolean;
}

const VITALS: Vital[] = [
    { key: 'hp', label: 'HP', max: 6 },
    { key: 'fatigue', label: 'ZM', max: 9, highIsBad: true },
    { key: 'mana', label: 'Mana', max: 8, rest: 8 },
    { key: 'stuffed', label: 'Głód', max: 3, rest: 3 },
    { key: 'soaked', label: 'Prag.', max: 3, rest: 3 },
    { key: 'encumbrance', label: 'Obc.', max: 6, rest: 0, highIsBad: true },
    { key: 'form', label: 'Forma', max: 3, rest: 3 },
    { key: 'intox', label: 'Upoj.', max: 9, rest: 0, highIsBad: true },
    { key: 'headache', label: 'Kac', max: 6, rest: 0, highIsBad: true },
    { key: 'panic', label: 'Panika', max: 4, rest: 0, highIsBad: true },
];

function level(vital: Vital, value: number): Level {
    if (vital.key === 'hp') {
        const shown = value + 1;
        return shown <= 3 ? 'bad' : shown <= 5 ? 'warn' : 'ok';
    }
    let ratio = vital.max > 0 ? value / vital.max : 1;
    if (vital.highIsBad) ratio = 1 - ratio;
    return ratio > 0.66 ? 'ok' : ratio > 0.33 ? 'warn' : 'bad';
}

export function VitalsBar({ vitals, combat }: { vitals: Record<string, number>; combat: boolean }) {
    const hp = vitals.hp;
    const hpVital = VITALS[0];
    const others = VITALS.slice(1).filter(vital => {
        const value = vitals[vital.key];
        if (value === undefined) return false;
        return vital.rest === undefined || value !== vital.rest;
    });

    return (
        <div className="rc-vitals">
            {hp !== undefined && (
                <div className={`rc-hp rc-${level(hpVital, hp)}`}>
                    <span className="rc-hp-label">HP</span>
                    <span className="rc-hp-track">
                        {Array.from({ length: hpVital.max + 1 }, (_, i) => (
                            <span key={i} className={i <= hp ? 'rc-hp-pip on' : 'rc-hp-pip'}/>
                        ))}
                    </span>
                    <span className="rc-hp-value">{hp + 1}/{hpVital.max + 1}</span>
                </div>
            )}
            <div className="rc-chips">
                {combat && <span className="rc-chip rc-combat">Walka</span>}
                {others.map(vital => {
                    const value = vitals[vital.key];
                    return (
                        <span key={vital.key} className={`rc-chip rc-${level(vital, value)}`}>
                            {vital.label} {value}/{vital.max}
                        </span>
                    );
                })}
            </div>
        </div>
    );
}
