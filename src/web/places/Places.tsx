import { useCallback, useEffect, useMemo, useRef, useState, type MouseEvent } from "react";
import { ArrowDownAZ, ArrowLeft, BookOpen, FileText, Footprints, LocateFixed, Map as MapIcon, MapPin, Navigation, NotebookPen, Plus, Puzzle, Search, X } from "lucide-react";
import { Button, DeleteButton, Input, InputGroup, TextArea } from "@web-ui/primitives/index.ts";
import eventBus from "@modules/core/eventBus";
import { globalStorage } from "@modules/core/storage";
import { getCurrentRoomId } from "@modules/core/currentRoomProvider";
import { getRoomDistance, getRoomDistances } from "@modules/core/roomInfoProvider";
import { getPluginLocationNotes } from "@modules/core/pluginLocationNotesRegistry";
import { deleteNote, saveNote } from "@modules/data/locationNotesStorage";
import { showContextMenu, type ContextMenuEntry } from "@web/contextMenu";
import { subscribeEmbeddedMap } from "@web/embedRegistry.ts";
import { MODAL_EVENT } from "@web/modals/appModal.ts";
import { MapStrip } from "./MapStrip";
import {
    deletePlace,
    hasOwnData,
    describeRoom,
    listDescribedRooms,
    loadPlaces,
    OPEN_PLACE_EVENT,
    readShortcuts,
    searchMapRooms,
    SHORTCUT_KEY_RE,
    writeShortcuts,
    type MapRoomMatch,
    type OpenPlaceDetail,
    type Place,
    type ShortcutEntry,
} from "./placesData";
import "./places.css";

/** Your places (shortcuts, notes) or the rooms the mapper described. */
type Source = "mine" | "described";
type Filter = "all" | "shortcuts" | "notes" | "plugins";
type Sort = "near" | "az";

const FILTERS: ReadonlyArray<readonly [Filter, string]> = [["all", "Wszystkie"], ["shortcuts", "Skróty"], ["notes", "Notatki"], ["plugins", "Inne"]];

/** Most described rooms listed at once; searching narrows the rest down. */
const DESCRIBED_LIMIT = 200;

const NOTE_SAVE_DELAY = 600;

function closeWindow() {
    window.dispatchEvent(new Event("close-options"));
}

function distanceLabel(d: number | null) {
    if (d === null) return "";
    if (d === 0) return "tutaj";
    return `${d} lok.`;
}

function savedLabel(ts: number) {
    const minutes = Math.round((Date.now() - ts) / 60000);
    if (minutes < 1) return "zapisano przed chwilą";
    if (minutes < 60) return `zapisano ${minutes} min temu`;
    const hours = Math.round(minutes / 60);
    if (hours < 24) return `zapisano ${hours} h temu`;
    const days = Math.round(hours / 24);
    return days === 1 ? "zapisano wczoraj" : `zapisano ${days} dni temu`;
}

/**
 * Focus a field in the Miejsca window. A window that is still opening is hidden
 * and cannot take focus yet, so focus now and again when it reports being
 * shown, if that comes shortly.
 */
function focusInWindow(el: HTMLElement | null) {
    if (!el) return;
    el.focus();
    const modal = el.closest(".app-modal");
    if (!modal) return;
    const refocus = () => el.focus();
    modal.addEventListener(MODAL_EVENT.shown, refocus, { once: true });
    window.setTimeout(() => modal.removeEventListener(MODAL_EVENT.shown, refocus), 1000);
}

interface Row {
    place: Place;
    name: string;
    area: string;
    distance: number | null;
}

/** One shortcut name: /idz prefix, commit on Enter or leaving the field. */
function ShortcutField({ entry, autoFocus, onCommit, onRemove }: {
    entry: ShortcutEntry | null;
    autoFocus?: boolean;
    onCommit: (key: string) => string | null;
    onRemove: () => void;
}) {
    const [value, setValue] = useState(entry?.key ?? "");
    const [error, setError] = useState<string | null>(null);
    const inputRef = useRef<HTMLInputElement>(null);
    useEffect(() => { setValue(entry?.key ?? ""); setError(null); }, [entry?.key]);
    useEffect(() => { if (autoFocus) focusInWindow(inputRef.current); }, [autoFocus]);

    const commit = () => {
        const key = value.trim();
        if (key === (entry?.key ?? "")) { setError(null); return; }
        setError(onCommit(key));
    };

    return (
        <div className="places-shortcut">
            <div className="places-shortcut__row">
                <InputGroup before="/idz">
                    <Input
                        mono
                        ref={inputRef}
                        value={value}
                        placeholder="nazwa"
                        onChange={e => setValue(e.target.value)}
                        onBlur={commit}
                        onKeyDown={e => { if (e.key === "Enter") commit(); if (e.key === "Escape") { setValue(entry?.key ?? ""); setError(null); } }}
                    />
                </InputGroup>
                <DeleteButton title="Usuń skrót" onClick={onRemove} />
            </div>
            {error && <span className="popup-field__error">{error}</span>}
        </div>
    );
}

function PlaceDetail({ roomId, place, focus, onBack, onRemoved }: {
    roomId: number;
    place: Place | null;
    focus: OpenPlaceDetail["focus"];
    onBack: () => void;
    /** Deleted: the window drops the selection, so no pane is left describing it. */
    onRemoved: () => void;
}) {
    const room = describeRoom(roomId, place?.note);
    const shortcuts = place?.shortcuts ?? [];
    const [adding, setAdding] = useState(false);
    const [noteText, setNoteText] = useState(place?.note?.note ?? "");
    const [savedAt, setSavedAt] = useState<number | null>(place?.note?.updatedAt ?? null);
    const [pluginNotes, setPluginNotes] = useState(() => getPluginLocationNotes(roomId));
    const pending = useRef<{ roomId: number; text: string } | null>(null);
    const timer = useRef<number | null>(null);
    const noteRef = useRef<HTMLTextAreaElement>(null);
    const barRef = useRef<HTMLDivElement>(null);
    // A map search: not on every keystroke in the note, only when either end moves.
    const standingIn = getCurrentRoomId();
    // eslint-disable-next-line react-hooks/exhaustive-deps
    const distance = useMemo(() => getRoomDistance(roomId), [roomId, standingIn]);

    const flush = useCallback(async () => {
        if (timer.current !== null) {
            window.clearTimeout(timer.current);
            timer.current = null;
        }
        const job = pending.current;
        pending.current = null;
        if (!job) return;
        const text = job.text.trim();
        if (!text) {
            await deleteNote(job.roomId);
            setSavedAt(null);
            return;
        }
        const info = describeRoom(job.roomId);
        const updatedAt = Date.now();
        await saveNote({ id: job.roomId, note: text, roomName: info.name, areaName: info.area || undefined, updatedAt });
        setSavedAt(updatedAt);
    }, []);

    // Another room: reset the fields while rendering, not in an effect, so the
    // previous room's note never shows for a frame. The panel (and its map)
    // stays mounted across rooms.
    const [shownRoom, setShownRoom] = useState(roomId);
    if (shownRoom !== roomId) {
        setShownRoom(roomId);
        setNoteText(place?.note?.note ?? "");
        setSavedAt(place?.note?.updatedAt ?? null);
        setAdding(false);
        setPluginNotes(getPluginLocationNotes(roomId));
    }

    // Anything unsaved goes out when leaving a room (pending remembers which).
    useEffect(() => () => { void flush(); }, [roomId, flush]);

    useEffect(() => eventBus.on("pluginLocationNote.changed", ({ roomId: changed }) => {
        if (changed === roomId) setPluginNotes(getPluginLocationNotes(roomId));
    }), [roomId]);

    useEffect(() => {
        if (focus === "note") focusInWindow(noteRef.current);
        if (focus === "shortcut" && shortcuts.length === 0) setAdding(true);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [roomId, focus]);

    function onNoteChange(text: string) {
        setNoteText(text);
        pending.current = { roomId, text };
        if (timer.current !== null) window.clearTimeout(timer.current);
        timer.current = window.setTimeout(() => { void flush(); }, NOTE_SAVE_DELAY);
    }

    function commitShortcut(previous: ShortcutEntry | null, key: string): string | null {
        const list = readShortcuts();
        if (!key) {
            if (previous) writeShortcuts(list.filter(s => s.key !== previous.key));
            setAdding(false);
            return null;
        }
        if (!SHORTCUT_KEY_RE.test(key)) return "Tylko litery bez polskich znaków, cyfry i _ (bez spacji).";
        const taken = list.find(s => s.key === key);
        if (taken && taken.key !== previous?.key) {
            return taken.id === roomId ? "Ten skrót już tu jest." : `„${key}” prowadzi już do ${describeRoom(taken.id).name}.`;
        }
        if (previous) {
            writeShortcuts(list.map(s => (s.key === previous.key ? { ...s, key } : s)));
        } else {
            writeShortcuts([...list, { key, id: roomId, label: "" }]);
            setAdding(false);
        }
        return null;
    }

    function removeShortcut(entry: ShortcutEntry) {
        writeShortcuts(readShortcuts().filter(s => s.key !== entry.key));
    }

    /** The old shortcut description overlaps with the note: fold it in. */
    function moveLabelToNote(entry: ShortcutEntry) {
        const merged = noteText.trim() ? `${noteText.trim()}\n${entry.label}` : entry.label;
        onNoteChange(merged);
        writeShortcuts(readShortcuts().map(s => (s.key === entry.key ? { ...s, label: "" } : s)));
    }

    async function removePlace() {
        pending.current = null;
        if (timer.current !== null) window.clearTimeout(timer.current);
        await deletePlace(roomId);
        onRemoved();
    }

    const walkTarget = shortcuts[0]?.key ?? String(roomId);
    const hasAnything = shortcuts.length > 0 || !!place?.note || !!noteText.trim();

    return (
        <section className="places-detail">
            <div className="places-hero">
                <MapStrip roomId={roomId} coverRef={barRef} />
                <div className="places-hero__bar" ref={barRef}>
                    <button type="button" className="places-back popup-btn popup-btn--control popup-btn--icon" title="Wróć do listy" onClick={onBack}>
                        <ArrowLeft size={16} strokeWidth={1.9} />
                    </button>
                    <div className="places-hero__title">
                        <strong>{room.name}</strong>
                        <span>{[room.area, `#${roomId}`, distance ? `${distance} lok. stąd` : distance === 0 ? "tutaj" : ""].filter(Boolean).join(" · ")}</span>
                    </div>
                    <Button variant="solid" onClick={() => { closeWindow(); eventBus.emit("sendCommand", { command: `/idz ${walkTarget}` }); }}>
                        <Footprints size={15} strokeWidth={1.9} />Idź
                    </Button>
                    <Button onClick={() => { closeWindow(); eventBus.emit("leadTo", roomId); }}>
                        <Navigation size={14} strokeWidth={1.9} />Prowadź
                    </Button>
                </div>
            </div>

            <div className="places-detail__body">
                <div className="places-sec">
                    <div className="places-sec__head">
                        <MapPin size={15} strokeWidth={1.9} className="places-ic--shortcut" />
                        <span className="places-sec__title">Skrót</span>
                        <span className="places-sec__hint">do /idz i /prowadz</span>
                    </div>
                    {shortcuts.map(s => (
                        <div key={s.key}>
                            <ShortcutField entry={s} onCommit={key => commitShortcut(s, key)} onRemove={() => removeShortcut(s)} />
                            {s.label && (
                                <div className="places-label">
                                    <span>Opis: {s.label}</span>
                                    <Button variant="ghost" size="sm" onClick={() => moveLabelToNote(s)}>Przenieś do notatki</Button>
                                </div>
                            )}
                        </div>
                    ))}
                    {adding && (
                        <ShortcutField entry={null} autoFocus onCommit={key => commitShortcut(null, key)} onRemove={() => setAdding(false)} />
                    )}
                    {!adding && (
                        <Button variant="ghost" size="sm" className="places-add" onClick={() => setAdding(true)}>
                            <Plus size={14} strokeWidth={2} />{shortcuts.length ? "Dodaj kolejny skrót" : "Dodaj skrót"}
                        </Button>
                    )}
                </div>

                <div className="places-sec">
                    <div className="places-sec__head">
                        <NotebookPen size={15} strokeWidth={1.9} className="places-ic--note" />
                        <span className="places-sec__title">Twoja notatka</span>
                        <span className="places-sec__spacer" />
                        <span className="places-sec__hint">{savedAt ? `${savedLabel(savedAt)} · synchronizowana` : "zapisuje się sama"}</span>
                    </div>
                    <TextArea
                        ref={noteRef}
                        className="places-note"
                        rows={5}
                        value={noteText}
                        placeholder="Co warto zapamiętać o tym miejscu…"
                        onChange={e => onNoteChange(e.target.value)}
                        onBlur={() => { void flush(); }}
                    />
                </div>

                {(room.description || room.mapNote || pluginNotes.length > 0) && (
                    <div className="places-sec">
                        <div className="places-sec__head">
                            <span className="places-sec__title places-sec__title--dim">Inne notatki o tym miejscu</span>
                            <span className="places-sec__hint">tylko do odczytu</span>
                        </div>
                        {room.description && (
                            <div className="places-other">
                                <FileText size={14} strokeWidth={1.9} />
                                <div><span className="places-other__src">Opis z mapy</span><pre className="places-other__pre">{room.description}</pre></div>
                            </div>
                        )}
                        {room.mapNote && (
                            <div className="places-other">
                                <MapIcon size={14} strokeWidth={1.9} />
                                <div><span className="places-other__src">Z mapy</span><p>{room.mapNote}</p></div>
                            </div>
                        )}
                        {pluginNotes.map(pn => (
                            <div key={pn.pluginId} className="places-other">
                                {pn.builtin ? <BookOpen size={14} strokeWidth={1.9} /> : <Puzzle size={14} strokeWidth={1.9} />}
                                <div><span className="places-other__src">{pn.builtin ? pn.pluginName : `Wtyczka: ${pn.pluginName}`}</span><p>{pn.note}</p></div>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            <footer className="places-detail__foot">
                <Button variant="danger" size="sm" disabled={!hasAnything} onClick={removePlace}>Usuń miejsce</Button>
                <span className="places-sec__spacer" />
                <span className="places-sec__hint">zmiany zapisują się same</span>
            </footer>
        </section>
    );
}

/**
 * A room from the map rather than a saved place: name, #id and area. Its
 * description is only shown in the place pane (and searched): it is free-form
 * text, often ruled lines, and does not fit a row.
 */
function MapRoomRow({ room, selected, onSelect, onContextMenu }: {
    room: MapRoomMatch;
    selected: boolean;
    onSelect: () => void;
    onContextMenu: (e: MouseEvent<HTMLElement>) => void;
}) {
    return (
        <button type="button" className={`places-row places-row--map${selected ? " is-selected" : ""}`} onClick={onSelect} onContextMenu={onContextMenu}>
            <span className="places-row__top">
                <span className="places-row__name">{room.name}</span>
                <span className="places-row__meta">#{room.roomId}</span>
            </span>
            <span className="places-row__sub">
                {room.description && <FileText size={13} strokeWidth={1.9} className="places-row__note-ic" />}
                <span className="places-row__note">{room.area}</span>
            </span>
        </button>
    );
}

/** Miejsca: shortcuts (/idz, /prowadz) and location notes, one entry per room. */
export default function Places() {
    const [places, setPlaces] = useState<Place[]>([]);
    const [query, setQuery] = useState("");
    const [source, setSource] = useState<Source>("mine");
    const [filter, setFilter] = useState<Filter>("all");
    const [sort, setSort] = useState<Sort>("near");
    const [selected, setSelected] = useState<number | null>(null);
    const [focus, setFocus] = useState<OpenPlaceDetail["focus"]>();
    const [here, setHere] = useState<number | null>(() => getCurrentRoomId());
    const [mapVersion, setMapVersion] = useState(0);

    useEffect(() => subscribeEmbeddedMap(() => setMapVersion(v => v + 1)), []);

    // Rooms the mapper described: read-only, listed under their own tab.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    const described = useMemo(() => listDescribedRooms(), [mapVersion]);

    const load = useCallback(() => { void loadPlaces().then(setPlaces); }, []);

    useEffect(() => {
        load();
        const offShortcuts = globalStorage.onChange("shortcuts", load);
        const offNotes = eventBus.on("locationNote.changed", load);
        // A plugin often sets many notes in one go: reload once for the batch.
        let pluginReload: number | null = null;
        const offPluginNotes = eventBus.on("pluginLocationNote.changed", () => {
            if (pluginReload !== null) return;
            pluginReload = window.setTimeout(() => { pluginReload = null; load(); }, 100);
        });
        const offMove = eventBus.on("enterLocation", ({ id }) => setHere(id));
        const modal = document.getElementById("places-modal");
        modal?.addEventListener(MODAL_EVENT.show, load);
        const onOpen = (e: Event) => {
            const detail = (e as CustomEvent<OpenPlaceDetail>).detail;
            setSelected(detail.roomId);
            setFocus(detail.focus);
            setQuery("");
        };
        window.addEventListener(OPEN_PLACE_EVENT, onOpen);
        return () => {
            offShortcuts?.();
            offNotes?.();
            offPluginNotes?.();
            if (pluginReload !== null) window.clearTimeout(pluginReload);
            offMove?.();
            modal?.removeEventListener(MODAL_EVENT.show, load);
            window.removeEventListener(OPEN_PLACE_EVENT, onOpen);
        };
    }, [load]);

    const hereArea = here !== null ? describeRoom(here).area : "";

    const rows = useMemo<Row[]>(() => {
        // One search for all of them: a place per search froze the page once
        // Wiedza hints put thousands of rooms on the list.
        const distances = getRoomDistances(places.map(place => place.roomId));
        return places.map(place => {
            const room = describeRoom(place.roomId, place.note);
            return { place, name: room.name, area: room.area, distance: distances.get(place.roomId) ?? null };
        });
        // `here` changes the distances.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [places, here]);

    const counts = {
        all: rows.length,
        shortcuts: rows.filter(r => r.place.shortcuts.length > 0).length,
        notes: rows.filter(r => r.place.note).length,
        plugins: rows.filter(r => r.place.pluginNotes.length > 0).length,
    };
    // The Inne tab only while a plugin or Wiedza notes some room; leave it when they go.
    const filters = FILTERS.filter(([key]) => key !== "plugins" || counts.plugins > 0);
    const activeFilter: Filter = filter === "plugins" && counts.plugins === 0 ? "all" : filter;

    const visible = useMemo(() => {
        const q = query.trim().toLowerCase();
        const matches = (r: Row) => !q
            || r.name.toLowerCase().includes(q)
            || r.area.toLowerCase().includes(q)
            || String(r.place.roomId).includes(q)
            || r.place.shortcuts.some(s => s.key.toLowerCase().includes(q) || s.label.toLowerCase().includes(q))
            || !!r.place.note?.note.toLowerCase().includes(q)
            || r.place.pluginNotes.some(n => n.note.toLowerCase().includes(q) || n.pluginName.toLowerCase().includes(q));
        const inFilter = (r: Row) => {
            if (activeFilter === "shortcuts") return r.place.shortcuts.length > 0;
            if (activeFilter === "notes") return !!r.place.note;
            if (activeFilter === "plugins") return r.place.pluginNotes.length > 0;
            return true;
        };
        const list = rows.filter(inFilter).filter(matches);
        const byName = (a: Row, b: Row) => a.name.localeCompare(b.name, "pl");
        if (sort === "az") return { near: list.sort(byName), other: [] as Row[] };
        const near = list.filter(r => !hereArea || r.area === hereArea)
            .sort((a, b) => (a.distance ?? Infinity) - (b.distance ?? Infinity) || byName(a, b));
        const other = list.filter(r => hereArea && r.area !== hereArea)
            .sort((a, b) => a.area.localeCompare(b.area, "pl") || byName(a, b));
        return { near, other };
    }, [rows, query, activeFilter, sort, hereArea]);

    const selectedPlace = selected !== null ? places.find(p => p.roomId === selected) ?? null : null;

    function select(roomId: number, focusField?: OpenPlaceDetail["focus"]) {
        setSelected(roomId);
        setFocus(focusField);
    }

    // Deleting drops the selection: a pane still describing the place just
    // deleted is the confusing part, not the deletion.
    const removePlace = useCallback(async (roomId: number) => {
        await deletePlace(roomId);
        setSelected(current => (current === roomId ? null : current));
    }, []);

    /** Right-click on a row: what the place pane offers, without opening it. */
    function rowMenu(e: MouseEvent<HTMLElement>, roomId: number, name: string, place: Place | null) {
        e.preventDefault();
        const target = place?.shortcuts[0]?.key ?? String(roomId);
        const items: ContextMenuEntry[] = [
            { label: "Idź", action: () => { closeWindow(); eventBus.emit("sendCommand", { command: `/idz ${target}` }); } },
            { label: "Prowadź", action: () => { closeWindow(); eventBus.emit("leadTo", roomId); } },
        ];
        // Nothing of yours is saved for a room found on the map, so nothing to forget.
        if (hasOwnData(place)) items.push({ label: "Usuń miejsce", action: () => { void removePlace(roomId); } });
        showContextMenu(items, e.clientX, e.clientY, { header: name, smallHeader: true });
    }

    const renderRow = (r: Row) => {
        const own = r.place.note?.note ?? r.place.shortcuts.find(s => s.label)?.label ?? "";
        // Nothing of your own to preview: what a plugin notes, marked as such.
        const plugin = !own ? r.place.pluginNotes[0] : undefined;
        const note = own || plugin?.note || "";
        const NoteIcon = !plugin ? NotebookPen : plugin.builtin ? BookOpen : Puzzle;
        return (
            <button
                key={r.place.roomId}
                type="button"
                className={`places-row${selected === r.place.roomId ? " is-selected" : ""}`}
                onClick={() => select(r.place.roomId)}
                onContextMenu={e => rowMenu(e, r.place.roomId, r.name, r.place)}
            >
                <span className="places-row__top">
                    <span className="places-row__name">{r.name}</span>
                    <span className="places-row__meta">{r.area && r.area !== hereArea && sort === "near" ? r.area : distanceLabel(r.distance)}</span>
                </span>
                {(r.place.shortcuts.length > 0 || note) && (
                    <span className="places-row__sub">
                        {r.place.shortcuts.map(s => <span key={s.key} className="places-key">{s.key}</span>)}
                        {note && <NoteIcon size={13} strokeWidth={1.9} className="places-row__note-ic" />}
                        {note && <span className="places-row__note">{note.split("\n")[0]}</span>}
                    </span>
                )}
            </button>
        );
    };

    // Rooms you have nothing saved for yet, found on the map by name, area or #id,
    // so a shortcut or note can be added without walking there first.
    const mapMatches = useMemo(() => {
        if (source === "described") return [];
        return searchMapRooms(query, new Set(places.map(p => p.roomId)));
        // mapVersion: the map arriving makes rooms searchable.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [query, places, source, mapVersion]);

    const describedVisible = useMemo(() => {
        if (source !== "described") return [];
        const q = query.trim().toLowerCase();
        return described
            .filter(r => !q || r.name.toLowerCase().includes(q) || r.area.toLowerCase().includes(q)
                || String(r.roomId) === q.replace("#", "") || !!r.description?.toLowerCase().includes(q))
            .sort((a, b) => a.area.localeCompare(b.area, "pl") || a.name.localeCompare(b.name, "pl"));
    }, [described, source, query]);

    // A room picked from outside the list (Tutaj, the map's menu) that is not
    // saved yet: shown on top so the selection is visible. A room picked from
    // the list itself is just highlighted there.
    const listed = source === "described"
        ? describedVisible.some(r => r.roomId === selected)
        : mapMatches.some(r => r.roomId === selected);
    const draft = selected !== null && !selectedPlace && !listed;

    return (
        <div className={`places${selected !== null ? " has-selection" : ""}`}>
            <div className="places-list">
                <div className="places-list__tools">
                    <div className="places-list__search">
                        <InputGroup before={<Search size={14} strokeWidth={1.9} />}>
                            <Input
                                className="places-search"
                                value={query}
                                placeholder="Szukaj: nazwa, kraina lub numer lokacji"
                                onChange={e => setQuery(e.target.value)}
                                onKeyDown={e => { if (e.key === "Escape" && query) { e.stopPropagation(); setQuery(""); } }}
                            />
                            {query && (
                                <button type="button" className="places-search-clear" title="Wyczyść wyszukiwanie" onClick={() => setQuery("")}>
                                    <X size={14} strokeWidth={2} />
                                </button>
                            )}
                        </InputGroup>
                        <Button
                            variant="solid"
                            disabled={here === null}
                            title={here === null ? "Nieznana bieżąca lokacja" : "Dodaj lub pokaż miejsce, w którym jesteś"}
                            onClick={() => here !== null && select(here)}
                        >
                            <LocateFixed size={15} strokeWidth={1.9} />Tutaj
                        </Button>
                    </div>
                    {described.length > 0 && (
                        <div className="dialog-tabs places-source">
                            <button type="button" className={`dialog-tab${source === "mine" ? " is-active" : ""}`} onClick={() => setSource("mine")}>
                                Moje miejsca <span className="dialog-tab__count">{counts.all}</span>
                            </button>
                            <button
                                type="button"
                                className={`dialog-tab${source === "described" ? " is-active" : ""}`}
                                title="Lokacje, którym autorzy mapy dali opis (tylko do odczytu)"
                                onClick={() => setSource("described")}
                            >
                                Opisy z mapy <span className="dialog-tab__count">{described.length}</span>
                            </button>
                        </div>
                    )}
                    {source === "mine" && (
                    <div className="places-list__filters">
                        <div className="dialog-tabs places-filter">
                            {filters.map(([key, label]) => (
                                <button
                                    key={key}
                                    type="button"
                                    className={`dialog-tab${activeFilter === key ? " is-active" : ""}`}
                                    title={key === "plugins" ? "Miejsca z notatkami od wtyczek i z Wiedzy (tylko do odczytu)" : undefined}
                                    onClick={() => setFilter(key)}
                                >
                                    {label} <span className="dialog-tab__count">{counts[key]}</span>
                                </button>
                            ))}
                        </div>
                        {(
                            <Button
                                variant="ghost"
                                size="sm"
                                className="popup-btn--icon places-sort"
                                onClick={() => setSort(sort === "near" ? "az" : "near")}
                                title={sort === "near" ? "Kolejność: najbliższe (kliknij: A–Z)" : "Kolejność: A–Z (kliknij: najbliższe)"}
                            >
                                {sort === "near" ? <Navigation size={15} strokeWidth={1.9} /> : <ArrowDownAZ size={16} strokeWidth={1.9} />}
                            </Button>
                        )}
                    </div>
                    )}
                </div>
                <div className="places-list__rows">
                    {draft && (
                        <button type="button" className="places-row is-selected">
                            <span className="places-row__top">
                                <span className="places-row__name">{describeRoom(selected!).name}</span>
                                <span className="places-row__meta">niezapisane</span>
                            </span>
                            <span className="places-row__sub">
                                <span className="places-row__note">zapisze się, gdy dostanie skrót lub notatkę</span>
                            </span>
                        </button>
                    )}
                    {source === "described" ? (
                        <>
                            {describedVisible.slice(0, DESCRIBED_LIMIT).map(m => (
                                <MapRoomRow key={m.roomId} room={m} selected={selected === m.roomId} onSelect={() => select(m.roomId)} onContextMenu={e => rowMenu(e, m.roomId, m.name, null)} />
                            ))}
                            {describedVisible.length > DESCRIBED_LIMIT && (
                                <p className="places-empty">Pokazano {DESCRIBED_LIMIT} z {describedVisible.length}. Zawęź wyszukiwanie.</p>
                            )}
                            {describedVisible.length === 0 && <p className="places-empty">Nic nie pasuje do wyszukiwania.</p>}
                        </>
                    ) : (
                        <>
                            {visible.near.map(renderRow)}
                            {visible.other.length > 0 && <span className="places-list__group">Inne obszary</span>}
                            {visible.other.map(renderRow)}
                            {mapMatches.length > 0 && <span className="places-list__group">Lokacje na mapie</span>}
                            {mapMatches.map(m => (
                                <MapRoomRow key={m.roomId} room={m} selected={selected === m.roomId} onSelect={() => select(m.roomId)} onContextMenu={e => rowMenu(e, m.roomId, m.name, null)} />
                            ))}
                        </>
                    )}
                    {source === "mine" && rows.length === 0 && !draft && !query.trim() && (
                        <p className="places-empty">
                            Nie masz jeszcze zapisanych miejsc. Kliknij „Tutaj”, żeby dodać skrót lub notatkę dla miejsca, w którym jesteś, wpisz w wyszukiwarce nazwę lokacji albo jej numer (np. 321), żeby znaleźć ją na mapie, lub wybierz lokację prawym przyciskiem na mapie.
                        </p>
                    )}
                    {source === "mine" && query.trim() && visible.near.length + visible.other.length + mapMatches.length === 0 && (
                        <p className="places-empty">Nic nie pasuje do wyszukiwania.</p>
                    )}
                </div>
            </div>

            {selected !== null ? (
                <PlaceDetail roomId={selected} place={selectedPlace} focus={focus} onBack={() => setSelected(null)} onRemoved={() => setSelected(null)} />
            ) : (
                <div className="places-detail places-detail--empty">
                    <MapPin size={22} strokeWidth={1.6} />
                    <p>Wybierz miejsce z listy, kliknij „Tutaj” albo wyszukaj lokację na mapie.</p>
                </div>
            )}
        </div>
    );
}
