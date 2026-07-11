import { useState, type CSSProperties } from 'react';
import { getColorLevel } from '@web/colors';
import { globalStorage } from '@modules/core/storage';
import { useClientEvent } from '../hooks/useClientEvent';

// Config mirrors the stock CharState DEFAULT_CONFIG; hue + icon are HUD styling.
interface VitalCfg {
    key: string;
    icon: string;
    hue: string;
    max: number;
    default?: number;
    flip?: boolean;
    transform?: (value: number, max: number) => { value: number; max: number };
}

const VITALS: VitalCfg[] = [
    { key: 'hp', icon: 'i-hp', hue: '--blood', max: 6, transform: (v, m) => ({ value: v + 1, max: m + 1 }) },
    { key: 'fatigue', icon: 'i-zm', hue: '--slate', max: 9, flip: true },
    { key: 'stuffed', icon: 'i-hun', hue: '--amber', max: 3, default: 3 },
    { key: 'encumbrance', icon: 'i-obc', hue: '--rust', max: 6, default: 0 },
    { key: 'soaked', icon: 'i-thi', hue: '--steel', max: 3, default: 3 },
    { key: 'mana', icon: 'i-mana', hue: '--mana', max: 8, default: 8 },
    { key: 'improve', icon: 'i-pos', hue: '--gold', max: 15, default: 0 },
    { key: 'form', icon: 'i-for', hue: '--moss', max: 3, default: 3 },
    { key: 'intox', icon: 'i-upi', hue: '--wine', max: 9, default: 0 },
    { key: 'headache', icon: 'i-kac', hue: '--ash', max: 6, default: 0 },
    { key: 'panic', icon: 'i-pan', hue: '--panic', max: 4, default: 0 },
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

    const alwaysVisible: string[] = globalStorage.get('uiSettings')?.alwaysVisibleBars ?? [];

    return (
        <div className="gems" id="alt-gems">
            {VITALS.map((cfg) => {
                const raw = vitalState[cfg.key];
                const defined = typeof raw === 'number';

                let visible = defined;
                if (cfg.key === 'form' && raw === 0 && (charOptions.form ?? 0) === 0) visible = false;
                if (defined && !alwaysVisible.includes(cfg.key) && cfg.default !== undefined && raw === cfg.default) {
                    visible = false;
                }
                if (!visible) return null;

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

                const className = ['forged', 'gem',
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
                        <span className="niche">
                            <svg viewBox="0 0 20 20"><use href={`#${cfg.icon}`} stroke="currentColor" /></svg>
                        </span>
                        <span className="stone" />
                        <span className="label"><span className="v">{value}/{max}</span></span>
                    </div>
                );
            })}
        </div>
    );
}
