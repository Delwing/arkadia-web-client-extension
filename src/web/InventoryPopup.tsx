import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import {
    ArrowDownToLine, ArrowUpFromLine, Backpack, ChevronDown, ChevronRight, Circle, Coins, Diamond, Eye, Fish,
    Footprints, Gem, Hand, HardHat, Lamp, Leaf, Lock, LockOpen, RefreshCw, Scale, Search, Shield, Shirt, Sword, type LucideIcon,
} from 'lucide-react';
import { DockablePopupWrapper } from './layout/components/DockablePopupWrapper';
import { usePopup } from './hooks/usePopup';
import { usePopupData } from './hooks/usePopupData';
import { HeaderButton } from '@web-ui/primitives';
import { showContextMenu, type ContextMenuEntry } from '@web/contextMenu';
import eventBus from '@modules/core/eventBus';
import { getInventoryState, type InventoryEntry, type InventoryState } from '@client/scripts/inventory';
import { getTransformDefinitions, type ContainerItem } from '@client/scripts/prettyContainers';
import { AnsiAwareBuffer } from '@client/ansi/FormatState';
import { containerTypeLabel, itemCategory, splitName, type ItemCategory } from './inventoryView';
import {
    dropListRows, useInventoryDrag, type DragItem, type DragSource, type DropRow, type InventoryDrag, type Pending,
} from './inventoryDrag';

const POPUP_ID = 'popup:inventory';
const CARRIED = 'Przy sobie';
/** How long the game's refusal stays on show */
const REFUSAL_MS = 6000;

const CATEGORY_ICONS: Record<ItemCategory, LucideIcon> = {
    bag: Backpack,
    coins: Coins,
    light: Lamp,
    bronie: Sword,
    korpus: Shirt,
    tarcze: Shield,
    glowa: HardHat,
    rece: Hand,
    nogi: Footprints,
    ubrania: Shirt,
    bizuteria: Gem,
    kamienie: Diamond,
    ryby: Fish,
    other: Circle,
};

interface WindowState {
    bags: InventoryEntry[];
    drag: InventoryDrag;
}

const WindowContext = createContext<WindowState | null>(null);

function useWindow(): WindowState {
    return useContext(WindowContext)!;
}

// ── Context menus ────────────────────────────────────────────────────────────

/** Woreczki are the herb manager's: what is in them is shown and handled there */
function openHerbs() {
    eventBus.emit('herbManagerOpen', { mode: 'bags' });
}

/** Bags things can be put in: not woreczki, which hold herbs and are the herb manager's */
function putTargets(bags: InventoryEntry[], except: string): InventoryEntry[] {
    return bags.filter(bag => bag.key !== except && bag.noun !== 'woreczek');
}

function showEntryMenu(e: React.MouseEvent, entry: InventoryEntry, bags: InventoryEntry[]) {
    e.preventDefault();
    const items: ContextMenuEntry[] = [
        { label: 'Odłóż', icon: ArrowDownToLine, action: () => eventBus.emit('inventory.action', { kind: 'drop', key: entry.key }) },
        { label: 'Oceń', icon: Scale, action: () => eventBus.emit('inventory.action', { kind: 'evaluate', key: entry.key }) },
    ];
    if (entry.container) {
        items.push(
            entry.herbs !== undefined
                ? { label: 'Zioła', icon: Leaf, opensWindow: true, action: openHerbs }
                : { label: 'Zajrzyj', icon: Eye, action: () => eventBus.emit('inventory.inspect', { key: entry.key }) },
            entry.state === 'open'
                ? { label: 'Zamknij', icon: Lock, action: () => eventBus.emit('inventory.action', { kind: 'close', key: entry.key }) }
                : { label: 'Otwórz', icon: LockOpen, action: () => eventBus.emit('inventory.action', { kind: 'open', key: entry.key }) },
        );
    }
    putTargets(bags, entry.key).forEach(bag => items.push({
        label: bag.label,
        section: 'Włóż do',
        icon: Backpack,
        action: () => eventBus.emit('inventory.action', { kind: 'put', key: entry.key, bag: bag.key }),
    }));
    showContextMenu(items, e.clientX, e.clientY, { header: entry.label, smallHeader: true });
}

function showContentMenu(e: React.MouseEvent, item: ContainerItem, bag: InventoryEntry, index: number, bags: InventoryEntry[]) {
    e.preventDefault();
    const items: ContextMenuEntry[] = [
        { label: 'Wyjmij', icon: ArrowUpFromLine, action: () => eventBus.emit('inventory.action', { kind: 'take', bag: bag.key, item: index }) },
    ];
    putTargets(bags, bag.key).forEach(other => items.push({
        label: other.label,
        section: 'Przełóż do',
        icon: Backpack,
        action: () => eventBus.emit('inventory.action', { kind: 'move', from: bag.key, item: index, bag: other.key }),
    }));
    showContextMenu(items, e.clientX, e.clientY, { header: item.name, smallHeader: true });
}

// ── Rows ─────────────────────────────────────────────────────────────────────

/**
 * HTML of an item the pretty container tables colour (coins, magic items,
 * keys), or null for a plain one, which the window styles itself.
 */
function transformedHtml(item: ContainerItem, text: string): string | null {
    let buffer = new AnsiAwareBuffer(text);
    for (const tr of getTransformDefinitions()) {
        buffer = tr.transform(buffer, item, '');
    }
    const html = buffer.toHtml();
    return html === new AnsiAwareBuffer(text).toHtml() ? null : html;
}

function ItemName({ item, text }: { item: ContainerItem; text: string }) {
    const html = useMemo(() => transformedHtml(item, text), [item, text]);
    const parts = useMemo(() => splitName(text), [text]);
    if (html) {
        return <span className="inventory-popup__name inventory-popup__name--colored" dangerouslySetInnerHTML={{ __html: html }} />;
    }
    return (
        <span className="inventory-popup__name" title={text}>
            {parts.before && <span className="inventory-popup__desc">{parts.before} </span>}
            <span className="inventory-popup__noun">{parts.noun}</span>
            {parts.after && <span className="inventory-popup__desc"> {parts.after}</span>}
        </span>
    );
}

function CategoryIcon({ category }: { category: ItemCategory }) {
    const Icon = CATEGORY_ICONS[category] ?? Circle;
    return (
        <span className={`inventory-popup__icon inventory-popup__icon--${category}`}>
            <Icon size={category === 'other' ? 6 : 14} />
        </span>
    );
}

function Count({ count }: { count: string | number }) {
    if (count === 1) return null;
    return <span className="inventory-popup__pill">{count === 'wie' ? 'wiele' : `×${count}`}</span>;
}

/** An item as a plain row: what is dragged, and what waits where it was dropped */
function ItemVisual({ item, nested }: { item: DragItem; nested?: boolean }) {
    const category = useMemo(() => itemCategory(item.name, false), [item.name]);
    return (
        <div className={`inventory-popup__row${nested ? ' inventory-popup__row--nested' : ''}`}>
            <CategoryIcon category={category} />
            <ItemName item={item} text={item.label} />
            <Count count={item.count} />
        </div>
    );
}

function toDragItem(item: ContainerItem | InventoryEntry): DragItem {
    return { name: item.name, count: item.count, label: 'label' in item ? item.label : item.name };
}

/** The weapon in a sheath or sling, under it */
function HeldRow({ name }: { name: string }) {
    const category = useMemo(() => itemCategory(name, false), [name]);
    return (
        <div className="inventory-popup__row inventory-popup__row--nested">
            <CategoryIcon category={category} />
            <ItemName item={{ name, count: 1 }} text={name} />
        </div>
    );
}

function ItemRow({ entry, draggable }: { entry: InventoryEntry; draggable?: boolean }) {
    const { bags, drag } = useWindow();
    const category = useMemo(() => itemCategory(entry.name, false), [entry.name]);
    const held = entry.holder?.held ?? [];
    // "pochwa" is feminine, "temblak" masculine
    const empty = entry.name.includes('pochw') ? 'pusta' : 'pusty';
    return (
        <>
            <div
                className={`inventory-popup__row${draggable ? ' inventory-popup__row--draggable' : ''}`}
                onPointerDown={draggable ? e => drag.press(e, { type: 'entry', key: entry.key }, toDragItem(entry)) : undefined}
                onContextMenu={e => showEntryMenu(e, entry, bags)}
            >
                <CategoryIcon category={category} />
                <ItemName item={entry} text={entry.label} />
                <Count count={entry.count} />
                {entry.holder && held.length === 0 && (
                    <span className="inventory-popup__pill inventory-popup__pill--muted">{empty}</span>
                )}
            </div>
            {held.length > 0 && (
                <div className="inventory-popup__contents inventory-popup__contents--held">
                    {held.map((name, i) => <HeldRow key={i} name={name} />)}
                </div>
            )}
        </>
    );
}

function ContentRow({ item, index, bag, draggable }: { item: ContainerItem; index: number; bag: InventoryEntry; draggable?: boolean }) {
    const { bags, drag } = useWindow();
    const category = useMemo(() => itemCategory(item.name, false), [item.name]);
    return (
        <div
            className={`inventory-popup__row inventory-popup__row--nested${draggable ? ' inventory-popup__row--draggable' : ''}`}
            onPointerDown={draggable ? e => drag.press(e, { type: 'content', bag: bag.key, item: index }, toDragItem(item)) : undefined}
            onContextMenu={e => showContentMenu(e, item, bag, index, bags)}
        >
            <CategoryIcon category={category} />
            <ItemName item={item} text={item.name} />
            <Count count={item.count} />
        </div>
    );
}

/** A bag's number in the game, once `ocen` has told it ("1." for "1. swoj plecak") */
function GameNumber({ bag }: { bag: InventoryEntry }) {
    if (bag.ordinal === undefined) return null;
    return (
        <span className="inventory-popup__number" title={`W grze: ${bag.ordinal}. ${bag.noun} (sprawdzone przez ocen)`}>
            {bag.ordinal}.
        </span>
    );
}

/** A herb in a woreczek, as the herb manager counted it */
function HerbRow({ id, count }: { id: string; count: number }) {
    return (
        <div className="inventory-popup__row inventory-popup__row--nested">
            <span className="inventory-popup__icon inventory-popup__icon--herb"><Leaf size={13} /></span>
            <span className="inventory-popup__name"><span className="inventory-popup__noun">{id}</span></span>
            <Count count={count} />
        </div>
    );
}

/** A woreczek's herbs, or where to get them counted */
function HerbContents({ bag }: { bag: InventoryEntry }) {
    const herbs = bag.herbs;
    if (!herbs) {
        return (
            <div className="inventory-popup__status">
                Woreczki liczy menedżer ziół — <button type="button" className="popup-link" onClick={openHerbs}>otwórz Zioła</button>.
            </div>
        );
    }
    if (herbs.length === 0) return <div className="inventory-popup__status">Pusty.</div>;
    return <>{herbs.map(herb => <HerbRow key={herb.id} id={herb.id} count={herb.count} />)}</>;
}

/** Status lines of a bag's contents: not looked into yet, empty, may have changed */
function contentsStatus(bag: InventoryEntry): { before: React.ReactNode; after: React.ReactNode } {
    const { inspecting, contents } = bag.container!;
    return {
        before: (
            <>
                {inspecting && !contents && <div className="inventory-popup__status">Zaglądam…</div>}
                {!inspecting && !contents && <div className="inventory-popup__status">Jeszcze nie zaglądano — kliknij oko.</div>}
                {contents && contents.items.length === 0 && <div className="inventory-popup__status">Pusty.</div>}
            </>
        ),
        after: contents?.stale && (
            <div className="inventory-popup__status inventory-popup__status--warning">Mogło się zmienić od ostatniego zajrzenia.</div>
        ),
    };
}

function InspectButton({ bag, onBeforeInspect }: { bag: InventoryEntry; onBeforeInspect?: () => void }) {
    return (
        <button
            type="button"
            className="popup-btn popup-btn--icon popup-btn--sm inventory-popup__inspect"
            title="Zajrzyj do środka"
            disabled={bag.container!.inspecting}
            onClick={(e) => {
                e.stopPropagation();
                onBeforeInspect?.();
                eventBus.emit('inventory.inspect', { key: bag.key });
            }}
        >
            <Eye size={13} />
        </button>
    );
}

/** A bag in the carried list: a row that expands to its contents, which stay where they are */
function BagRow({ entry, expanded, onToggle, filter, draggable }: {
    entry: InventoryEntry;
    expanded: boolean;
    onToggle: () => void;
    filter: string;
    draggable?: boolean;
}) {
    const { bags, drag } = useWindow();
    const contents = entry.container!.contents;
    const herbal = entry.herbs !== undefined;
    const showAll = !filter || entry.label.includes(filter);
    const status = contentsStatus(entry);
    return (
        <div className={`inventory-popup__bag${expanded ? ' inventory-popup__bag--open' : ''}`}>
            <div
                className={`inventory-popup__row inventory-popup__row--bag${draggable ? ' inventory-popup__row--draggable' : ''}`}
                onClick={() => { if (!drag.swallowClick()) onToggle(); }}
                onPointerDown={draggable ? e => drag.press(e, { type: 'entry', key: entry.key }, toDragItem(entry)) : undefined}
                onContextMenu={e => showEntryMenu(e, entry, bags)}
            >
                <CategoryIcon category="bag" />
                <ItemName item={entry} text={entry.label} />
                {entry.state === 'closed' && (
                    <span className="inventory-popup__state" title="Zamknięty"><Lock size={11} /></span>
                )}
                <GameNumber bag={entry} />
                {herbal && entry.herbs && (
                    <span className="inventory-popup__pill inventory-popup__pill--muted" title="Ziół w środku według menedżera ziół">
                        {entry.herbs.reduce((sum, herb) => sum + herb.count, 0)}
                    </span>
                )}
                {!herbal && contents && (
                    <span className="inventory-popup__pill inventory-popup__pill--muted" title="Rodzajów przedmiotów w środku przy ostatnim zajrzeniu">
                        {contents.items.length}
                    </span>
                )}
                {herbal ? (
                    <button
                        type="button"
                        className="popup-btn popup-btn--icon popup-btn--sm inventory-popup__inspect"
                        title="Otwórz Zioła"
                        onClick={(e) => { e.stopPropagation(); openHerbs(); }}
                    >
                        <Leaf size={13} />
                    </button>
                ) : (
                    <InspectButton bag={entry} onBeforeInspect={() => { if (!expanded) onToggle(); }} />
                )}
                <span className="inventory-popup__chevron">{expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}</span>
            </div>
            {expanded && herbal && (
                <div className="inventory-popup__contents">
                    <HerbContents bag={entry} />
                </div>
            )}
            {expanded && !herbal && (
                <div className="inventory-popup__contents">
                    {status.before}
                    {contents?.items.map((item, index) => (showAll || item.name.includes(filter)) && (
                        <ContentRow key={index} item={item} index={index} bag={entry} />
                    ))}
                    {status.after}
                </div>
            )}
        </div>
    );
}

/** A bag from /pojemniki: a card with what it is for and what is in it, open to drops */
function BagCard({ entry, filter }: { entry: InventoryEntry; filter: string }) {
    const { bags, drag } = useWindow();
    const contents = entry.container!.contents;
    const showAll = !filter || entry.label.includes(filter);
    const status = contentsStatus(entry);
    const landing = drag.gap?.zone === entry.key;
    const rows: DropRow[] = (contents?.items ?? []).flatMap((item, index) => (showAll || item.name.includes(filter)) ? [{
        key: `${index}:${item.name}`,
        source: { type: 'content', bag: entry.key, item: index } as DragSource,
        node: <ContentRow item={item} index={index} bag={entry} draggable />,
    }] : []);
    return (
        <div ref={drag.hitRef(entry.key)} className={`inventory-popup__card${landing ? ' inventory-popup__card--landing' : ''}`}>
            <div className="inventory-popup__row inventory-popup__row--card" onContextMenu={e => showEntryMenu(e, entry, bags)}>
                <CategoryIcon category="bag" />
                <ItemName item={entry} text={entry.label} />
                {entry.state === 'closed' && (
                    <span className="inventory-popup__state" title="Zamknięty"><Lock size={11} /></span>
                )}
                <GameNumber bag={entry} />
                <InspectButton bag={entry} />
            </div>
            <div className="inventory-popup__types">
                {entry.assigned!.map(type => (
                    <span key={type.id} className="inventory-popup__type">{containerTypeLabel(type)}</span>
                ))}
            </div>
            <div className="inventory-popup__card-body">
                {status.before}
                <div ref={drag.listRef(entry.key)} className="inventory-popup__drop-list">
                    {dropListRows(entry.key, rows, drag, item => <ItemVisual item={item} nested />)}
                </div>
                {status.after}
            </div>
        </div>
    );
}

/** The dragged item under the cursor */
function DragFloat({ drag }: { drag: InventoryDrag }) {
    const { dragging } = drag;
    if (!dragging) return null;
    return (
        <div
            className="inventory-popup__float"
            style={{ left: dragging.x - dragging.offsetX, top: dragging.y - dragging.offsetY, width: dragging.width }}
        >
            <ItemVisual item={dragging.item} />
        </div>
    );
}

// ── Window ───────────────────────────────────────────────────────────────────

function matches(entry: InventoryEntry, filter: string): boolean {
    if (!filter) return true;
    if (entry.label.includes(filter)) return true;
    if (entry.herbs?.some(herb => herb.id.includes(filter))) return true;
    return !!entry.container?.contents?.items.some(item => item.name.includes(filter));
}

/** Game names are ASCII; typed Polish letters still find them */
function normalizeFilter(text: string): string {
    return text.trim().toLowerCase().split(String.fromCharCode(0x142)).join('l').normalize('NFD').replace(/\p{Diacritic}/gu, '');
}

const InventoryPopup: React.FC = () => {
    const { wrapperProps, isOpen } = usePopup<'inventory.popup.open'>(POPUP_ID, {
        openEvent: 'inventory.popup.open',
    });

    const { data: state } = usePopupData<InventoryState>(isOpen, {
        getInitialData: useCallback(() => getInventoryState(), []),
        updateEvent: 'inventory.updated',
        transformUpdate: useCallback(() => getInventoryState(), []),
    });

    const [filterText, setFilterText] = useState('');
    const filter = normalizeFilter(filterText);

    const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
    const toggle = useCallback((key: string) => {
        setExpanded(prev => {
            const next = new Set(prev);
            if (next.has(key)) next.delete(key);
            else next.add(key);
            return next;
        });
    }, []);

    const all = state.sections.flatMap(section => section.entries);
    const bags = all.filter(entry => entry.container);
    const assigned = bags.filter(entry => entry.assigned && matches(entry, filter));

    // A dropped item waits where it landed until it has left where it was
    const stillThere = useCallback((pending: Pending) => {
        const source = pending.source;
        if (source.type === 'entry') return all.some(entry => entry.key === source.key);
        const item = all.find(entry => entry.key === source.bag)?.container?.contents?.items[source.item];
        return !!item && item.name === pending.item.name && item.count === pending.item.count;
    }, [state]); // eslint-disable-line react-hooks/exhaustive-deps
    const drag = useInventoryDrag(stillThere);

    // "Zamkniety skorzany plecak nie chce wejsc.": back it goes, and the game's words say why
    const [refusal, setRefusal] = useState<string | null>(null);
    const { cancelPending } = drag;
    useEffect(() => eventBus.on('inventory.failed', ({ text }) => {
        cancelPending();
        setRefusal(text);
    }), [cancelPending]);
    // "Wkladasz ... do ...": done, the list shows where it really is now
    useEffect(() => eventBus.on('inventory.moved', () => cancelPending()), [cancelPending]);
    useEffect(() => {
        if (!refusal) return;
        const timer = setTimeout(() => setRefusal(null), REFUSAL_MS);
        return () => clearTimeout(timer);
    }, [refusal]);

    // Bags from /pojemniki live in their own column, not in the carried list
    const sections = state.sections
        .map(section => ({ ...section, entries: section.entries.filter(entry => !entry.assigned && matches(entry, filter)) }))
        .filter(section => section.entries.length > 0 || (!filter && section.label === CARRIED));

    const windowState = useMemo(() => ({ bags, drag }), [bags, drag]);

    const renderEntry = (entry: InventoryEntry, draggable: boolean) => entry.container ? (
        <BagRow
            key={entry.key}
            entry={entry}
            // A search finding something inside opens the bag
            expanded={expanded.has(entry.key) || (!!filter && !entry.label.includes(filter))}
            onToggle={() => toggle(entry.key)}
            filter={filter}
            draggable={draggable}
        />
    ) : (
        <ItemRow key={entry.key} entry={entry} draggable={draggable} />
    );

    const headerActions = (
        <HeaderButton
            title="Odśwież (i)"
            disabled={state.refreshing}
            onClick={() => eventBus.emit('inventory.refresh')}
        >
            <RefreshCw size={14} className={state.refreshing ? 'inventory-popup__spin' : undefined} />
        </HeaderButton>
    );

    const carriedLanding = drag.gap?.zone === 'carried';

    return (
        <DockablePopupWrapper
            {...wrapperProps}
            popupType="inventory"
            title={`Ekwipunek (${all.length})`}
            minWidth={260}
            minHeight={160}
            initialWidth={600}
            initialHeight={520}
            className="inventory-popup"
            bodyClassName="popup-body"
            headerActions={headerActions}
        >
            {state.updatedAt !== null && (
                <div className="inventory-popup__toolbar">
                    <Search size={13} className="inventory-popup__search-icon" />
                    <input
                        type="text"
                        className="inventory-popup__filter"
                        placeholder="Szukaj w ekwipunku i pojemnikach…"
                        value={filterText}
                        onChange={e => setFilterText(e.target.value)}
                    />
                </div>
            )}
            {state.unsure.map(({ noun, label }) => (
                // Worn and carried bags of one kind: which one "swoj" means, only the game can say
                <div key={noun} className="inventory-popup__notice">
                    <span>
                        {state.verifying
                            ? `Sprawdzam, jak gra numeruje: ${label}…`
                            : `Nie wiadomo, jak gra numeruje: ${label} (noszony i przy sobie).`}
                    </span>
                    {!state.verifying && (
                        <button
                            type="button"
                            className="popup-link"
                            title={`Wyśle ukryte „ocen 1. ${noun}”, „ocen 2. ${noun}”…`}
                            onClick={() => eventBus.emit('inventory.verify', { noun })}
                        >
                            Sprawdź
                        </button>
                    )}
                </div>
            ))}
            {refusal && (
                <div className="inventory-popup__notice inventory-popup__notice--refusal">
                    <span>Nie udało się: {refusal}</span>
                </div>
            )}
            {state.stale && state.updatedAt !== null && !state.refreshing && (
                <div className="inventory-popup__notice">
                    <span>Ekwipunek mógł się zmienić.</span>
                    <button type="button" className="popup-link" onClick={() => eventBus.emit('inventory.refresh')}>
                        Odśwież
                    </button>
                </div>
            )}
            <WindowContext.Provider value={windowState}>
                <div className="inventory-popup__content">
                    {state.updatedAt === null ? (
                        <div className="popup-empty">{state.refreshing ? 'Sprawdzam ekwipunek…' : 'Brak danych — odśwież albo wpisz i.'}</div>
                    ) : (
                        <div className={`inventory-popup__layout${assigned.length ? ' inventory-popup__layout--split' : ''}`}>
                            <div ref={drag.hitRef('carried')} className="inventory-popup__carried">
                                {sections.length === 0 && filter && <div className="popup-empty">Nic nie pasuje.</div>}
                                {sections.map(section => {
                                    const carried = section.label === CARRIED;
                                    return (
                                        <section
                                            key={section.label}
                                            className={`inventory-popup__section${carried && carriedLanding ? ' inventory-popup__section--landing' : ''}`}
                                        >
                                            <header className="inventory-popup__section-head">
                                                <span>{section.label}</span>
                                                <span className="inventory-popup__section-count">{section.entries.length}</span>
                                            </header>
                                            {carried ? (
                                                // What is carried goes into the bags from /pojemniki, and comes back here
                                                <div ref={drag.listRef('carried')} className="inventory-popup__drop-list">
                                                    {dropListRows('carried', section.entries.map(entry => ({
                                                        key: entry.key,
                                                        source: { type: 'entry', key: entry.key } as DragSource,
                                                        node: renderEntry(entry, assigned.length > 0),
                                                    })), drag, item => <ItemVisual item={item} />)}
                                                </div>
                                            ) : (
                                                section.entries.map(entry => renderEntry(entry, false))
                                            )}
                                        </section>
                                    );
                                })}
                            </div>
                            {assigned.length > 0 && (
                                <div className="inventory-popup__bags">
                                    <header className="inventory-popup__section-head">
                                        <span>Pojemniki</span>
                                        <span className="inventory-popup__section-count">{assigned.length}</span>
                                    </header>
                                    {assigned.map(entry => <BagCard key={entry.key} entry={entry} filter={filter} />)}
                                </div>
                            )}
                        </div>
                    )}
                </div>
                <DragFloat drag={drag} />
            </WindowContext.Provider>
            {state.updatedAt !== null && (
                <div className="inventory-popup__footer">
                    <span>Stan z {new Date(state.updatedAt).toLocaleString('pl-PL', { day: 'numeric', month: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
                    <span className="inventory-popup__hint">Prawy klik: akcje · przeciągnij między „Przy sobie” a pojemnikami</span>
                </div>
            )}
        </DockablePopupWrapper>
    );
};

export default InventoryPopup;
