/**
 * The Klawisze window: every binding on a drawn keyboard and in lists, with
 * where each one works (in the client, through the helper, everywhere).
 *
 * This file composes the window and lays it out for its four width steps.
 * The edits are pure functions in `keyEdits.ts`; storage, the helper's state,
 * key capture and measuring are hooks; each list is a component in
 * `sections/`, sharing what they need through `KeysContext`.
 */
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { ChevronDown, ChevronRight, Plug, Search, X } from "lucide-react";
import { Button, Segmented } from "@web-ui/primitives/index.ts";
import { getPluginKeyActions, subscribePluginKeyActions } from "@modules/core/pluginKeyRegistry";
import type { HelperConnection } from "@modules/helper/HelperConnection";
import { isHelperSupported } from "@web/helperDownload.ts";
import SubDialog from "@web/SubDialog.tsx";
import { openSettingsPage } from "@web/settings/categories.ts";
import {
    baseLayers,
    buildEntries,
    comboId,
    comboInLayer,
    comboLabel,
    conflicts as findConflicts,
    entriesByCombo,
    GROUPS,
    layerLabel,
    layerOf,
    mergeEntries,
    type Combo,
    type Group,
    type KeyEntry,
    type Layer,
    type Reach,
} from "./keysModel";
import { addCapturedHelperBind, addOwnCommand, assignKey, restoreDefaults, toggleNumLockAware, type KeysData, type KeysEdit } from "./keyEdits";
import { bindsWord, KeysContext, type KeysContextValue } from "./KeysContext";
import { useKeymapStore } from "./useKeymapStore";
import { useHelperStatus } from "./useHelperStatus";
import { useKeyCapture, type Capture } from "./useKeyCapture";
import { useKeysSize } from "./useKeysSize";
import { KEYBOARD_HEIGHT, KEYBOARD_WIDTH } from "./keyboardLayout";
import { KeyboardView, Legend } from "./KeyboardView";
import KeyDetail from "./KeyDetail";
import KeysToolbar, { HelperChip } from "./KeysToolbar";
import { CaptureBar, CaptureSheet } from "./CaptureOverlays";
import BasicSection from "./sections/BasicSection";
import EnemySection from "./sections/EnemySection";
import { MultiSection, TempSection } from "./sections/SlotListSection";
import DirSection from "./sections/DirSection";
import OwnSection from "./sections/OwnSection";
import PluginSection from "./sections/PluginSection";
import HelperSection from "./sections/HelperSection";
import "./keys.css";

type ListTab = Group | "helper";

interface KeysProps {
    helperConnection?: HelperConnection | null;
    /** Where the window's toolbar goes (the modal header); inline when absent. */
    headerSlot?: HTMLElement | null;
}

export default function Keys({ helperConnection, headerSlot }: KeysProps) {
    const rootRef = useRef<HTMLDivElement>(null);
    const kbRef = useRef<HTMLDivElement>(null);

    const store = useKeymapStore(rootRef, helperConnection);
    const { binds, helperBinds, apply } = store;
    const helper = useHelperStatus(helperConnection);
    const helperSupported = isHelperSupported();

    // ── View state ──────────────────────────────────────────────────────
    const [kbCollapsed, setKbCollapsed] = useState(false);
    const { size, kbWidth } = useKeysSize(rootRef, kbRef, kbCollapsed);
    const [layer, setLayer] = useState<Layer>("");
    const [selected, setSelected] = useState<string | null>(null);
    const [detailOpen, setDetailOpen] = useState(false);
    const [search, setSearch] = useState("");
    const [searchOpen, setSearchOpen] = useState(false);
    const [legendOpen, setLegendOpen] = useState(false);
    const [listTab, setListTab] = useState<ListTab>("dir");
    const [notice, setNotice] = useState<string | null>(null);
    const [confirm, setConfirm] = useState<"delete" | "restore" | null>(null);
    const newRowRef = useRef<string | null>(null);

    useEffect(() => {
        if (!notice) return;
        const t = window.setTimeout(() => setNotice(null), 5000);
        return () => window.clearTimeout(t);
    }, [notice]);

    // ── Derived ─────────────────────────────────────────────────────────
    // One row per binding: a helper hotkey that only carries a binding outside
    // the client is folded into it, and shows up as its "gdzie działa".
    const pluginActions = useSyncExternalStore(subscribePluginKeyActions, getPluginKeyActions);
    const merged = useMemo(() => mergeEntries(buildEntries(binds, helperBinds, pluginActions)), [binds, helperBinds, pluginActions]);
    const entries = merged.list;
    const byCombo = useMemo(() => entriesByCombo(entries), [entries]);
    const conflictIds = useMemo(() => findConflicts(byCombo, helper.connected), [byCombo, helper.connected]);

    const layers = useMemo(() => {
        const extra = new Set<Layer>();
        const base = baseLayers(!!binds.numLockAware);
        for (const e of entries) if (e.combo && !base.includes(layerOf(e.combo))) extra.add(layerOf(e.combo));
        return [...base, ...[...extra].sort()];
    }, [entries, binds.numLockAware]);
    // Switching NumLock apart off takes its tab away: back to no modifier.
    useEffect(() => {
        if (!layers.includes(layer)) setLayer("");
    }, [layers, layer]);

    const selectedCombo: Combo | null = useMemo(() => {
        if (!selected) return null;
        const parts = selected.split("+");
        const code = parts.pop()!;
        return comboInLayer(code, parts.join("+"));
    }, [selected]);

    // ── Editing ─────────────────────────────────────────────────────────
    const data: KeysData = { binds, helperBinds };

    const applyEdit = useCallback((edit: KeysEdit, debounce = false) => {
        if (edit.newRow) newRowRef.current = edit.newRow;
        apply(edit, debounce);
        if (edit.notice) setNotice(edit.notice);
    }, [apply]);

    const selectCombo = (combo: Combo) => {
        setLayer(layerOf(combo));
        setSelected(comboId(combo));
        setDetailOpen(true);
    };

    const onCaptured = (c: Capture, combo: Combo | null) => {
        if (c.target.kind === "entry") applyEdit(assignKey(data, c.target.entry, combo));
        else if (combo) applyEdit(addCapturedHelperBind(data, combo, c.target));
        if (combo) {
            setLayer(layerOf(combo));
            setSelected(comboId(combo));
        }
    };

    const capture = useKeyCapture({
        helperConnection,
        helperConnected: helper.connected,
        numLockAware: !!binds.numLockAware,
        onCaptured,
        onNotice: setNotice,
    });
    const active = capture.capture;

    const ctx: KeysContextValue = {
        data,
        entries,
        byCombo,
        helperConnected: helper.connected,
        helperSupported,
        size,
        search,
        searching: search.trim() !== "",
        capturingId: active?.target.kind === "entry" ? active.target.entry.id : null,
        startCapture: capture.start,
        cancelCapture: capture.cancel,
        applyEdit,
        selectEntry: (e: KeyEntry) => { if (e.combo) selectCombo(e.combo); },
        addOwnCommand: (reach: Reach, combo?: Combo) => {
            setListTab("own");
            if (reach === "client") applyEdit(addOwnCommand(data, "client", combo));
            // A key already in hand (picked on the drawing) needs no capture.
            else if (combo) applyEdit(addOwnCommand(data, reach, combo));
            else capture.start({ kind: "new-helper-command", label: "Skrót przez helpera" });
        },
        newRowRef,
    };

    /** A key clicked on the drawing: ends a capture, or selects the key. */
    const onKey = (combo: Combo, bound: KeyEntry[], mini: boolean) => {
        if (active) {
            capture.finish(combo);
            return;
        }
        setSelected(comboId(combo));
        // On the colour map a key with one binding jumps to it in the list.
        const only = mini && bound.length === 1 ? bound[0] : null;
        const target = only
            ? rootRef.current?.querySelector(`[data-bind="${only.id}"]`)
                ?? rootRef.current?.querySelector(`[data-section="${only.ref.kind === "helper" ? "helper" : only.group}"]`)
            : null;
        if (target) target.scrollIntoView({ block: "center", behavior: "smooth" });
        else setDetailOpen(true);
    };

    // ── Pieces ──────────────────────────────────────────────────────────
    const compact = size === "narrow" || size === "phone";

    const keyboard = (mini: boolean) => (
        <KeyboardView
            mini={mini}
            layer={layer}
            kbWidth={kbWidth}
            boardRef={kbRef}
            selected={selected}
            capturing={!!active}
            capturingCombo={active?.target.kind === "entry" ? active.target.entry.combo : null}
            onKey={(combo, bound) => onKey(combo, bound, mini)}
        />
    );

    const detail = <KeyDetail combo={selectedCombo} selectCombo={selectCombo} onClose={size !== "wide" ? () => setDetailOpen(false) : undefined} />;

    const helperChip = helperConnection
        ? <HelperChip helperConnection={helperConnection} state={helper.state} platform={helper.platform} size={size} />
        : null;

    const helperSection = helperSupported && (
        <HelperSection helperConnection={helperConnection} helperState={helper.state} helperPlatform={helper.platform} focusEntry={merged.focus} />
    );

    const toolbar = (
        <KeysToolbar
            size={size}
            keymapList={store.keymapList}
            keymapId={store.keymapId}
            numLockAware={!!binds.numLockAware}
            helperChip={helperChip}
            onSwitch={store.switchKeymap}
            onCreate={store.createKeymap}
            onRename={store.rename}
            onToggleNumLock={() => applyEdit(toggleNumLockAware(data))}
            // The import lives in Ustawienia → Import z innych klientów.
            onImportMultibinds={() => openSettingsPage("data-import", "import-multibinds")}
            onConfirm={setConfirm}
        />
    );

    const layerTabs = (
        <Segmented
            name="keys-layer"
            value={layer}
            onChange={setLayer}
            options={layers.map(l => {
                const n = entries.filter(e => e.combo && layerOf(e.combo) === l).length;
                const text = compact && l === "ctrl+alt" ? "C+A" : layerLabel(l, size !== "wide");
                return { value: l, label: <>{text}{!compact && n > 0 && <span className="keys-muted keys-count">{n}</span>}</> };
            })}
        />
    );

    const searchField = (
        <div className="keys-search">
            <Search size={15} />
            <input
                type="text"
                className="keys-search__input"
                placeholder="Szukaj klawisza lub funkcji"
                value={search}
                onChange={ev => setSearch(ev.target.value)}
                data-dialog-escape="local"
                autoFocus={size !== "wide" && searchOpen}
            />
            {search && <button type="button" className="keys-ib keys-ib--sm" title="Wyczyść" onClick={() => setSearch("")}><X size={13} /></button>}
        </div>
    );
    const searchToggle = searchOpen ? searchField : (
        <button type="button" className="keys-ib keys-ib--box" title="Szukaj" onClick={() => setSearchOpen(true)}><Search size={15} /></button>
    );

    const conflictBanner = conflictIds.length > 0 && compact && (() => {
        const first = byCombo.get(conflictIds[0])!;
        const combo = first[0].combo!;
        return (
            <button type="button" className="keys-banner" onClick={() => selectCombo(combo)}>
                <span className="keys-kc is-conflict">{comboLabel(combo)}</span>
                <span>
                    {conflictIds.length > 1
                        ? `${conflictIds.length} konflikty, pierwszy na ${comboLabel(combo)}`
                        : `Konflikt: ${bindsWord(first.length)} na ${comboLabel(combo)}`}
                </span>
                <ChevronRight size={15} />
            </button>
        );
    })();

    // ── Layout ──────────────────────────────────────────────────────────
    const hasPlugins = entries.some(e => e.ref.kind === "plugin");
    let body: ReactNode;
    if (size === "wide") {
        body = (
            <>
                <div className="keys-bar">
                    {layerTabs}
                    <span className="keys-spacer" />
                    <Legend withReserved={false} />
                    {searchField}
                </div>
                <div className="keys-top">
                    {/* The panel never grows the row past the keyboard; it scrolls instead,
                        so picking a key can't push the lists down the page. */}
                    {keyboard(false)}
                    <aside className="keys-aside" style={{ maxHeight: (kbWidth / KEYBOARD_WIDTH) * KEYBOARD_HEIGHT || undefined }}>{detail}</aside>
                </div>
                <div className="keys-lists">
                    <BasicSection />
                    <div className="keys-lists__stack"><EnemySection /><TempSection /><MultiSection /></div>
                    <DirSection />
                    <OwnSection />
                    <PluginSection />
                </div>
                {helperSection}
            </>
        );
    } else if (size === "medium") {
        // "Pluginy" only once a plugin offers a key action.
        const listOrder: ListTab[] = ["dir", "basic", "enemy", "temp", "multi", "own", ...(hasPlugins ? ["plugin" as const] : []), ...(helperSupported ? ["helper" as const] : [])];
        const sections: Record<ListTab, ReactNode> = {
            basic: <BasicSection />, enemy: <EnemySection />, temp: <TempSection />, multi: <MultiSection />,
            dir: <DirSection />, own: <OwnSection />, plugin: <PluginSection />, helper: helperSection,
        };
        const tabCount = (g: ListTab) => g === "helper" ? 0 : entries.filter(e => e.group === g && e.combo).length;
        body = (
            <>
                <div className="keys-bar">
                    {layerTabs}
                    <span className="keys-spacer" />
                    <div className="popup-menu-anchor">
                        <Button size="sm" onClick={() => setLegendOpen(!legendOpen)}>
                            <span className="keys-dot" data-group="basic" /><span className="keys-dot" data-group="enemy" /><span className="keys-dot" data-group="own" />Legenda
                        </Button>
                        {legendOpen && <div className="keys-legend-pop"><Legend withReserved /></div>}
                    </div>
                    {searchToggle}
                </div>
                <div className="keys-top keys-top--medium">
                    {keyboard(false)}
                    {detailOpen && selectedCombo && <div className="keys-pop">{detail}</div>}
                </div>
                <div className="keys-tabs">
                    {listOrder.map(g => (
                        <button key={g} type="button" className={`keys-tab${listTab === g ? " is-on" : ""}`} onClick={() => setListTab(g)}>
                            {g === "helper" ? <Plug size={12} /> : <span className="keys-dot" data-group={g} />}
                            {g === "helper" ? "Helper" : GROUPS.find(x => x.id === g)!.label}
                            <span className="keys-muted">{tabCount(g) || ""}</span>
                        </button>
                    ))}
                </div>
                <div className="keys-tabpanel">{ctx.searching ? listOrder.map(g => <div key={g}>{sections[g]}</div>) : sections[listTab]}</div>
            </>
        );
    } else {
        const phone = size === "phone";
        body = (
            <>
                {phone ? searchField : (
                    <div className="keys-bar">
                        {layerTabs}
                        <span className="keys-spacer" />
                        {searchToggle}
                    </div>
                )}
                {conflictBanner}
                {!phone && (
                    <div className="keys-minimap">
                        <div className="keys-minimap__head">
                            <span className="keys-cap">Mapa</span>
                            <span className="keys-muted">dotknij pola, by przejść do funkcji</span>
                            <span className="keys-spacer" />
                            <Button size="sm" variant="ghost" onClick={() => setKbCollapsed(!kbCollapsed)}>
                                {kbCollapsed ? "Pokaż" : "Zwiń"}{kbCollapsed ? <ChevronDown size={14} /> : <ChevronDown size={14} className="keys-flip" />}
                            </Button>
                        </div>
                        {!kbCollapsed && keyboard(true)}
                        {!kbCollapsed && <Legend withReserved />}
                    </div>
                )}
                <DirSection />
                <TempSection />
                <BasicSection />
                <EnemySection />
                <MultiSection />
                <OwnSection />
                <PluginSection />
                {helperSection}
            </>
        );
    }

    const sheetOpen = compact && detailOpen && !!selectedCombo;

    return (
        <KeysContext.Provider value={ctx}>
            <div className={`keys keys--${size}`} ref={rootRef}>
                {headerSlot ? createPortal(toolbar, headerSlot) : toolbar}
                {size === "phone" && helperChip && <div className="keys-phone-helper">{helperChip}</div>}
                {active && !compact && <CaptureBar capture={active} onCancel={capture.cancel} />}
                {notice && <div className="keys-notice" role="status">{notice}<button type="button" className="keys-ib keys-ib--sm" onClick={() => setNotice(null)}><X size={13} /></button></div>}
                {body}
                {sheetOpen && !active && (
                    <>
                        <div className="keys-scrim" onClick={() => setDetailOpen(false)} />
                        <div className="keys-sheet">{detail}</div>
                    </>
                )}
                {active && compact && (
                    <CaptureSheet capture={active} liveMods={capture.liveMods} onClear={() => capture.finish(null)} onCancel={capture.cancel} />
                )}
                {confirm === "delete" && (
                    <SubDialog
                        size="sm"
                        title="Usunąć mapę klawiszy?"
                        onClose={() => setConfirm(null)}
                        footer={(
                            <>
                                <Button onClick={() => setConfirm(null)}>Anuluj</Button>
                                <Button variant="danger" onClick={() => { store.deleteCurrent(); setConfirm(null); }}>Usuń</Button>
                            </>
                        )}
                    >
                        Czy na pewno chcesz usunąć mapę klawiszy <strong>{store.keymapList.find(k => k.id === store.keymapId)?.name}</strong>?
                    </SubDialog>
                )}
                {confirm === "restore" && (
                    <SubDialog
                        size="sm"
                        title="Przywrócić domyślne bindy?"
                        onClose={() => setConfirm(null)}
                        footer={(
                            <>
                                <Button onClick={() => setConfirm(null)}>Anuluj</Button>
                                <Button variant="solid" onClick={() => { applyEdit(restoreDefaults(data)); setConfirm(null); }}>Przywróć</Button>
                            </>
                        )}
                    >
                        Standardowe bindy zostaną przywrócone do wartości domyślnych. Własne skróty pozostaną bez zmian.
                    </SubDialog>
                )}
            </div>
        </KeysContext.Provider>
    );
}
