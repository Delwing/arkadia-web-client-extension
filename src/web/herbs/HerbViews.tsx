import { useMemo } from 'react';
import { ChevronDown, ChevronRight, Star } from 'lucide-react';
import eventBus from '@modules/core/eventBus';
import { getBindableUses, isHerbSmokable, type HerbsData } from '@modules/data/dataStores/herbsStore.ts';
import {
    HERB_EFFECT_GROUPS,
    SMOKE_GROUP_KEY,
    herbEffectEntries,
    herbEffectTokens,
    herbEffectTone,
    herbGroupKeys,
} from '@modules/data/herbEffects.ts';
import { HeaderButton } from '@web-ui/primitives';
import { usePopover } from '../layout/hooks/usePopover';
import { amountsFor, type HerbCopyFormat, type HerbFilter } from './herbInventory';

const send = (command: string) => eventBus.emit('sendCommand', { command });

export function EffectTokens({ effect }: { effect: string | undefined }) {
    const tokens = herbEffectTokens(effect);
    if (tokens.length === 0) {
        return <span className="herb-tok">—</span>;
    }
    return (
        <>
            {tokens.map((token, index) => (
                <span key={index} className={`herb-tok herb-tok--${herbEffectTone(token)}`}>{token}</span>
            ))}
        </>
    );
}

export function UseButtons({ action, herbId, count }: { action: string; herbId: string; count: number }) {
    return (
        <span className="herb-amounts">
            {amountsFor(count).map(amount => (
                <button
                    key={amount}
                    type="button"
                    className="herb-amount"
                    title={`${action} ${amount} — ${herbId}`}
                    onClick={() => send(`/zi ${action} ${herbId} ${amount}`)}
                >
                    {amount}
                </button>
            ))}
        </span>
    );
}

function SmokeButton({ herbId }: { herbId: string }) {
    return (
        <button
            type="button"
            className="herb-amount herb-amount--wide"
            title={`Nabij fajkę — ${herbId}`}
            onClick={() => send(`/ziola_fajka ${herbId}`)}
        >
            nabij
        </button>
    );
}

/** Search box plus one-at-a-time effect chips; shared by every mode. */
export function HerbFilterBar({
    filter,
    onChange,
    herbIds,
    herbsData,
}: {
    filter: HerbFilter;
    onChange: (next: HerbFilter) => void;
    herbIds: string[];
    herbsData: HerbsData | null;
}) {
    const counts = useMemo(() => {
        const result: Record<string, number> = {};
        herbIds.forEach(herbId => {
            herbGroupKeys(herbsData?.herb_id_to_use[herbId]).forEach(key => {
                result[key] = (result[key] ?? 0) + 1;
            });
        });
        return result;
    }, [herbIds, herbsData]);

    const chips = [
        ...HERB_EFFECT_GROUPS.filter(group => counts[group.key]),
        ...(counts[SMOKE_GROUP_KEY] ? [{ key: SMOKE_GROUP_KEY, label: 'Do palenia' }] : []),
    ];

    return (
        <div className="herb-filter">
            <input
                type="search"
                className="popup-input popup-input--control herb-filter__search"
                placeholder="Szukaj zioła lub efektu…"
                value={filter.query}
                onChange={event => onChange({ ...filter, query: event.target.value })}
            />
            {chips.map(chip => (
                <button
                    key={chip.key}
                    type="button"
                    className={`herb-filter__chip${filter.group === chip.key ? ' is-active' : ''}`}
                    onClick={() => onChange({ ...filter, group: filter.group === chip.key ? null : chip.key })}
                >
                    {chip.label}
                    <span className="herb-filter__count">{counts[chip.key]}</span>
                </button>
            ))}
        </div>
    );
}

type ListSort = { key: 'name' | 'count'; dir: 1 | -1 };

/** Compact totals: one row per herb, each use with its own amount buttons. */
export function HerbListView({
    herbIds,
    totals,
    herbsData,
    sort,
    onSort,
}: {
    herbIds: string[];
    totals: Record<string, number>;
    herbsData: HerbsData | null;
    sort: ListSort;
    onSort: (next: ListSort) => void;
}) {
    const sorted = useMemo(() => [...herbIds].sort((a, b) => sort.dir * (
        sort.key === 'count' ? (totals[a] - totals[b]) || a.localeCompare(b) : a.localeCompare(b)
    )), [herbIds, totals, sort]);
    const regular = sorted.filter(herbId => !isHerbSmokable(herbsData?.herb_id_to_use[herbId]));
    const smokable = sorted.filter(herbId => isHerbSmokable(herbsData?.herb_id_to_use[herbId]));

    const header = (key: ListSort['key'], label: string, className?: string) => (
        <th
            className={`herb-list__sortable${className ? ` ${className}` : ''}`}
            onClick={() => onSort({ key, dir: sort.key === key ? (sort.dir === 1 ? -1 : 1) : (key === 'count' ? -1 : 1) })}
        >
            {label}{sort.key === key ? (sort.dir === 1 ? ' ▲' : ' ▼') : ''}
        </th>
    );

    const row = (herbId: string) => {
        const uses = herbsData?.herb_id_to_use[herbId];
        const count = totals[herbId] ?? 0;
        return (
            <tr key={herbId}>
                <td className="herb-list__count">{count}</td>
                <td className="herb-list__name">{herbId}</td>
                <td>
                    {getBindableUses(uses).map((use, index) => (
                        <span key={index} className="herb-list__use">
                            <span className="herb-list__action">{use.action}</span>
                            <EffectTokens effect={use.effect} />
                            <UseButtons action={use.action} herbId={herbId} count={count} />
                        </span>
                    ))}
                    {isHerbSmokable(uses) && (
                        <span className="herb-list__use">
                            <span className="herb-list__action">fajka</span>
                            <SmokeButton herbId={herbId} />
                        </span>
                    )}
                </td>
            </tr>
        );
    };

    if (sorted.length === 0) {
        return <div className="herb-empty-filter">Nic nie pasuje do filtra.</div>;
    }

    return (
        <table className="popup-table herb-list">
            <thead>
                <tr>
                    {header('count', 'Ile', 'herb-list__count')}
                    {header('name', 'Zioło')}
                    <th>Użycia</th>
                </tr>
            </thead>
            <tbody>
                {regular.map(row)}
                {smokable.length > 0 && (
                    <tr className="herb-list__section">
                        <td colSpan={3}>Do palenia</td>
                    </tr>
                )}
                {smokable.map(row)}
            </tbody>
        </table>
    );
}

/** Held herbs grouped by what they do; groups collapse and can be pinned to the top. */
export function HerbEffectsView({
    herbIds,
    totals,
    herbsData,
    group,
    openGroups,
    onToggleGroup,
    pinnedGroups,
    onTogglePin,
}: {
    herbIds: string[];
    totals: Record<string, number>;
    herbsData: HerbsData | null;
    group: string | null;
    openGroups: string[];
    onToggleGroup: (key: string) => void;
    pinnedGroups: string[];
    onTogglePin: (key: string) => void;
}) {
    const visibleTotals = useMemo(() => {
        const result: Record<string, number> = {};
        herbIds.forEach(herbId => { result[herbId] = totals[herbId] ?? 0; });
        return result;
    }, [herbIds, totals]);

    const groups = useMemo(() => [...HERB_EFFECT_GROUPS]
        .filter(entry => group === null || group === entry.key)
        .map(entry => ({ ...entry, entries: herbEffectEntries(entry.key, herbsData, visibleTotals) }))
        .filter(entry => entry.entries.length > 0)
        .sort((a, b) => Number(pinnedGroups.includes(b.key)) - Number(pinnedGroups.includes(a.key))),
    [group, herbsData, visibleTotals, pinnedGroups]);

    const smokable = (group === null || group === SMOKE_GROUP_KEY)
        ? herbIds.filter(herbId => isHerbSmokable(herbsData?.herb_id_to_use[herbId])).sort()
        : [];

    if (groups.length === 0 && smokable.length === 0) {
        return <div className="herb-empty-filter">Nic nie pasuje do filtra.</div>;
    }

    const groupHeader = (key: string, label: string, tokens: string, summary: string, pinnable: boolean) => {
        const isOpen = openGroups.includes(key);
        const pinned = pinnedGroups.includes(key);
        return (
            <div className="herb-group__header" onClick={() => onToggleGroup(key)}>
                {isOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                <span className="herb-group__label">{label}</span>
                <span className="herb-group__tokens">{tokens}</span>
                <span className="herb-group__summary">{summary}</span>
                {pinnable && (
                    <button
                        type="button"
                        className={`herb-group__pin${pinned ? ' is-active' : ''}`}
                        title={pinned ? 'Odepnij' : 'Przypnij na górę'}
                        onClick={event => { event.stopPropagation(); onTogglePin(key); }}
                    >
                        <Star size={13} fill={pinned ? 'currentColor' : 'none'} />
                    </button>
                )}
            </div>
        );
    };

    return (
        <div className="herb-groups">
            {groups.map(entry => {
                const herbCount = new Set(entry.entries.map(item => item.herbId)).size;
                const pieces = [...new Set(entry.entries.map(item => item.herbId))]
                    .reduce((sum, herbId) => sum + (visibleTotals[herbId] ?? 0), 0);
                return (
                    <div key={entry.key} className={`herb-group${entry.danger ? ' herb-group--danger' : ''}`}>
                        {groupHeader(entry.key, entry.label, entry.tokens.filter(token => !token.endsWith('?')).join(' '), `${pieces} szt. · ${herbCount} ${herbCount === 1 ? 'zioło' : 'zioła'}`, true)}
                        {openGroups.includes(entry.key) && (
                            <div className="herb-group__body">
                                {entry.danger && <div className="herb-group__warning">Trujące — bez szybkiego użycia.</div>}
                                {entry.entries.map(item => (
                                    <div key={`${item.herbId}:${item.action}`} className="herb-group__row">
                                        <span className="herb-group__herb">
                                            {item.herbId} <span className="herb-group__count">×{item.count}</span>
                                        </span>
                                        <span className="herb-group__action">{item.action}</span>
                                        <span className="herb-group__effect"><EffectTokens effect={item.effect} /></span>
                                        <span className="herb-group__use">
                                            {!entry.danger && <UseButtons action={item.action} herbId={item.herbId} count={item.count} />}
                                        </span>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                );
            })}
            {smokable.length > 0 && (
                <div className="herb-group">
                    {groupHeader(SMOKE_GROUP_KEY, 'Do palenia', '', `${smokable.reduce((sum, herbId) => sum + (totals[herbId] ?? 0), 0)} szt.`, false)}
                    {openGroups.includes(SMOKE_GROUP_KEY) && (
                        <div className="herb-group__body">
                            {smokable.map(herbId => (
                                <div key={herbId} className="herb-group__row">
                                    <span className="herb-group__herb">
                                        {herbId} <span className="herb-group__count">×{totals[herbId]}</span>
                                    </span>
                                    <span className="herb-group__action">fajka</span>
                                    <span className="herb-group__effect" />
                                    <span className="herb-group__use"><SmokeButton herbId={herbId} /></span>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}

const COPY_FORMATS: { format: HerbCopyFormat; label: string }[] = [
    { format: 'list', label: 'Lista' },
    { format: 'effects', label: 'Lista z działaniem' },
    { format: 'bags', label: 'Po woreczkach' },
];

/**
 * Header split button: "Kopiuj" copies the plain list, the chevron offers the
 * other formats with a one-line preview of each.
 */
export function HerbCopyButton({
    preview,
    onCopy,
    copied,
    filterNote,
}: {
    preview: (format: HerbCopyFormat) => string;
    onCopy: (format: HerbCopyFormat) => void;
    copied: boolean;
    filterNote: string | null;
}) {
    const menu = usePopover({ width: 260 });
    return (
        <div className="popup-menu-anchor herb-copy" ref={menu.rootRef}>
            <HeaderButton onClick={() => onCopy('list')} title="Kopiuj zioła do schowka">
                {copied ? 'Skopiowano' : 'Kopiuj'}
            </HeaderButton>
            <HeaderButton
                ref={menu.anchorRef}
                active={menu.open}
                className="herb-copy__chevron"
                onClick={menu.toggle}
                title="Inne formaty"
            >
                <ChevronDown size={13} />
            </HeaderButton>
            {menu.style && (
                <div className="popup-popover popup-menu" style={menu.style}>
                    {COPY_FORMATS.map(({ format, label }) => {
                        const lines = preview(format).split('\n');
                        const hint = (format === 'list' ? lines[1] : lines[0]) ?? '';
                        return (
                            <button
                                key={format}
                                type="button"
                                className="popup-menu__item popup-menu__item--hinted"
                                onClick={() => { menu.close(); onCopy(format); }}
                            >
                                <span className="popup-menu__label">{label}</span>
                                <span className="popup-menu__hint herb-copy__hint">{hint.trim() || '—'}</span>
                            </button>
                        );
                    })}
                    {filterNote && <div className="herb-copy__note">{filterNote}</div>}
                </div>
            )}
        </div>
    );
}
