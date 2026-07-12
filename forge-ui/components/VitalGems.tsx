import { useState, type CSSProperties } from 'react';
import { getColorLevel } from '@web/colors';
import { useClientEvent } from '../hooks/useClientEvent';

// Config mirrors the stock CharState DEFAULT_CONFIG; hue + icon are HUD styling.
interface VitalCfg {
    key: string;
    name: string;
    icon: string;
    hue: string;
    max: number;
    default?: number;
    flip?: boolean;
    transform?: (value: number, max: number) => { value: number; max: number };
}

// Names match the stock UI's ASCII transliterations (BarOrderSettings DISPLAY_NAMES).
const VITALS: VitalCfg[] = [
    { key: 'hp', name: 'HP', icon: 'i-hp', hue: '--blood', max: 6, transform: (v, m) => ({ value: v + 1, max: m + 1 }) },
    { key: 'fatigue', name: 'Zmeczenie', icon: 'i-zm', hue: '--slate', max: 9, flip: true },
    { key: 'stuffed', name: 'Glod', icon: 'i-hun', hue: '--amber', max: 3, default: 3 },
    { key: 'encumbrance', name: 'Obciazenie', icon: 'i-obc', hue: '--rust', max: 6, default: 0 },
    { key: 'soaked', name: 'Pragnienie', icon: 'i-thi', hue: '--steel', max: 3, default: 3 },
    { key: 'mana', name: 'Mana', icon: 'i-mana', hue: '--mana', max: 8, default: 8 },
    { key: 'improve', name: 'Postep', icon: 'i-pos', hue: '--gold', max: 15, default: 0 },
    { key: 'form', name: 'Forma', icon: 'i-for', hue: '--moss', max: 3, default: 3 },
    { key: 'intox', name: 'Upojenie', icon: 'i-upi', hue: '--wine', max: 9, default: 0 },
    { key: 'headache', name: 'Kac', icon: 'i-kac', hue: '--ash', max: 6, default: 0 },
    { key: 'panic', name: 'Panika', icon: 'i-pan', hue: '--panic', max: 4, default: 0 },
];

export default function VitalGems() {
    const [vitalState, setVitalState] = useState<Record<string, number>>({});
    const [charOptions, setCharOptions] = useState<{ form?: number }>({});

    useClientEvent('gmcp.char.state', (state) => {
        setVitalState(prev => ({ ...prev, ...(state as Record<string, number>) }));
    });
    useClientEvent('gmcp.char.options', (options) => {
        setCharOptions(prev => ({ ...prev, ...(options as { form?: number }) }));
    });

    // "improve" (Postep) is lifted out of the gem row and shown as a thin,
    // full-width segmented bar above it — one tick per point, WoW exp-bar style.
    const improveCfg = VITALS.find((c) => c.key === 'improve')!;
    // TEMP: force the XP bar to a fixed value to preview it, ignoring GMCP.
    const improveValue = 7;

    return (
        <>
            <div className="gems" id="alt-gems">
                {VITALS.filter((cfg) => cfg.key !== 'improve').map((cfg) => {
                    const raw = vitalState[cfg.key];
                    const defined = typeof raw === 'number';

                    // All vitals show by default; hide only bars with no GMCP data yet,
                    // and "form" when the character has no fighting form at all (N/A).
                    if (!defined) return null;
                    if (cfg.key === 'form' && raw === 0 && (charOptions.form ?? 0) === 0) return null;

                    let value = raw;
                    let max = cfg.max;
                    if (cfg.transform) ({ value, max } = cfg.transform(value, max));
                    value = Math.max(0, Math.min(max, value));
                    const ratio = max === 0 ? 0 : value / max;
                    const reverse = cfg.default === 0 || cfg.flip === true;
                    const level = getColorLevel(value, max, reverse, cfg.key === 'hp');
                    // "highlight" = the bar hit the opposite extreme from its resting
                    // default (fully encumbered, starving, etc.) — this is what pulses.
                    const opposite = cfg.default !== undefined ? (cfg.default > 0 ? 0 : max) : null;
                    const highlight = opposite !== null && value === opposite;

                    const className = ['gem',
                        level === 'warning' && 'lvl-warn',
                        level === 'danger' && 'lvl-danger',
                        highlight && 'highlight',
                    ].filter(Boolean).join(' ');

                    const style = {
                        '--hue': `var(${cfg.hue})`,
                        '--fill': `${Math.round(ratio * 100)}%`,
                    } as CSSProperties;

                    return (
                        <div key={cfg.key} className={className} style={style}>
                            <span className="stone" />
                            <span className="label">
                                <span className="v">{value}/{max}</span>
                                <span className="line">
                                    <span className="niche">
                                        <svg viewBox="0 0 20 20"><use href={`#${cfg.icon}`} stroke="currentColor" /></svg>
                                    </span>
                                    <span className="name">{cfg.name}</span>
                                </span>
                            </span>
                        </div>
                    );
                })}
            </div>
            {improveValue !== null && (
                <div
                    className="improve-bar"
                    style={{ '--hue': `var(${improveCfg.hue})` } as CSSProperties}
                    title={`${improveCfg.name} ${improveValue}/${improveCfg.max}`}
                >
                    <span className="improve-label">
                        <svg viewBox="0 0 20 20"><use href={`#${improveCfg.icon}`} stroke="currentColor" /></svg>
                        Postepy
                    </span>
                    <span className="improve-track">
                        {Array.from({ length: improveCfg.max }, (_, i) => (
                            <span key={i} className={'improve-seg' + (i < improveValue ? ' on' : '')} />
                        ))}
                    </span>
                    <span className="improve-value">{improveValue}/{improveCfg.max}</span>
                </div>
            )}
        </>
    );
}
