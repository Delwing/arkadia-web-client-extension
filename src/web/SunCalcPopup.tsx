import React, { useEffect, useMemo, useRef, useState } from 'react';
import { DockablePopupWrapper } from './layout/components/DockablePopupWrapper';
import { usePopup } from './hooks/usePopup';
import eventBus from '@modules/core/eventBus';
import {
    type ClockAnchor,
    type Domain,
    type GeheimnisnachtForecast,
    type NightCandidate,
    dayLengthHours,
    formatDay,
    geheimnisnachtForecast,
    nextSunEvents,
    nightLengthHours,
    sunHour,
} from '@client/scripts/sunModel.ts';

const POPUP_ID = 'popup:sunCalc';

function pad(n: number): string {
    return String(n).padStart(2, '0');
}

function formatRealClock(ms: number): string {
    const d = new Date(ms);
    const now = new Date();
    const time = `${pad(d.getHours())}:${pad(d.getMinutes())}`;
    const sameDay = d.getDate() === now.getDate()
        && d.getMonth() === now.getMonth()
        && d.getFullYear() === now.getFullYear();
    if (sameDay) return time;
    return `${pad(d.getDate())}.${pad(d.getMonth() + 1)} ${time}`;
}

function formatCountdown(ms: number): string {
    const total = Math.max(0, Math.round(ms / 1000));
    const days = Math.floor(total / 86400);
    const hours = Math.floor((total % 86400) / 3600);
    const minutes = Math.floor((total % 3600) / 60);
    const seconds = total % 60;
    if (days > 0) return `${days}d ${hours}h`;
    if (hours > 0) return `${hours}h ${pad(minutes)}min`;
    if (minutes > 0) return `${minutes}min ${pad(seconds)}s`;
    return `${seconds}s`;
}

function formatOffset(minutes: number): string {
    const sign = minutes > 0 ? '+' : minutes < 0 ? '-' : '';
    return `${sign}${Math.abs(minutes)} min`;
}

const labelStyle: React.CSSProperties = { color: 'var(--popup-text-subtle)' };
const sectionStyle: React.CSSProperties = {
    marginBottom: 10,
    paddingBottom: 8,
    borderBottom: '1px solid var(--popup-border-control)',
};
const headingStyle: React.CSSProperties = {
    color: 'var(--popup-text-subtle)',
    textTransform: 'uppercase',
    fontSize: 10,
    letterSpacing: 1,
    marginBottom: 4,
};

const Row: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, lineHeight: '18px' }}>
        <span style={labelStyle}>{label}</span>
        <span style={{ textAlign: 'right' }}>{children}</span>
    </div>
);

const SunCalcPopup: React.FC = () => {
    const { wrapperProps } = usePopup(POPUP_ID, { openEvent: 'sunCalc.popup.open' });
    const [activeTab, setActiveTab] = useState<Domain>('Empire');
    const [anchors, setAnchors] = useState<Partial<Record<Domain, ClockAnchor>>>({});
    const [, setTick] = useState(0);
    const lastDomainRef = useRef<Domain | null>(null);

    // The clock emits every 500ms for both domains; pairing it with Date.now()
    // gives an exact in-game <-> real time anchor.
    useEffect(() => {
        return eventBus.on('clock.update', (data) => {
            if (!wrapperProps.isOpen) return;
            const domain = data.domain as Domain;
            setAnchors(prev => ({
                ...prev,
                [domain]: {
                    domain,
                    dayOfYear: data.dayOfYear,
                    hours: data.hours,
                    minutes: data.minutes,
                    realMs: Date.now(),
                },
            }));
        });
    }, [wrapperProps.isOpen]);

    useEffect(() => {
        const handler = (data: { domain: Domain }) => { lastDomainRef.current = data.domain; };
        eventBus.on('clock.domain.active', handler);
        return () => { eventBus.off('clock.domain.active', handler); };
    }, []);

    useEffect(() => {
        if (wrapperProps.isOpen && lastDomainRef.current) {
            setActiveTab(lastDomainRef.current);
        }
    }, [wrapperProps.isOpen]);

    // Keep countdowns moving even between clock updates.
    useEffect(() => {
        if (!wrapperProps.isOpen) return;
        const id = window.setInterval(() => setTick(t => t + 1), 1000);
        return () => window.clearInterval(id);
    }, [wrapperProps.isOpen]);

    const anchor = anchors[activeTab];

    // The anchor is a fresh object on every 500ms clock tick, so depending on it
    // would rebuild the forecast twice a second. The in-game time it carries only
    // moves once per in-game minute (two real seconds), which is what we key on.
    const empireAnchor = anchors.Empire;
    const forecast = useMemo(
        () => (empireAnchor ? geheimnisnachtForecast(empireAnchor) : null),
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [empireAnchor?.dayOfYear, empireAnchor?.hours, empireAnchor?.minutes],
    );

    const body = () => {
        if (!anchor) {
            return (
                <div style={{ ...labelStyle, padding: 4 }}>
                    Czekam na odczyt zegara. Wpisz <strong>czas</strong> aby zsynchronizowac.
                </div>
            );
        }

        const { dayOfYear } = anchor;
        const sunrise = sunHour(activeTab, dayOfYear, 'sunrise');
        const sunset = sunHour(activeTab, dayOfYear, 'sunset');
        const nightHours = nightLengthHours(activeTab, dayOfYear);
        const upcoming = nextSunEvents(anchor);
        const now = Date.now();

        return (
            <>
                <div style={sectionStyle}>
                    <div style={headingStyle}>Teraz</div>
                    <Row label="Data IG">
                        {formatDay(activeTab, dayOfYear)} <span style={labelStyle}>(dzien {dayOfYear})</span>
                    </Row>
                    <Row label="Godzina IG">{pad(anchor.hours)}:{pad(anchor.minutes)}</Row>
                    <Row label="Czas RL">{formatRealClock(now)}</Row>
                </div>

                <div style={sectionStyle}>
                    <div style={headingStyle}>Dzis</div>
                    <Row label="Wschod">
                        {pad(sunrise)}:00 <span style={labelStyle}>IG</span>
                    </Row>
                    <Row label="Zachod">
                        {pad(sunset)}:00 <span style={labelStyle}>IG</span>
                    </Row>
                    <Row label="Dzien">
                        {dayLengthHours(activeTab, dayOfYear)} h IG
                        <span style={labelStyle}> = {dayLengthHours(activeTab, dayOfYear) * 2} min RL</span>
                    </Row>
                    <Row label="Noc">
                        {nightHours} h IG
                        <span style={labelStyle}> = {nightHours * 2} min RL</span>
                    </Row>
                </div>

                <div style={sectionStyle}>
                    <div style={headingStyle}>Nastepne</div>
                    {upcoming.map(event => (
                        <Row
                            key={event.type}
                            label={event.type === 'sunrise' ? 'Wschod' : 'Zachod'}
                        >
                            {formatRealClock(event.realMs)}
                            <span style={labelStyle}> za {formatCountdown(event.realMs - now)}</span>
                        </Row>
                    ))}
                </div>

                {activeTab === 'Empire' && forecast && (
                    <div>
                        <div style={headingStyle}>Geheimnisnacht</div>
                        <Pick label="Noc" night={forecast.night} />
                        <div style={{ ...labelStyle, marginTop: 2, fontSize: 11 }}>
                            Noc = najblizej 21:00, zawsze przed - nigdy po.
                            {forecast.yearOffset > 0 && ` W tym roku IG juz bylo - to rok +${forecast.yearOffset}.`}
                        </div>
                        <div style={{ marginTop: 6 }}>
                            <CandidateTable forecast={forecast} />
                        </div>
                        <div style={{ ...labelStyle, marginTop: 6, fontSize: 11 }}>
                            Pelnia co 25 dni IG, noc zaczyna sie o zachodzie. Kolejny dzien IG
                            przesuwa zachod o 48 min RL (46 na granicy bloku).
                        </div>
                    </div>
                )}
            </>
        );
    };

    return (
        <DockablePopupWrapper
            {...wrapperProps}
            popupType="sunCalc"
            title="Slonce - kalkulator"
            minWidth={320}
            minHeight={200}
            initialWidth={420}
        >
            <div style={{
                fontFamily: 'monospace',
                fontSize: 12,
                padding: 8,
                color: 'var(--popup-text)',
                display: 'flex',
                flexDirection: 'column',
                height: '100%',
                overflowY: 'auto',
            }}>
                <div style={{ display: 'flex', gap: 4, marginBottom: 10 }}>
                    <button
                        type="button"
                        className={`popup-tab ${activeTab === 'Empire' ? 'popup-tab--active' : ''}`}
                        onClick={() => setActiveTab('Empire')}
                    >
                        Imperium
                    </button>
                    <button
                        type="button"
                        className={`popup-tab ${activeTab === 'Ishtar' ? 'popup-tab--active' : ''}`}
                        onClick={() => setActiveTab('Ishtar')}
                    >
                        Ishtar
                    </button>
                </div>
                {body()}
            </div>
        </DockablePopupWrapper>
    );
};

const Pick: React.FC<{ label: string; night: NightCandidate | null }> = ({ label, night }) => {
    if (!night) {
        return <Row label={label}><span style={labelStyle}>brak trafienia w okno</span></Row>;
    }
    return (
        <Row label={label}>
            {formatDay('Empire', night.dayOfYear)}
            <span style={labelStyle}>
                {' '}{formatRealClock(night.startMs)}-{formatRealClock(night.endMs)}
                {' '}({night.igHours * 2} min)
            </span>
        </Row>
    );
};

const CandidateTable: React.FC<{ forecast: GeheimnisnachtForecast }> = ({ forecast }) => (
    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
        <thead>
            <tr style={labelStyle}>
                <th style={{ textAlign: 'left', fontWeight: 'normal' }}>Pelnia</th>
                <th style={{ textAlign: 'right', fontWeight: 'normal' }}>Zachod RL</th>
                <th style={{ textAlign: 'right', fontWeight: 'normal' }}>od 21:00</th>
                <th style={{ textAlign: 'right', fontWeight: 'normal' }}>Noc</th>
            </tr>
        </thead>
        <tbody>
            {forecast.cycles.map(cycle => {
                const fullMoon = cycle.nights.find(n => n.fromFullMoon === 0)!;
                // how far the chosen night sits from the full moon, e.g. "pelnia +1"
                const pick = cycle.night
                    ? `pelnia ${cycle.night.fromFullMoon >= 0 ? '+' : ''}${cycle.night.fromFullMoon}`
                    : '-';
                const isWinner = forecast.night?.cycle === cycle.cycle;
                return (
                    <tr
                        key={cycle.cycle}
                        style={{
                            color: isWinner ? 'var(--popup-text)' : 'var(--popup-text-subtle)',
                            fontWeight: isWinner ? 'bold' : 'normal',
                        }}
                    >
                        <td>{formatDay('Empire', cycle.fullMoonDay)}</td>
                        <td style={{ textAlign: 'right' }}>{formatRealClock(fullMoon.startMs)}</td>
                        <td style={{ textAlign: 'right' }}>{formatOffset(fullMoon.offsetMinutes)}</td>
                        <td style={{ textAlign: 'right' }}>{pick}</td>
                    </tr>
                );
            })}
        </tbody>
    </table>
);

export default SunCalcPopup;
