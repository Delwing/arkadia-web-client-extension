import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown, ChevronRight, Link2, Unlink, PawPrint } from 'lucide-react';
import { DockablePopupWrapper } from './layout/components/DockablePopupWrapper';
import { usePopup } from './hooks/usePopup';
import { usePopupSetting } from './hooks/usePopupSetting';
import eventBus from '@modules/core/eventBus';
import { characterStorage } from '@modules/core/storage';
import { getTamingLevelInfo } from '../client/scripts/animalTaming';
import {
    type FeedingEntry,
    FEEDING_TIME_MS,
    getAnimals,
    getActiveFeedings,
    getFeedingsByAnimal,
    getLastFeedingAnimal,
    getLevelByAnimal,
    getFoodGroupMap,
    groupKeyFor,
    setAnimalActive,
    linkFoods,
    dissolveFoodGroup,
    foodWordDistance,
    exportDatabase,
    importDatabaseFromFile,
} from '../client/scripts/oswajanie';

const POPUP_ID = 'popup:oswajanie';

type View = 'animals' | 'history' | 'help';

function formatDateTime(ts: number): string {
    return new Date(ts).toLocaleString('pl-PL', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
    });
}

// ---------------------------------------------------------------------------
// Derived data shapes
// ---------------------------------------------------------------------------

interface GroupRow {
    key: string;
    foods: string[];
    repFood: string;
    entries: FeedingEntry[]; // latest-first
    levels: string[]; // aligned with entries
    canFeedNow: boolean;
    nextLabel: string;
}

interface AnimalsData {
    animals: { animal: string; active: boolean }[];
    selected: string;
    selectedActive: boolean;
    groups: GroupRow[];
    readyFoods: string[];
}

interface HistoryRow {
    num: number;
    animal: string;
    date: string;
    level: string;
    food: string;
}

async function loadAnimals(preferred: string): Promise<AnimalsData | null> {
    const animals = await getAnimals();
    if (animals.length === 0) return null;

    const selected =
        preferred && animals.some((a) => a.animal === preferred)
            ? preferred
            : (await getLastFeedingAnimal()) || animals.find((a) => a.active)?.animal || animals[0].animal;
    const selectedActive = animals.find((a) => a.animal === selected)?.active ?? true;

    const feedings = await getFeedingsByAnimal(selected);
    const groupMap = await getFoodGroupMap();
    const byKey = new Map<string, GroupRow>();
    for (const f of feedings) {
        const key = groupKeyFor(f.food, groupMap);
        let g = byKey.get(key);
        if (!g) {
            g = { key, foods: [], repFood: f.food, entries: [], levels: [], canFeedNow: false, nextLabel: '' };
            byKey.set(key, g);
        }
        if (!g.foods.includes(f.food)) g.foods.push(f.food);
        g.entries.push(f);
    }
    const groups = [...byKey.values()];
    for (const g of groups) {
        g.entries.sort((a, b) => b.timestamp - a.timestamp);
        g.repFood = g.entries[0].food;
        g.levels = await Promise.all(g.entries.map((e) => getLevelByAnimal(selected, e.timestamp)));
        const latest = g.entries[0];
        g.canFeedNow = Date.now() - latest.timestamp >= FEEDING_TIME_MS;
        g.nextLabel = g.canFeedNow ? 'odrazu' : formatDateTime(latest.timestamp + FEEDING_TIME_MS);
    }
    // Most recently fed group first.
    groups.sort((a, b) => b.entries[0].timestamp - a.entries[0].timestamp);

    const readyFoods = groups.filter((g) => g.canFeedNow).map((g) => g.repFood);

    return { animals, selected, selectedActive, groups, readyFoods };
}

async function loadHistory(): Promise<HistoryRow[]> {
    const feedings = await getActiveFeedings();
    const rows: HistoryRow[] = [];
    let num = feedings.length;
    for (const entry of feedings) {
        const level = await getLevelByAnimal(entry.animal, entry.timestamp);
        rows.push({
            num,
            animal: entry.animal,
            date: formatDateTime(entry.timestamp),
            level,
            food: entry.food,
        });
        num--;
    }
    return rows;
}

// ---------------------------------------------------------------------------
// Small presentational pieces
// ---------------------------------------------------------------------------

const LevelText: React.FC<{ level: string }> = ({ level }) => {
    const info = getTamingLevelInfo(level);
    if (!info) return <>{level}</>;
    return <span style={{ color: info.color }}>{`${level} [${info.value}/10]`}</span>;
};

interface LinkMenuState {
    rect: DOMRect;
    options: { label: string; onPick: () => void }[];
}

const LinkMenu: React.FC<{ state: LinkMenuState; onClose: () => void }> = ({ state, onClose }) => {
    const ref = useRef<HTMLDivElement>(null);
    const [pos, setPos] = useState<{ left: number; top: number } | null>(null);

    useEffect(() => {
        const el = ref.current;
        if (!el) return;
        const r = el.getBoundingClientRect();
        const left = Math.max(8, Math.min(state.rect.left, window.innerWidth - r.width - 8));
        const top = Math.max(8, Math.min(state.rect.bottom + 4, window.innerHeight - r.height - 8));
        setPos({ left, top });
    }, [state]);

    useEffect(() => {
        const onDoc = (e: MouseEvent) => {
            if (ref.current && !ref.current.contains(e.target as Node)) onClose();
        };
        const onKey = (e: KeyboardEvent) => {
            if (e.key === 'Escape') onClose();
        };
        const id = window.setTimeout(() => {
            document.addEventListener('mousedown', onDoc, true);
            document.addEventListener('keydown', onKey, true);
        }, 0);
        return () => {
            window.clearTimeout(id);
            document.removeEventListener('mousedown', onDoc, true);
            document.removeEventListener('keydown', onKey, true);
        };
    }, [onClose]);

    return createPortal(
        <div
            ref={ref}
            className="oswajanie-linkmenu"
            data-popup-overlay
            style={{ left: pos?.left ?? state.rect.left, top: pos?.top ?? state.rect.bottom + 4, visibility: pos ? 'visible' : 'hidden' }}
        >
            <div className="oswajanie-linkmenu__title">Polacz z:</div>
            {state.options.map((opt, i) => (
                <button
                    key={i}
                    type="button"
                    className="oswajanie-linkmenu__item"
                    onClick={() => {
                        onClose();
                        opt.onPick();
                    }}
                >
                    {opt.label}
                </button>
            ))}
        </div>,
        document.body,
    );
};

const GroupRowView: React.FC<{
    group: GroupRow;
    allGroups: GroupRow[];
    onOpenLinkMenu: (rect: DOMRect, options: { label: string; onPick: () => void }[]) => void;
}> = ({ group, allGroups, onOpenLinkMenu }) => {
    const [expanded, setExpanded] = useState(false);
    const expandable = group.entries.length > 1;
    const multiFood = group.foods.length > 1;
    const shown = expanded ? group.entries.length : 1;

    const others = allGroups.filter((o) => o.key !== group.key);

    const openMenu = (e: React.MouseEvent<HTMLButtonElement>) => {
        const rect = e.currentTarget.getBoundingClientRect();
        const groupDistance = (other: GroupRow) =>
            Math.min(...group.foods.flatMap((fa) => other.foods.map((fb) => foodWordDistance(fa, fb))));
        const sorted = [...others].sort(
            (x, y) => groupDistance(x) - groupDistance(y) || x.repFood.localeCompare(y.repFood),
        );
        onOpenLinkMenu(
            rect,
            sorted.map((other) => ({
                label: other.foods.join(' / '),
                onPick: () => void linkFoods(group.repFood, other.repFood),
            })),
        );
    };

    return (
        <tr>
            <td
                className={`oswajanie-td--center oswajanie-count${expandable ? ' oswajanie-count--toggle' : ''}`}
                title={expandable ? 'Pokaz/ukryj poprzednie wpisy' : undefined}
                onClick={expandable ? () => setExpanded((v) => !v) : undefined}
            >
                {expandable && (expanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />)} {group.entries.length}
            </td>
            <td className="oswajanie-col-when">
                {group.entries.slice(0, shown).map((e, i) => (
                    <div key={e.id ?? i} className={i > 0 ? 'oswajanie-prev' : undefined}>
                        {formatDateTime(e.timestamp)}
                    </div>
                ))}
            </td>
            <td className={`oswajanie-col-next${group.canFeedNow ? ' oswajanie-ready' : ''}`}>{group.nextLabel}</td>
            <td className="oswajanie-col-level">
                {group.entries.slice(0, shown).map((e, i) => (
                    <div key={e.id ?? i} className={i > 0 ? 'oswajanie-prev' : undefined}>
                        <LevelText level={group.levels[i]} />
                    </div>
                ))}
            </td>
            <td className="oswajanie-col-food">
                <div className="oswajanie-foodrow">
                    <span>
                        {group.foods.map((food, idx) => (
                            <React.Fragment key={food}>
                                {idx > 0 && ' / '}
                                <a
                                    title={`oswajaj zwierze ${food}`}
                                    onClick={(ev) => {
                                        ev.preventDefault();
                                        void eventBus.emit('sendCommand', { command: `oswajaj zwierze ${food}` });
                                    }}
                                >
                                    {food}
                                </a>
                            </React.Fragment>
                        ))}
                    </span>
                    {others.length > 0 && (
                        <button
                            type="button"
                            className="oswajanie-iconbtn"
                            title="Polacz z innym pokarmem (wspolny licznik)"
                            onClick={openMenu}
                        >
                            <Link2 size={15} />
                        </button>
                    )}
                    {multiFood && (
                        <button
                            type="button"
                            className="oswajanie-iconbtn oswajanie-iconbtn--danger"
                            title="Rozdziel polaczone pokarmy"
                            onClick={() => void dissolveFoodGroup(group.repFood)}
                        >
                            <Unlink size={15} />
                        </button>
                    )}
                </div>
            </td>
        </tr>
    );
};

// ---------------------------------------------------------------------------
// Views
// ---------------------------------------------------------------------------

const AnimalsView: React.FC<{ data: AnimalsData | null; onSelect: (a: string) => void }> = ({ data, onSelect }) => {
    const [linkMenu, setLinkMenu] = useState<LinkMenuState | null>(null);

    if (!data) return <p className="oswajanie-empty">Brak zwierzat w bazie.</p>;

    const feed = (food: string) => void eventBus.emit('sendCommand', { command: `oswajaj zwierze ${food}` });

    return (
        <div>
            <div className="oswajanie-topbar">
                <select className="oswajanie-select" value={data.selected} onChange={(e) => onSelect(e.target.value)}>
                    {data.animals.map(({ animal, active }) => (
                        <option key={animal} value={animal}>
                            {animal}
                            {active ? '' : ' (nieaktywne)'}
                        </option>
                    ))}
                </select>
                <button
                    type="button"
                    className={data.selectedActive ? 'oswajanie-btn' : 'oswajanie-btn oswajanie-btn--success'}
                    onClick={() => void setAnimalActive(data.selected, !data.selectedActive)}
                >
                    {data.selectedActive ? 'Deaktywuj' : 'Aktywuj'}
                </button>
            </div>

            {data.readyFoods.length > 0 && (
                <div className="oswajanie-ready-block">
                    <span className="oswajanie-ready-block__label">Do nakarmienia teraz:</span>
                    {data.readyFoods.map((food, idx) => (
                        <React.Fragment key={food}>
                            {idx > 0 && ', '}
                            <a
                                title={`oswajaj zwierze ${food}`}
                                onClick={(e) => {
                                    e.preventDefault();
                                    feed(food);
                                }}
                            >
                                {food}
                            </a>
                        </React.Fragment>
                    ))}
                </div>
            )}

            <table className="oswajanie-table">
                <thead>
                    <tr>
                        <th>ile</th>
                        <th className="oswajanie-col-when">ostatnio</th>
                        <th className="oswajanie-col-next">nastepne</th>
                        <th className="oswajanie-col-level">poziom</th>
                        <th className="oswajanie-col-food">pokarm</th>
                    </tr>
                </thead>
                <tbody>
                    {data.groups.map((g) => (
                        <GroupRowView
                            key={g.key}
                            group={g}
                            allGroups={data.groups}
                            onOpenLinkMenu={(rect, options) => setLinkMenu({ rect, options })}
                        />
                    ))}
                </tbody>
            </table>

            {linkMenu && <LinkMenu state={linkMenu} onClose={() => setLinkMenu(null)} />}
        </div>
    );
};

const HistoryView: React.FC<{ rows: HistoryRow[] | null }> = ({ rows }) => {
    if (!rows || rows.length === 0) return <p className="oswajanie-empty">Brak aktywnych zwierzat w bazie.</p>;
    return (
        <div>
            <div className="oswajanie-popup__heading">Historia oswajania</div>
            <table className="oswajanie-table">
                <thead>
                    <tr>
                        <th>nr</th>
                        <th>zwierze</th>
                        <th>data</th>
                        <th className="oswajanie-col-level">poziom</th>
                        <th>pokarm</th>
                    </tr>
                </thead>
                <tbody>
                    {rows.map((r) => (
                        <tr key={`${r.num}-${r.animal}-${r.date}`}>
                            <td className="oswajanie-td--center">{r.num}</td>
                            <td>{r.animal}</td>
                            <td>{r.date}</td>
                            <td className="oswajanie-col-level">
                                <LevelText level={r.level} />
                            </td>
                            <td>{r.food}</td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
};

const HelpView: React.FC = () => {
    const send = (command: string) => void eventBus.emit('sendCommand', { command });
    const Alias: React.FC<{ cmd: string }> = ({ cmd }) => (
        <a
            onClick={(e) => {
                e.preventDefault();
                send(cmd);
            }}
        >
            {cmd}
        </a>
    );

    return (
        <div>
            <p className="oswajanie-popup__intro">
                Baza oswajania buduje sie po pierwszym oswajaniu zwierzecia.
                <br />
                Po oswojeniu nalezy <Alias cmd="ocen zwierze" /> aby zapisal sie poziom oswojenia.
                <br />
                W widoku zwierzecia kliknij liczbe w kolumnie "ile" aby rozwinac poprzednie wpisy. Rozne nazwy tego samego
                pokarmu mozesz polaczyc ikona <Link2 size={13} style={{ verticalAlign: 'middle' }} /> (wspolny licznik).
            </p>

            <div className="oswajanie-popup__subheading">Dostepne aliasy:</div>
            <ul className="oswajanie-popup__list">
                <li>
                    <Alias cmd="/o_pomoc" /> - pokazuje ta pomoc
                </li>
                <li>
                    <Alias cmd="/o_pokaz" /> - lista oswajanych zwierzat
                </li>
                <li>
                    <span className="oswajanie-muted">/o_pokaz &lt;zwierze&gt;</span> - historia karmienia zwierzecia
                </li>
                <li>
                    <Alias cmd="/o_ostatnio" /> - historia ostatnio oswajanego
                </li>
                <li>
                    <Alias cmd="/o_historia" /> - historia aktywnych zwierzat
                </li>
            </ul>

            <div className="oswajanie-popup__subheading">Zarzadzanie baza:</div>
            <ul className="oswajanie-popup__list">
                <li>
                    <span className="oswajanie-muted">/o_wylacz &lt;zwierze&gt;</span> - deaktywuje zwierze
                </li>
                <li>
                    <span className="oswajanie-muted">/o_wlacz &lt;zwierze&gt;</span> - aktywuje zwierze
                </li>
                <li>
                    <span className="oswajanie-muted">/o_przemianuj &lt;stare&gt; na &lt;nowe&gt;</span> - zmienia nazwe
                </li>
            </ul>

            <div className="oswajanie-popup__subheading">Kopia zapasowa:</div>
            <div className="oswajanie-controls">
                <button type="button" className="oswajanie-btn oswajanie-btn--success" onClick={() => void exportDatabase()}>
                    Eksportuj baze (JSON)
                </button>
                <button
                    type="button"
                    className="oswajanie-btn oswajanie-btn--danger"
                    onClick={() => {
                        if (window.confirm('Import z pliku nadpisze baze oswajania tej postaci. Kontynuowac?')) {
                            void importDatabaseFromFile();
                        }
                    }}
                >
                    Importuj baze (nadpisze)
                </button>
            </div>
            <div className="oswajanie-popup__hint">
                Import z pliku NADPISZE baze tej postaci. Najpierw zrob eksport jako kopie zapasowa.
            </div>
        </div>
    );
};

// ---------------------------------------------------------------------------
// Popup
// ---------------------------------------------------------------------------

const TABS: { view: View; label: string }[] = [
    { view: 'animals', label: 'Zwierzeta' },
    { view: 'history', label: 'Historia' },
    { view: 'help', label: 'Pomoc' },
];

const OswajaniePopup: React.FC = () => {
    const [view, setView] = usePopupSetting<View>(POPUP_ID, 'view', 'animals');
    const [selectedAnimal, setSelectedAnimal] = useState('');
    const [refreshTick, setRefreshTick] = useState(0);

    const { wrapperProps, isOpen } = usePopup(POPUP_ID, {
        openEvent: 'oswajanie.popup.open',
        onOpen: useCallback(
            (data: { view?: View; animal?: string }) => {
                if (data?.view) setView(data.view);
                if (data?.animal) setSelectedAnimal(data.animal);
            },
            [setView],
        ),
    });

    const refresh = useCallback(() => setRefreshTick((t) => t + 1), []);

    useEffect(() => {
        const offUpdated = eventBus.on('oswajanie.updated', refresh);
        const offChar = characterStorage.onCharacterChange(() => {
            setSelectedAnimal('');
            refresh();
        });
        return () => {
            offUpdated();
            offChar();
        };
    }, [refresh]);

    const [animalsData, setAnimalsData] = useState<AnimalsData | null>(null);
    const [historyRows, setHistoryRows] = useState<HistoryRow[] | null>(null);

    useEffect(() => {
        if (!isOpen || view !== 'animals') return;
        let cancelled = false;
        void loadAnimals(selectedAnimal).then((d) => {
            if (cancelled) return;
            setAnimalsData(d);
            if (d && d.selected !== selectedAnimal) setSelectedAnimal(d.selected);
        });
        return () => {
            cancelled = true;
        };
    }, [isOpen, view, selectedAnimal, refreshTick]);

    useEffect(() => {
        if (!isOpen || view !== 'history') return;
        let cancelled = false;
        void loadHistory().then((r) => {
            if (!cancelled) setHistoryRows(r);
        });
        return () => {
            cancelled = true;
        };
    }, [isOpen, view, refreshTick]);

    return (
        <DockablePopupWrapper
            {...wrapperProps}
            popupType="oswajanie"
            title="Oswajanie"
            minWidth={360}
            minHeight={320}
            initialWidth={950}
            initialHeight={500}
            bodyClassName="oswajanie-popup"
        >
            <nav className="oswajanie-nav">
                {TABS.map((t) => (
                    <button
                        key={t.view}
                        type="button"
                        className={view === t.view ? 'oswajanie-tab is-active' : 'oswajanie-tab'}
                        onClick={() => setView(t.view)}
                    >
                        {t.view === 'help' && <PawPrint size={13} style={{ verticalAlign: 'middle', marginRight: 4 }} />}
                        {t.label}
                    </button>
                ))}
            </nav>

            {view === 'animals' && <AnimalsView data={animalsData} onSelect={setSelectedAnimal} />}
            {view === 'history' && <HistoryView rows={historyRows} />}
            {view === 'help' && <HelpView />}
        </DockablePopupWrapper>
    );
};

export default OswajaniePopup;
