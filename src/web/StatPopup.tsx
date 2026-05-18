import React, { useCallback } from 'react';
import { DockablePopupWrapper } from './layout/components/DockablePopupWrapper';
import { usePopup } from './hooks/usePopup';
import { usePopupData } from './hooks/usePopupData';
import {
    getCombatStats,
    type CombatStatsSnapshot,
    type BodyPart,
} from '../client/scripts/combatStats';

const POPUP_ID = 'popup:stat';

const BODY_PARTS: BodyPart[] = ['glowa', 'ramiona', 'korpus', 'nogi'];
const BODY_LABELS: Record<BodyPart, string> = {
    glowa: 'glowa',
    ramiona: 'ramiona',
    korpus: 'korpus',
    nogi: 'nogi',
};

function pct(part: number, whole: number): string {
    if (whole <= 0) return '0%';
    return `${Math.round((part / whole) * 100)}%`;
}

interface PieSlice {
    label: string;
    value: number;
    color: string;
}

function describeArc(cx: number, cy: number, r: number, startAngle: number, endAngle: number): string {
    const start = polarToCartesian(cx, cy, r, endAngle);
    const end = polarToCartesian(cx, cy, r, startAngle);
    const largeArc = endAngle - startAngle <= 180 ? 0 : 1;
    return `M ${cx} ${cy} L ${start.x} ${start.y} A ${r} ${r} 0 ${largeArc} 0 ${end.x} ${end.y} Z`;
}

function polarToCartesian(cx: number, cy: number, r: number, angleDeg: number): { x: number; y: number } {
    const rad = ((angleDeg - 90) * Math.PI) / 180;
    return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
}

const OgolemPie: React.FC<{ slices: PieSlice[] }> = ({ slices }) => {
    const total = slices.reduce((sum, s) => sum + s.value, 0);
    const SIZE = 80;
    const R = 36;
    const CX = SIZE / 2;
    const CY = SIZE / 2;

    if (total <= 0) {
        return (
            <svg width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`} className="stat-popup__pie">
                <circle cx={CX} cy={CY} r={R} fill="none" stroke="var(--popup-border)" strokeWidth="1" />
            </svg>
        );
    }

    let cumulative = 0;
    const paths = slices
        .filter((s) => s.value > 0)
        .map((slice, idx) => {
            const startAngle = (cumulative / total) * 360;
            cumulative += slice.value;
            const endAngle = (cumulative / total) * 360;
            if (slice.value === total) {
                return (
                    <circle key={idx} cx={CX} cy={CY} r={R} fill={slice.color}>
                        <title>{`${slice.label}: ${slice.value} (${pct(slice.value, total)})`}</title>
                    </circle>
                );
            }
            return (
                <path key={idx} d={describeArc(CX, CY, R, startAngle, endAngle)} fill={slice.color}>
                    <title>{`${slice.label}: ${slice.value} (${pct(slice.value, total)})`}</title>
                </path>
            );
        });

    return (
        <svg width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`} className="stat-popup__pie">
            {paths}
        </svg>
    );
};

const PIE_COLORS = {
    otrzymane: '#e06464',
    wyparowane: '#6498e0',
    unikniete: '#64c878',
} as const;

const StatPopup: React.FC = () => {
    const { wrapperProps, isOpen } = usePopup(POPUP_ID, {
        openEvent: 'stat.popup.open',
    });

    const { data: s } = usePopupData<CombatStatsSnapshot>(isOpen, {
        getInitialData: useCallback(() => getCombatStats(), []),
        updateEvent: 'stat.updated',
        transformUpdate: useCallback(
            (snapshot: CombatStatsSnapshot) => snapshot,
            []
        ),
        clearEvent: 'stat.cleared',
    });

    return (
        <DockablePopupWrapper
            {...wrapperProps}
            popupType="stat"
            title="Statystyki"
            minWidth={320}
            minHeight={300}
            initialWidth={420}
            initialHeight={520}
            className="stat-popup"
            bodyClassName="stat-popup-body"
        >
            <div className="stat-popup__content">
                <div className="stat-popup__row stat-popup__row--total">
                    <span className="stat-popup__label">WSZYSTKIE ciosy</span>
                    <span className="stat-popup__value">{s.total}</span>
                </div>

                <div className="stat-popup__section">
                    <div className="stat-popup__heading">OGOLEM ciosy</div>
                    <div className="stat-popup__ogolem">
                        <div className="stat-popup__ogolem-lines">
                            <StatLine label="otrzymane" value={s.otrzymane.count} of={s.total} swatch={PIE_COLORS.otrzymane} />
                            <StatLine label="wyparowane" value={s.wyparowane.count} of={s.total} swatch={PIE_COLORS.wyparowane} />
                            <StatLine label="unikniete" value={s.unikniete} of={s.total} swatch={PIE_COLORS.unikniete} />
                        </div>
                        <OgolemPie
                            slices={[
                                { label: 'otrzymane', value: s.otrzymane.count, color: PIE_COLORS.otrzymane },
                                { label: 'wyparowane', value: s.wyparowane.count, color: PIE_COLORS.wyparowane },
                                { label: 'unikniete', value: s.unikniete, color: PIE_COLORS.unikniete },
                            ]}
                        />
                    </div>
                </div>

                <div className="stat-popup__section">
                    <div className="stat-popup__heading">OTRZYMANE ciosy na czesci ciala</div>
                    {BODY_PARTS.map((p) => (
                        <StatLine
                            key={p}
                            label={BODY_LABELS[p]}
                            value={s.otrzymane.parts[p]}
                            of={s.otrzymane.count}
                        />
                    ))}
                </div>

                <div className="stat-popup__section">
                    <div className="stat-popup__heading">WYPAROWANE ciosy przez</div>
                    <StatLine label="bron" value={s.wyparowane.bron} of={s.wyparowane.count} />
                    <StatLine
                        label="zbroje"
                        value={s.wyparowane.zbroje.count}
                        of={s.wyparowane.count}
                    />
                    <StatLine
                        label="tarcze"
                        value={s.wyparowane.tarcze}
                        of={s.wyparowane.count}
                    />
                </div>

                <div className="stat-popup__section">
                    <div className="stat-popup__heading">WYPAROWANE ciosy przez zbroje</div>
                    {BODY_PARTS.map((p) => (
                        <StatLine
                            key={p}
                            label={BODY_LABELS[p]}
                            value={s.wyparowane.zbroje.parts[p]}
                            of={s.wyparowane.zbroje.count}
                        />
                    ))}
                </div>

                <div className="stat-popup__section">
                    <div className="stat-popup__heading">
                        OTRZYMANE na czesci ciala / WYPAROWANE przez zbroje
                    </div>
                    {BODY_PARTS.map((p) => {
                        const recv = s.otrzymane.parts[p];
                        const parry = s.wyparowane.zbroje.parts[p];
                        return (
                            <div key={p} className="stat-popup__line">
                                <span className="stat-popup__label">{BODY_LABELS[p]}</span>
                                <span className="stat-popup__value">
                                    {recv} ({pct(recv, s.otrzymane.count)}) /{' '}
                                    {parry} ({pct(parry, s.wyparowane.zbroje.count)})
                                </span>
                            </div>
                        );
                    })}
                </div>
            </div>
        </DockablePopupWrapper>
    );
};

interface StatLineProps {
    label: string;
    value: number;
    of: number;
    swatch?: string;
}

const StatLine: React.FC<StatLineProps> = ({ label, value, of, swatch }) => (
    <div className="stat-popup__line">
        <span className="stat-popup__label">
            {swatch && <span className="stat-popup__swatch" style={{ backgroundColor: swatch }} />}
            {label}
        </span>
        <span className="stat-popup__value">
            {value} ({pct(value, of)})
        </span>
    </div>
);

export default StatPopup;
