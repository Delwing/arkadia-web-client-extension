import type { ReactNode } from 'react';
import { Check, Lightbulb, MapPin, Navigation } from 'lucide-react';
import eventBus from '@modules/core/eventBus';
import { MAX_LEVEL, entryHint, isUnavailable, type DetailsEntry, type PlaceStatus } from './knowledgeModel';

/** Ten segments, `value` of them lit. */
export function LevelBar({ value, max = MAX_LEVEL, size = 'sm' }: { value: number; max?: number; size?: 'sm' | 'lg' }) {
    const lit = Math.max(0, Math.round((Math.min(value, max) / max) * 10));
    return (
        <span className={`kn-bar kn-bar--${size}`} data-value={lit}>
            {Array.from({ length: 10 }, (_, i) => (
                <span key={i} className={i < lit ? 'is-on' : undefined} />
            ))}
        </span>
    );
}

export function Segmented<T extends string>({
    value,
    options,
    onChange,
    className,
}: {
    value: T;
    options: { key: T; label: ReactNode; disabled?: boolean }[];
    onChange: (key: T) => void;
    className?: string;
}) {
    return (
        <span className={`kn-seg${className ? ` ${className}` : ''}`}>
            {options.map((option) => (
                <button
                    key={option.key}
                    type="button"
                    className={option.key === value ? 'is-on' : undefined}
                    data-key={option.key}
                    disabled={option.disabled}
                    onClick={() => onChange(option.key)}
                >
                    {option.label}
                </button>
            ))}
        </span>
    );
}

export function Switch({ id, checked, onChange, children }: { id: string; checked: boolean; onChange: (next: boolean) => void; children: ReactNode }) {
    return (
        <label className="kn-switch" htmlFor={id}>
            <input id={id} type="checkbox" role="switch" checked={checked} onChange={(e) => onChange(e.target.checked)} />
            <span className="kn-switch__track" />
            {children}
        </label>
    );
}

const PLACE_LABELS: Record<PlaceStatus, { library: string; book: string; tone: string }> = {
    completed: { library: 'ukończone', book: 'przeczytana', tone: 'ok' },
    in_progress: { library: 'w trakcie', book: 'w trakcie', tone: 'warn' },
    not_started: { library: 'nowa', book: 'nieprzeczytana', tone: '' },
};

export function StatusChip({ status, kind }: { status: PlaceStatus; kind: 'library' | 'book' }) {
    const { tone } = PLACE_LABELS[status];
    return (
        <span className={`kn-chip${tone ? ` kn-chip--${tone}` : ''}`} data-status={status}>
            {status === 'completed' && <Check size={12} strokeWidth={2.4} />}
            {PLACE_LABELS[status][kind]}
        </span>
    );
}

/**
 * One knowledge entry: a dot for known / missing, its text, and with hints on
 * where to go, how far it is, Prowadź (while still missing) and a pin that
 * shows it on the map.
 */
export function EntryRow({
    entry,
    hints,
    distance,
    area,
    extra,
}: {
    entry: DetailsEntry;
    hints: boolean;
    distance: number | null;
    area?: string;
    extra?: ReactNode;
}) {
    const unavailable = isUnavailable(entry);
    const status = unavailable ? 'unavailable' : entry.status;
    const hint = hints ? entryHint(entry) : '';
    const id = entry.id ?? null;
    return (
        <li className={`kn-entry kn-entry--${status}`} data-status={status}>
            <span className="kn-entry__dot" />
            <span className="kn-entry__body">
                <span className="kn-entry__name">{entry.name}</span>
                {hints && (hint || unavailable || area) && (
                    <span className="kn-entry__hint">
                        <Lightbulb size={13} />
                        <span>
                            {hint}
                            {area && <span className="kn-muted"> · {area}</span>}
                            {unavailable && <span className="kn-muted"> · obecnie niedostępne</span>}
                        </span>
                    </span>
                )}
                {extra}
            </span>
            {hints && (
                <>
                    <span className="kn-entry__far">{distance != null && entry.status !== 'known' ? `${distance} lok.` : ''}</span>
                    {id != null && !unavailable && entry.status !== 'known' ? (
                        <button
                            type="button"
                            className="kn-icon-btn kn-entry__lead"
                            title="Prowadź"
                            onClick={() => eventBus.emit('leadTo', id)}
                        >
                            <Navigation size={14} />
                        </button>
                    ) : (
                        <span className="kn-icon-btn kn-icon-btn--empty" />
                    )}
                    {id != null && !unavailable ? (
                        <button
                            type="button"
                            className="kn-icon-btn kn-entry__map"
                            title="Pokaż na mapie"
                            onClick={() => eventBus.emit('staticmap.popup.open', { roomId: id })}
                        >
                            <MapPin size={14} />
                        </button>
                    ) : (
                        <span className="kn-icon-btn kn-icon-btn--empty" />
                    )}
                </>
            )}
        </li>
    );
}
