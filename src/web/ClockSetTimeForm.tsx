import React, { useEffect, useState } from 'react';
import eventBus from '@modules/core/eventBus';
import { Button, Input, Segmented, Select } from '@web-ui/primitives';
import { MONTHS, MONTHS_ORDER } from '@client/scripts/clock';

type Domain = 'Empire' | 'Ishtar';
type DateMode = 'month' | 'dayOfYear';

const DATE_MODES: { value: DateMode; label: string }[] = [
    { value: 'month', label: 'Miesiąc' },
    { value: 'dayOfYear', label: 'Dzień roku' },
];

function getDayOfYear(domain: Domain, month: string, dayOfMonth: number): number {
    let dayOfYear = 0;
    for (const m of MONTHS_ORDER[domain]) {
        if (m === month) {
            return dayOfYear + dayOfMonth;
        }
        dayOfYear += MONTHS[m].length;
    }
    return dayOfYear + dayOfMonth;
}

/** An integer in [min, max], or undefined for anything else (blank included). */
function parseIn(value: string, min: number, max: number): number | undefined {
    if (value.trim() === '') return undefined;
    const n = Number(value);
    return Number.isInteger(n) && n >= min && n <= max ? n : undefined;
}

/**
 * Sets the clock of one domain by hand: an hour, optionally minutes, and
 * optionally a date (a month and its day, or the day of the year). Only the
 * hour is required; the date is left alone when it is not given.
 */
const ClockSetTimeForm: React.FC<{ domain: Domain }> = ({ domain }) => {
    const [hour, setHour] = useState('');
    const [minute, setMinute] = useState('');
    const [dateMode, setDateMode] = useState<DateMode>('month');
    const [month, setMonth] = useState('');
    const [dayOfMonth, setDayOfMonth] = useState('');
    const [dayOfYear, setDayOfYear] = useState('');

    // Months and year length differ between the domains.
    useEffect(() => {
        setMonth('');
        setDayOfMonth('');
        setDayOfYear('');
    }, [domain]);

    const monthLength = month ? MONTHS[month]?.length ?? 1 : 1;
    const maxDay = domain === 'Empire' ? 400 : 360;

    const hourValue = parseIn(hour, 0, 23);
    const minuteValue = parseIn(minute, 0, 59);
    const dayValue = dateMode === 'month'
        ? (month ? parseIn(dayOfMonth, 1, monthLength) : undefined)
        : parseIn(dayOfYear, 1, maxDay);
    const minuteValid = minute === '' || minuteValue !== undefined;
    const dayValid = dateMode === 'month'
        ? !month || dayOfMonth === '' || dayValue !== undefined
        : dayOfYear === '' || dayValue !== undefined;
    const canSubmit = hourValue !== undefined && minuteValid && dayValid;

    const submit = () => {
        if (!canSubmit) return;
        const payload: { domain: Domain; hour: number; minutes?: number; dayOfYear?: number } = { domain, hour: hourValue };
        if (minuteValue !== undefined) payload.minutes = minuteValue;
        if (dayValue !== undefined) {
            payload.dayOfYear = dateMode === 'month' ? getDayOfYear(domain, month, dayValue) : dayValue;
        }
        eventBus.emit('clock.setTime', payload);
        setHour('');
        setMinute('');
        setMonth('');
        setDayOfMonth('');
        setDayOfYear('');
    };
    const onEnter = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter') submit();
    };

    return (
        <div className="wt-set">
            <span className="wt-set-label">Godzina</span>
            <div className="wt-set-controls">
                <Input
                    type="number"
                    className="wt-set-num"
                    min={0}
                    max={23}
                    value={hour}
                    onChange={(e) => setHour(e.target.value)}
                    onKeyDown={onEnter}
                    placeholder="0-23"
                />
                <span className="wt-set-colon">:</span>
                <Input
                    type="number"
                    className="wt-set-num"
                    min={0}
                    max={59}
                    value={minute}
                    onChange={(e) => setMinute(e.target.value)}
                    onKeyDown={onEnter}
                    placeholder="00"
                />
            </div>

            <span className="wt-set-label">Data</span>
            <div className="wt-set-controls">
                <Segmented value={dateMode} options={DATE_MODES} onChange={setDateMode} />
            </div>

            {dateMode === 'month' ? (
                <>
                    <span className="wt-set-label">Miesiąc</span>
                    <div className="wt-set-controls">
                        <Select
                            className="wt-set-month"
                            value={month}
                            onChange={(e) => {
                                setMonth(e.target.value);
                                setDayOfMonth('');
                            }}
                        >
                            <option value="">--</option>
                            {MONTHS_ORDER[domain].map((m) => (
                                <option key={m} value={m}>{m}</option>
                            ))}
                        </Select>
                    </div>
                    {month && (
                        <>
                            <span className="wt-set-label">Dzień</span>
                            <div className="wt-set-controls">
                                <Input
                                    type="number"
                                    className="wt-set-num"
                                    min={1}
                                    max={monthLength}
                                    value={dayOfMonth}
                                    onChange={(e) => setDayOfMonth(e.target.value)}
                                    onKeyDown={onEnter}
                                    placeholder={`1-${monthLength}`}
                                />
                            </div>
                        </>
                    )}
                </>
            ) : (
                <>
                    <span className="wt-set-label">Dzień roku</span>
                    <div className="wt-set-controls">
                        <Input
                            type="number"
                            className="wt-set-num"
                            min={1}
                            max={maxDay}
                            value={dayOfYear}
                            onChange={(e) => setDayOfYear(e.target.value)}
                            onKeyDown={onEnter}
                            placeholder={`1-${maxDay}`}
                        />
                    </div>
                </>
            )}

            <div className="wt-set-action">
                <Button variant="solid" onClick={submit} disabled={!canSubmit}>Ustaw</Button>
            </div>
        </div>
    );
};

export default ClockSetTimeForm;
