import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
    Axe,
    Biohazard,
    Brain,
    CircleHelp,
    Droplets,
    Flame,
    FlaskConical,
    Hammer,
    HeartPulse,
    Mountain,
    Radiation,
    ShieldOff,
    Skull,
    Snowflake,
    Sparkles,
    Sword,
    TriangleAlert,
    Wind,
    Wine,
    Zap,
    type LucideIcon,
} from 'lucide-react';
import { DockablePopupWrapper } from './layout/components/DockablePopupWrapper';
import { usePopup } from './hooks/usePopup';
import { usePopupSetting } from './hooks/usePopupSetting';
import {
    DAMAGE_CATEGORIES,
    damageTypeOf,
    ensureEnemyResistancesLoaded,
    getEnemyResistanceSnapshot,
    subscribeEnemyResistances,
    removeEnemyResistanceGroup,
    clearEnemyResistanceStore,
    groupEnemyResistances,
    areaLabelOf,
    type EnemyResistanceEntry,
    type EnemyResistanceGroup,
    type ResistanceKind,
    type ResistanceTrait,
} from '@modules/data/enemyResistanceStore';

const POPUP_ID = 'popup:enemyResistances';
const CONFIRM_MS = 4000;
const UNKNOWN_AREA_HINT = 'Wpis bez obszaru - ocen przeciwnika ponownie, zeby przypisac go do obszaru.';

const DAMAGE_KEYS = DAMAGE_CATEGORIES.flatMap(c => c.types.map(t => t.key));

const DAMAGE_ICONS: Record<string, LucideIcon> = {
    'ciete': Axe,
    'klute': Sword,
    'obuchowe': Hammer,
    'bronie niemagiczne': ShieldOff,
    'ogien': Flame,
    'powietrze': Wind,
    'woda': Droplets,
    'ziemia': Mountain,
    'czysta magia': Sparkles,
    'magia umyslu': Brain,
    'magia zycia': HeartPulse,
    'magia smierci': Skull,
    'elektrycznosc': Zap,
    'kwas': FlaskConical,
    'spaczenie': Radiation,
    'trucizna': Biohazard,
    'alkohol': Wine,
    'zimno': Snowflake,
};

type View = 'table' | 'list';

interface Row {
    group: EnemyResistanceGroup;
    byType: Map<string, ResistanceTrait>;
    unknown: ResistanceTrait[];
}

function toRow(group: EnemyResistanceGroup): Row {
    const byType = new Map<string, ResistanceTrait>();
    const unknown: ResistanceTrait[] = [];
    for (const trait of group.traits) {
        const key = damageTypeOf(trait.target);
        if (key) byType.set(key, trait);
        else unknown.push(trait);
    }
    return { group, byType, unknown };
}

function traitPhrase(t: ResistanceTrait): string {
    return `${t.kind} na ${t.target}`;
}

/** Vulnerable first, then untested, then resistant - the order you pick targets in. */
function sortValue(t: ResistanceTrait | undefined): number {
    if (!t) return 1;
    return t.kind === 'wrazliwy' ? 0 : 2;
}

function entryTooltip(e: EnemyResistanceEntry): string {
    const where = [areaLabelOf(e), e.roomId != null ? `lokacja ${e.roomId}` : null]
        .filter(Boolean)
        .join(', ');
    return `${where} - ${new Date(e.updatedAt).toLocaleString()}`;
}

function rowTooltip(g: EnemyResistanceGroup): string {
    return [g.name, ...g.entries.map(entryTooltip)].join('\n');
}

const TraitChips: React.FC<{ row: Row; kind: ResistanceKind }> = ({ row, kind }) => (
    <>
        {DAMAGE_KEYS.map(key => {
            const trait = row.byType.get(key);
            if (trait?.kind !== kind) return null;
            const Icon = DAMAGE_ICONS[key];
            return (
                <span key={key} className={`enemy-res-chip enemy-res-chip--${kind}`} title={traitPhrase(trait)}>
                    <Icon size={13} />
                    {key}
                </span>
            );
        })}
        {row.unknown.filter(t => t.kind === kind).map(trait => (
            <span key={trait.target} className={`enemy-res-chip enemy-res-chip--${kind}`} title={traitPhrase(trait)}>
                <CircleHelp size={13} />
                {trait.target}
            </span>
        ))}
    </>
);

const EnemyResistancesPopup: React.FC = () => {
    const { wrapperProps } = usePopup<'enemyResistances.popup.open'>(POPUP_ID, {
        openEvent: 'enemyResistances.popup.open',
    });
    const [entries, setEntries] = useState<EnemyResistanceEntry[]>(() => getEnemyResistanceSnapshot().entries);
    const [view, setView] = usePopupSetting<View>(POPUP_ID, 'view', 'table');
    const [filter, setFilter] = useState('');
    const [sortKey, setSortKey] = useState<string | null>(null);
    const [confirmClear, setConfirmClear] = useState(false);
    const confirmTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

    useEffect(() => {
        let active = true;
        ensureEnemyResistancesLoaded().then(() => {
            if (active) setEntries(getEnemyResistanceSnapshot().entries);
        });
        const unsub = subscribeEnemyResistances(s => {
            if (active) setEntries(s.entries);
        });
        return () => {
            active = false;
            unsub();
            if (confirmTimer.current !== null) clearTimeout(confirmTimer.current);
        };
    }, []);

    const groups = useMemo(() => groupEnemyResistances(entries), [entries]);

    const rows = useMemo(() => {
        const phrase = filter.trim().toLowerCase();
        const filtered = groups
            .filter(g => !phrase || g.name.includes(phrase))
            .map(toRow);
        const activeSort = view === 'table' ? sortKey : null;
        if (!activeSort) return filtered;
        // groupEnemyResistances already sorted by name, so this stays a stable refinement.
        return filtered.sort((a, b) =>
            sortValue(a.byType.get(activeSort)) - sortValue(b.byType.get(activeSort)));
    }, [groups, filter, sortKey, view]);

    const hasUnknown = rows.some(r => r.unknown.length > 0);

    const handleClearAll = () => {
        if (!confirmClear) {
            setConfirmClear(true);
            confirmTimer.current = setTimeout(() => setConfirmClear(false), CONFIRM_MS);
            return;
        }
        if (confirmTimer.current !== null) clearTimeout(confirmTimer.current);
        setConfirmClear(false);
        void clearEnemyResistanceStore();
    };

    const headerActions = entries.length > 0 ? (
        <button
            type="button"
            className={`popup-btn popup-btn--sm${confirmClear ? ' popup-btn--danger' : ''}`}
            onClick={handleClearAll}
            title="Usun wszystkie wpisy"
        >
            {confirmClear ? 'Na pewno?' : 'Wyczysc'}
        </button>
    ) : undefined;

    const removeButton = (group: EnemyResistanceGroup) => (
        <button
            type="button"
            className="carriage-remove-btn"
            onClick={() => void removeEnemyResistanceGroup(group)}
            title="Usun wpis"
        >
            X
        </button>
    );

    const enemyName = (group: EnemyResistanceGroup) => (
        <>
            {group.name}
            {group.hasUnknownArea && (
                // A title on the <svg> itself is not a reliable tooltip - wrap it.
                <span className="enemy-res-warn" title={UNKNOWN_AREA_HINT}>
                    <TriangleAlert size={13} />
                </span>
            )}
            {group.areaLabel && <span className="enemy-res-area">{group.areaLabel}</span>}
        </>
    );

    const renderTable = () => (
        <table className="zlom-table enemy-res-table">
            <thead>
                <tr>
                    <th rowSpan={2} className="enemy-res-name-head">Przeciwnik</th>
                    {DAMAGE_CATEGORIES.map(c => (
                        <th key={c.label} colSpan={c.types.length} className="enemy-res-group">
                            {c.label}
                        </th>
                    ))}
                    {hasUnknown && <th rowSpan={2}>Nierozpoznane</th>}
                    <th rowSpan={2} />
                </tr>
                <tr>
                    {DAMAGE_KEYS.map(key => (
                        <th
                            key={key}
                            className={`enemy-res-type${sortKey === key ? ' enemy-res-type--sorted' : ''}`}
                            onClick={() => setSortKey(k => (k === key ? null : key))}
                            title={`Sortuj: najpierw wrazliwe na ${key}`}
                        >
                            <span>{key}</span>
                        </th>
                    ))}
                </tr>
            </thead>
            <tbody>
                {rows.map((row, i) => (
                    <tr key={row.group.key} className={i % 2 ? 'zlom-row zlom-row--alt' : 'zlom-row'}>
                        <td className="zlom-cell zlom-cell--short" title={rowTooltip(row.group)}>
                            {enemyName(row.group)}
                        </td>
                        {DAMAGE_KEYS.map(key => {
                            const trait = row.byType.get(key);
                            return (
                                <td
                                    key={key}
                                    className={`zlom-cell enemy-res-cell${trait ? ` enemy-res-cell--${trait.kind}` : ''}`}
                                    title={trait ? traitPhrase(trait) : undefined}
                                >
                                    {trait ? (trait.kind === 'odporny' ? 'O' : 'W') : ''}
                                </td>
                            );
                        })}
                        {hasUnknown && (
                            <td className="zlom-cell">
                                {row.unknown.map(traitPhrase).join('; ')}
                            </td>
                        )}
                        <td className="zlom-cell">{removeButton(row.group)}</td>
                    </tr>
                ))}
            </tbody>
        </table>
    );

    const renderList = () => (
        <div className="enemy-res-lines">
            {rows.map((row, i) => (
                <div key={row.group.key} className={i % 2 ? 'enemy-res-line zlom-row zlom-row--alt' : 'enemy-res-line zlom-row'}>
                    <span className="enemy-res-line__name" title={rowTooltip(row.group)}>
                        {enemyName(row.group)}
                    </span>
                    <span className="enemy-res-line__chips">
                        <TraitChips row={row} kind="wrazliwy" />
                        <TraitChips row={row} kind="odporny" />
                    </span>
                    {removeButton(row.group)}
                </div>
            ))}
        </div>
    );

    return (
        <DockablePopupWrapper
            {...wrapperProps}
            popupType="enemyResistances"
            title={`Odpornosci przeciwnikow (${groups.length})`}
            minWidth={320}
            minHeight={220}
            initialWidth={900}
            initialHeight={480}
            className="enemy-res-popup"
            bodyClassName="enemy-res-popup-body popup-body"
            headerActions={headerActions}
        >
            <div className="postepy2-header">
                <input
                    type="text"
                    className="zlom-filter enemy-res-filter"
                    placeholder="Filtruj po nazwie..."
                    value={filter}
                    onChange={e => setFilter(e.target.value)}
                />
                <span className="enemy-res-view">
                    <button
                        type="button"
                        className={`popup-btn popup-btn--sm${view === 'table' ? ' popup-btn--primary' : ''}`}
                        onClick={() => setView('table')}
                    >
                        Tabela
                    </button>
                    <button
                        type="button"
                        className={`popup-btn popup-btn--sm${view === 'list' ? ' popup-btn--primary' : ''}`}
                        onClick={() => setView('list')}
                    >
                        Lista
                    </button>
                </span>
                {view === 'table' && (
                    <span className="enemy-res-legend">
                        <span className="enemy-res-mark enemy-res-mark--wrazliwy">W</span> wrazliwy
                        <span className="enemy-res-mark enemy-res-mark--odporny">O</span> odporny
                    </span>
                )}
            </div>

            <div className="enemy-res-content">
                {rows.length === 0 ? (
                    <div className="popup-empty">
                        {entries.length === 0
                            ? "Brak zapisanych odpornosci. Uzyj 'ocen' na przeciwniku, zeby je zebrac."
                            : 'Brak wynikow dla filtra.'}
                    </div>
                ) : view === 'table' ? renderTable() : renderList()}
            </div>
        </DockablePopupWrapper>
    );
};

export default EnemyResistancesPopup;
