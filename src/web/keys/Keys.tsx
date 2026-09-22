import { Fragment, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { ChevronDown, ChevronRight, Download, Globe, MoreHorizontal, Pencil, Plug, Plus, Search, X } from "lucide-react";
import { Button, DeleteButton, Input, Segmented } from "@web-ui/primitives/index.ts";
import type { BindSettings, Keymap } from "@modules/core/keymapTypes";
import {
    createKeymap,
    defaultBinds,
    deleteKeymap,
    getActiveKeymapId,
    getKeymapList,
    getKeymapStore,
    mergeBindSettings,
    renameKeymap,
    saveKeymapBinds,
    switchKeymap,
} from "@modules/core/keymapStorage";
import type { HelperConnection, HelperState } from "@modules/helper/HelperConnection";
import { loadBinds as loadHelperBinds, saveBinds as saveHelperBinds, toHelperBind, type StoredBind } from "@modules/helper/helperBinds";
import { usePopover } from "@web/layout/hooks/usePopover.ts";
import { MODAL_EVENT } from "@web/modals/appModal.ts";
import { getDownloadUrl } from "@web/helperDownload.ts";
import { isStandaloneWindow } from "@modules/helper/helperResync";
import SubDialog from "@web/SubDialog.tsx";
import MultibindImport from "@web/imports/MultibindImport.tsx";
import { KEYBOARD, KEYBOARD_HEIGHT, KEYBOARD_WIDTH, type KeyCap } from "./keyboardLayout";
import {
    BASE_LAYERS,
    FOCUS_HELPER_TARGET,
    GROUPS,
    MODIFIER_CODES,
    REACH_LABELS,
    SLOT_BY_PATH,
    bindOf,
    buildEntries,
    mergeEntries,
    comboId,
    comboInLayer,
    comboLabel,
    classifyKey,
    conflicts as findConflicts,
    entriesByCombo,
    entryWorks,
    freeKeysNear,
    fromHelperKey,
    isBrowserReserved,
    keyLabel,
    layerLabel,
    layerOf,
    matchesSearch,
    modeOfReach,
    sameCombo,
    toHelperKey,
    writeSlot,
    type Combo,
    type EntryRef,
    type Group,
    type KeyEntry,
    type Layer,
    type Reach,
} from "./keysModel";
import "./keys.css";

/** Window width steps: full keyboard, smaller keyboard, colour map, list only. */
type Size = "wide" | "medium" | "narrow" | "phone";

function sizeFor(width: number): Size {
    if (width >= 1120) return "wide";
    if (width >= 760) return "medium";
    if (width >= 480) return "narrow";
    return "phone";
}

/** What a capture assigns the next keystroke to. */
type CaptureTarget =
    | { kind: "entry"; entry: KeyEntry }
    /** A helper hotkey for a built-in bind (a second key), or the window-summoning one. */
    | { kind: "new-helper"; target: string; label: string }
    /** An own shortcut the helper hears; its command is typed in afterwards. */
    | { kind: "new-helper-command"; label: string };

interface Capture {
    target: CaptureTarget;
    /** The helper listens (it hears keys the browser keeps), or the page does. */
    via: "browser" | "helper";
}

const SAVE_DELAY = 400;

/** Empty own shortcuts (no key or no command) are kept on screen but never stored. */
function sanitize(binds: BindSettings): BindSettings {
    return { ...binds, custom: binds.custom.filter(b => b.command.trim() !== "" && b.key !== "") };
}

function bindsWord(n: number): string {
    return n >= 2 && n <= 4 ? `${n} bindy` : `${n} bindów`;
}

function groupOf(entries: readonly KeyEntry[]): Group | undefined {
    return entries[0]?.group;
}

interface KeysProps {
    helperConnection?: HelperConnection | null;
    /** Where the window's toolbar goes (the modal header); inline when absent. */
    headerSlot?: HTMLElement | null;
    /** Opens the multibind import; without it the import dialog opens inside this window. */
    onImport?: () => void;
}

export default function Keys({ helperConnection, headerSlot, onImport }: KeysProps) {
    const rootRef = useRef<HTMLDivElement>(null);

    // ── Keymap and binds ────────────────────────────────────────────────
    const [keymapList, setKeymapList] = useState<Keymap[]>([]);
    const [keymapId, setKeymapId] = useState("");
    const [binds, setBinds] = useState<BindSettings>(defaultBinds);
    const [helperBinds, setHelperBinds] = useState<StoredBind[]>(loadHelperBinds);

    const pending = useRef<{ id: string; binds: BindSettings } | null>(null);
    const saveTimer = useRef<number | undefined>(undefined);

    const helperTimer = useRef<number | undefined>(undefined);
    const pendingHelper = useRef<{ next: StoredBind[]; gone: StoredBind[] } | null>(null);
    const helperRef = useRef<HelperConnection | null>(null);
    helperRef.current = helperConnection ?? null;

    const flushHelper = useCallback(() => {
        window.clearTimeout(helperTimer.current);
        const p = pendingHelper.current;
        pendingHelper.current = null;
        if (!p) return;
        const helper = helperRef.current;
        if (helper?.getState() === "connected") {
            for (const b of p.gone) helper.send({ type: "unregister_bind", id: b.id });
            helper.send({ type: "register_binds", binds: p.next.map(toHelperBind) });
        }
        saveHelperBinds(p.next);
    }, []);

    const flush = useCallback(() => {
        window.clearTimeout(saveTimer.current);
        const p = pending.current;
        pending.current = null;
        if (p) saveKeymapBinds(p.id, sanitize(p.binds));
        flushHelper();
    }, [flushHelper]);

    const load = useCallback((id?: string) => {
        const list = getKeymapList();
        setKeymapList(list);
        const target = id || getActiveKeymapId();
        const keymap = getKeymapStore().keymaps[target] ?? list[0];
        setKeymapId(keymap?.id ?? "");
        setBinds(keymap ? mergeBindSettings(keymap.binds) : defaultBinds);
        setHelperBinds(loadHelperBinds());
    }, []);

    useEffect(() => {
        load();
        return flush;
    }, [load, flush]);

    /** Every change is stored straight away; typing in a command waits for a pause. */
    const commit = useCallback((next: BindSettings, debounce = false) => {
        setBinds(next);
        pending.current = { id: keymapId, binds: next };
        window.clearTimeout(saveTimer.current);
        if (debounce) saveTimer.current = window.setTimeout(flush, SAVE_DELAY);
        else flush();
    }, [keymapId, flush]);

    // Reload when the window opens (another device may have synced), store on close.
    useEffect(() => {
        const modal = rootRef.current?.closest(".app-modal");
        if (!modal) return;
        const onShow = () => load();
        modal.addEventListener(MODAL_EVENT.show, onShow);
        modal.addEventListener(MODAL_EVENT.hide, flush);
        return () => {
            modal.removeEventListener(MODAL_EVENT.show, onShow);
            modal.removeEventListener(MODAL_EVENT.hide, flush);
        };
    }, [load, flush]);

    // ── Helper ──────────────────────────────────────────────────────────
    const [helperState, setHelperState] = useState<HelperState>(() => helperConnection?.getState() ?? "disconnected");
    const [helperPlatform, setHelperPlatform] = useState<string | null>(null);
    const helperConnected = helperState === "connected";

    useEffect(() => {
        if (!helperConnection) return;
        const onState = (state: HelperState) => {
            setHelperState(state);
            if (state === "connected") helperConnection.probe().then(s => setHelperPlatform(s?.platform ?? null));
        };
        onState(helperConnection.getState());
        return helperConnection.onStateChange(onState);
    }, [helperConnection]);

    /** Stores the helper's hotkeys and re-registers them with it; typing waits for a pause. */
    const commitHelper = (next: StoredBind[], debounce = false) => {
        const gone = pendingHelper.current?.gone ?? [];
        pendingHelper.current = { next, gone: [...gone, ...helperBinds.filter(p => !next.some(n => n.id === p.id))] };
        setHelperBinds(next);
        window.clearTimeout(helperTimer.current);
        if (debounce) helperTimer.current = window.setTimeout(flushHelper, SAVE_DELAY);
        else flushHelper();
    };

    // ── Derived ─────────────────────────────────────────────────────────
    // One row per binding: a helper hotkey that only carries a binding outside
    // the client is folded into it, and shows up as its "gdzie działa".
    const merged = useMemo(() => mergeEntries(buildEntries(binds, helperBinds)), [binds, helperBinds]);
    const entries = merged.list;
    const focusEntry = merged.focus;
    const byCombo = useMemo(() => entriesByCombo(entries), [entries]);
    const conflictIds = useMemo(() => findConflicts(byCombo, helperConnected), [byCombo, helperConnected]);

    const layers = useMemo(() => {
        const extra = new Set<Layer>();
        for (const e of entries) if (e.combo && !BASE_LAYERS.includes(layerOf(e.combo))) extra.add(layerOf(e.combo));
        return [...BASE_LAYERS, ...[...extra].sort()];
    }, [entries]);

    // ── View state ──────────────────────────────────────────────────────
    const [size, setSize] = useState<Size>("wide");
    const [kbWidth, setKbWidth] = useState(0);
    const kbRef = useRef<HTMLDivElement>(null);
    const [layer, setLayer] = useState<Layer>("");
    const [selected, setSelected] = useState<string | null>(null);
    const [detailOpen, setDetailOpen] = useState(false);
    const [search, setSearch] = useState("");
    const [searchOpen, setSearchOpen] = useState(false);
    const [legendOpen, setLegendOpen] = useState(false);
    const [kbCollapsed, setKbCollapsed] = useState(false);
    const [listTab, setListTab] = useState<Group | "helper">("dir");
    const [expanded, setExpanded] = useState<Set<Group>>(new Set());
    const [capture, setCapture] = useState<Capture | null>(null);
    const [liveMods, setLiveMods] = useState<Pick<Combo, "ctrl" | "alt" | "shift">>({ ctrl: false, alt: false, shift: false });
    const [notice, setNotice] = useState<string | null>(null);
    const [renaming, setRenaming] = useState(false);
    const [nameDraft, setNameDraft] = useState("");
    const [confirm, setConfirm] = useState<"delete" | "restore" | null>(null);

    useLayoutEffect(() => {
        const root = rootRef.current;
        if (!root) return;
        // Measured here too, not only from the observer: a tab that is not being
        // rendered (opened in the background) never gets a resize callback, and
        // the keyboard would stay blank until it does.
        // A zero width means the window has not been laid out yet (it is still
        // hidden, or this is the first pass): measuring that would read as a
        // phone and stick, because a tab that is not being rendered never gets
        // a resize callback to correct it.
        const measure = () => {
            const width = root.clientWidth;
            if (width > 0) setSize(sizeFor(width));
            const board = kbRef.current?.clientWidth ?? 0;
            if (board > 0) setKbWidth(board);
        };
        measure();
        const observer = new ResizeObserver(measure);
        observer.observe(root);
        if (kbRef.current) observer.observe(kbRef.current);
        return () => observer.disconnect();
    }, [size, kbCollapsed]);

    useEffect(() => {
        if (!notice) return;
        const t = window.setTimeout(() => setNotice(null), 5000);
        return () => window.clearTimeout(t);
    }, [notice]);

    const selectCombo = (combo: Combo) => {
        setLayer(layerOf(combo));
        setSelected(comboId(combo));
        setDetailOpen(true);
    };

    // ── Editing ─────────────────────────────────────────────────────────

    const newHelperBind = (combo: Combo, action: Pick<StoredBind, "action" | "command" | "targetBind">, reach: Exclude<Reach, "client">): StoredBind | null => {
        const key = toHelperKey(combo);
        if (!key) {
            setNotice(`Helper nie obsługuje klawisza ${comboLabel(combo)}.`);
            return null;
        }
        const mode = modeOfReach(reach);
        return { id: `helper_${Date.now()}`, key, mode, focusBrowser: mode === "global_focus", ...action };
    };

    /**
     * Keeps a binding's helper twin on the same key as the binding, since the
     * two only make sense together. A key the helper cannot register (a numpad
     * key, say) means the binding simply stops working outside the client.
     */
    const followWithTwin = (twinId: string | undefined, combo: Combo | null, next: StoredBind[] = helperBinds): StoredBind[] | null => {
        if (!twinId) return null;
        const key = combo ? toHelperKey(combo) : null;
        if (!key) {
            if (combo) setNotice(`Helper nie obsługuje klawisza ${comboLabel(combo)}: „poza klientem” wyłączone.`);
            return next.filter(b => b.id !== twinId);
        }
        return next.map(b => b.id === twinId ? { ...b, key } : b);
    };

    /** Puts `entry` on `combo`, or clears its key when `combo` is null. */
    const assign = (entry: KeyEntry, combo: Combo | null) => {
        const ref = entry.ref;
        const reserved = combo ? isBrowserReserved(combo) : false;
        const twinFollow = followWithTwin(entry.twinId, combo);
        if (twinFollow) commitHelper(twinFollow);
        if (ref.kind === "helper") {
            if (!combo) {
                commitHelper(helperBinds.filter(b => b.id !== ref.id));
                return;
            }
            const key = toHelperKey(combo);
            if (!key) {
                setNotice(`Helper nie obsługuje klawisza ${comboLabel(combo)}.`);
                return;
            }
            commitHelper(helperBinds.map(b => b.id === ref.id ? { ...b, key } : b));
        } else if (ref.kind === "custom") {
            const own = binds.custom[ref.index];
            if (combo && reserved) {
                // The page never hears this key: hand the shortcut to the helper.
                const hb = newHelperBind(combo, { action: "command", command: own.command }, "helper");
                if (!hb) return;
                commit({ ...binds, custom: binds.custom.filter((_, i) => i !== ref.index) });
                commitHelper([...helperBinds, hb]);
            } else {
                const custom = binds.custom.map((b, i) => i === ref.index
                    ? { command: b.command, ...(combo ? bindOf(combo) : { key: "" }) }
                    : b);
                commit({ ...binds, custom });
            }
        } else {
            const slot = SLOT_BY_PATH.get(ref.path);
            if (combo && reserved) {
                if (!slot?.helperId) {
                    setNotice(`${comboLabel(combo)} zajmuje przeglądarka, a tej funkcji helper nie obsłuży.`);
                    return;
                }
                const hb = newHelperBind(combo, { action: "bind", targetBind: slot.helperId }, "helper");
                if (hb) {
                    commitHelper([...helperBinds, hb]);
                    setNotice(`${comboLabel(combo)} zajmuje przeglądarka: dodany jako drugi klawisz przez helpera.`);
                }
                return;
            }
            commit(writeSlot(binds, ref.path, combo ? bindOf(combo) : undefined));
        }
    };

    const finishCapture = (combo: Combo | null) => {
        const c = capture;
        setCapture(null);
        if (!c) return;
        if (c.target.kind === "entry") {
            assign(c.target.entry, combo);
        } else if (combo) {
            const reach: Exclude<Reach, "client"> = c.target.kind === "new-helper" && c.target.target === FOCUS_HELPER_TARGET
                ? "global_focus"
                : isBrowserReserved(combo) ? "helper" : "global";
            const action: Pick<StoredBind, "action" | "command" | "targetBind"> = c.target.kind === "new-helper"
                ? { action: "bind", targetBind: c.target.target }
                : { action: "command", command: "" };
            const hb = newHelperBind(combo, action, reach);
            if (hb) {
                if (c.target.kind === "new-helper-command") newRowRef.current = `helper:${hb.id}`;
                commitHelper([...helperBinds, hb]);
            }
        }
        if (combo) {
            setLayer(layerOf(combo));
            setSelected(comboId(combo));
        }
    };

    const finishRef = useRef(finishCapture);
    finishRef.current = finishCapture;

    const startCapture = (target: CaptureTarget) => {
        const helperEntry = target.kind !== "entry" || target.entry.ref.kind === "helper";
        const via = helperEntry && helperConnected ? "helper" : "browser";
        setLiveMods({ ctrl: false, alt: false, shift: false });
        setCapture({ target, via });
        if (via === "helper") helperConnection?.send({ type: "start_capture" });
    };

    // The page listens: first in line, so no game bind or dialog sees the key.
    useEffect(() => {
        if (!capture || capture.via !== "browser") return;
        const onKey = (ev: KeyboardEvent) => {
            ev.preventDefault();
            ev.stopImmediatePropagation();
            setLiveMods({ ctrl: ev.ctrlKey, alt: ev.altKey, shift: ev.shiftKey });
            if (MODIFIER_CODES.has(ev.code) || !ev.code) return;
            const bare = !ev.ctrlKey && !ev.altKey && !ev.shiftKey;
            if (bare && ev.code === "Escape") {
                setCapture(null);
                return;
            }
            if (bare && ev.code === "Backspace") {
                finishRef.current(null);
                return;
            }
            finishRef.current({ code: ev.code, ctrl: ev.ctrlKey, alt: ev.altKey, shift: ev.shiftKey });
        };
        const onKeyUp = (ev: KeyboardEvent) => setLiveMods({ ctrl: ev.ctrlKey, alt: ev.altKey, shift: ev.shiftKey });
        window.addEventListener("keydown", onKey, true);
        window.addEventListener("keyup", onKeyUp, true);
        return () => {
            window.removeEventListener("keydown", onKey, true);
            window.removeEventListener("keyup", onKeyUp, true);
        };
    }, [capture]);

    // The helper listens: it hears keys the browser keeps (Ctrl+W).
    useEffect(() => {
        if (!capture || capture.via !== "helper" || !helperConnection) return;
        return helperConnection.onKeyCaptured(msg => {
            if (!msg.key) {
                setCapture(null);
                return;
            }
            const combo = fromHelperKey(msg.key);
            if (combo) finishRef.current(combo);
            else {
                setCapture(null);
                setNotice(`Nieznany klawisz: ${msg.key}`);
            }
        });
    }, [capture, helperConnection]);

    /**
     * Where a binding works — the one setting behind all of this.
     *
     * "w kliencie" is the client's own bind and nothing else. The other two add
     * a helper hotkey on the *same* key, aimed at the same thing, which is what
     * lets it fire outside the client; going back removes it again. A binding
     * whose key the browser keeps has no client side at all, so it lives in the
     * helper alone and only moves between its two helper modes.
     */
    const setReach = (entry: KeyEntry, reach: Reach) => {
        if (!entry.combo || entry.reach === reach) return;
        const ref = entry.ref;

        // A helper-only binding (a key the browser keeps, or a second key).
        if (ref.kind === "helper") {
            if (reach === "client") return;
            const mode = modeOfReach(reach);
            commitHelper(helperBinds.map(b => b.id === ref.id ? { ...b, mode, focusBrowser: mode === "global_focus" } : b));
            return;
        }

        if (reach === "client") {
            if (entry.twinId) commitHelper(helperBinds.filter(b => b.id !== entry.twinId));
            return;
        }

        const action: Pick<StoredBind, "action" | "command" | "targetBind"> = ref.kind === "custom"
            ? { action: "command", command: entry.command ?? "" }
            : { action: "bind", targetBind: SLOT_BY_PATH.get(ref.path)?.helperId };
        if (action.action === "bind" && !action.targetBind) {
            setNotice(`Helper nie obsługuje funkcji „${entry.label}”.`);
            return;
        }
        const mode = modeOfReach(reach);
        if (entry.twinId) {
            commitHelper(helperBinds.map(b => b.id === entry.twinId ? { ...b, mode, focusBrowser: mode === "global_focus" } : b));
            return;
        }
        const hb = newHelperBind(entry.combo, action, reach);
        if (hb) commitHelper([...helperBinds, hb]);
    };

    const removeEntry = (entry: KeyEntry) => {
        const ref = entry.ref;
        if (entry.twinId) commitHelper(helperBinds.filter(b => b.id !== entry.twinId));
        if (ref.kind === "custom") commit({ ...binds, custom: binds.custom.filter((_, i) => i !== ref.index) });
        else if (ref.kind === "helper") commitHelper(helperBinds.filter(b => b.id !== ref.id));
        else assign(entry, null);
    };


    // ── Keymaps ─────────────────────────────────────────────────────────

    const handleKeymapSwitch = (id: string) => {
        flush();
        switchKeymap(id);
        load(id);
    };

    const handleCreateKeymap = () => {
        flush();
        const created = createKeymap("Nowa mapa klawiszy", sanitize(binds));
        switchKeymap(created.id);
        load(created.id);
        setNameDraft(created.name);
        setRenaming(true);
    };

    const startRename = () => {
        setNameDraft(keymapList.find(k => k.id === keymapId)?.name ?? "");
        setRenaming(true);
    };

    const finishRename = () => {
        if (nameDraft.trim()) renameKeymap(keymapId, nameDraft.trim());
        setRenaming(false);
        setKeymapList(getKeymapList());
    };

    const handleDelete = () => {
        flush();
        if (deleteKeymap(keymapId)) load();
        setConfirm(null);
    };

    const handleRestore = () => {
        const restored: BindSettings = { ...structuredClone(defaultBinds), custom: binds.custom };
        delete restored.mainGates;
        delete restored.mainTransport;
        delete restored.mainLoot;
        commit(restored);
        setConfirm(null);
    };

    const importMultibinds = () => {
        if (onImport) onImport();
        else window.dispatchEvent(new Event("binds-open-import"));
    };

    // ── Pieces ──────────────────────────────────────────────────────────

    const capturingId = capture?.target.kind === "entry" ? capture.target.entry.id : null;
    const searching = search.trim() !== "";

    const layerCount = (l: Layer) => entries.filter(e => e.combo && layerOf(e.combo) === l).length;

    /** A binding's key as a keycap button; pressing it waits for the new key. */
    const kc = (entry: KeyEntry, compact = false) => {
        const capturing = capturingId === entry.id;
        const conflict = entry.combo && classifyKey(byCombo.get(comboId(entry.combo)) ?? [], helperConnected).conflict;
        let text: string;
        if (capturing) text = "naciśnij…";
        else if (entry.combo) text = comboLabel(entry.combo);
        else if (entry.inherits) text = compact ? "jak Funkc." : "jak Funkcyjny";
        else text = "brak";
        const cls = ["keys-kc", capturing && "is-capturing", !entry.combo && !capturing && "is-none", conflict && !capturing && "is-conflict"]
            .filter(Boolean).join(" ");
        return (
            <button
                type="button"
                className={cls}
                data-entry={entry.id}
                title={capturing ? "Esc anuluje · Backspace czyści" : `Zmień klawisz: ${entry.label}`}
                onClick={() => capturing ? setCapture(null) : startCapture({ kind: "entry", entry })}
            >
                {text}
            </button>
        );
    };

    const entry = (id: string) => entries.find(e => e.id === id)!;
    const visible = (e: KeyEntry) => matchesSearch(e, search);

    /** Where a binding is heard, when it is not simply the client. */
    const reachBadge = (e: KeyEntry) => {
        if (e.reach === "client") return null;
        const title = `${e.label}: ${REACH_LABELS[e.reach]}`;
        return e.reach === "helper"
            ? <Plug size={12} className="keys-helper-icon" aria-label={title}><title>{title}</title></Plug>
            : <Globe size={12} className="keys-global-icon" aria-label={title}><title>{title}</title></Globe>;
    };

    /** Clicking a binding's name selects its key, where it can be sent through the helper. */
    const selectEntry = (e: KeyEntry) => {
        if (e.combo) selectCombo(e.combo);
    };

    const row = (e: KeyEntry, dimLabel = false) => {
        return (
            <div
                className={`keys-row${e.combo ? " is-pickable" : ""}${visible(e) ? "" : " is-hidden"}`}
                data-bind={e.id}
                title={e.combo ? `Pokaż klawisz ${comboLabel(e.combo)}` : undefined}
                onClick={() => selectEntry(e)}
            >
                <span className={`keys-row__label${dimLabel ? " is-dim" : ""}`}>
                    {e.label}
                    {reachBadge(e)}
                </span>
                {kc(e)}
            </div>
        );
    };

    const sectionHead = (group: Group | "helper", extra?: ReactNode, count?: number) => (
        <div className="keys-section__head">
            {group === "helper"
                ? <Plug size={13} strokeWidth={2.2} className="keys-helper-icon" />
                : <span className="keys-dot" data-group={group} />}
            <span className="keys-cap">{group === "helper" ? "Obsługiwane przez helpera" : GROUPS.find(g => g.id === group)!.label}</span>
            {count !== undefined && <span className="keys-chip">{count}</span>}
            <span className="keys-spacer" />
            {extra}
        </div>
    );

    const basicIds = ["main", "mainGates", "mainTransport", "mainLoot", "attack", "support", "lamp", "moveMode", "roomBind", "drinkable", "gateBind", "doubleK"];
    const basicSection = () => {
        const all = basicIds.map(p => entry(`slot:${p}`));
        const limit = size === "phone" && !expanded.has("basic") && !searching ? 3 : all.length;
        return (
            <section className="keys-section" data-section="basic">
                {sectionHead("basic", undefined, size === "phone" ? all.length : undefined)}
                {all.slice(0, limit).map(e => <Fragment key={e.id}>{row(e, !!SLOT_BY_PATH.get((e.ref as { path: string }).path)?.inherits)}</Fragment>)}
                {limit < all.length && (
                    <button type="button" className="keys-add" onClick={() => setExpanded(new Set([...expanded, "basic"]))}>
                        Pokaż wszystkie {all.length}<ChevronDown size={14} />
                    </button>
                )}
            </section>
        );
    };

    const enemySection = () => (
        <section className="keys-section" data-section="enemy">
            {sectionHead("enemy", <span className="keys-muted">atakuj · blokuj</span>)}
            {[0, 1, 2].map(i => {
                const attack = entry(`slot:enemy[${i}]`);
                const block = entry(`slot:enemyBlock[${i}]`);
                const shown = visible(attack) || visible(block);
                return (
                    <div
                        key={i}
                        className={`keys-row is-pickable${shown ? "" : " is-hidden"}`}
                        data-bind={attack.id}
                        onClick={() => selectEntry(attack)}
                    >
                        <span className="keys-row__label">
                            Wróg {i + 1}
                            {reachBadge(attack)}
                        </span>
                        {kc(attack)}
                        {kc(block)}
                    </div>
                );
            })}
        </section>
    );

    const tempSection = () => (
        <section className="keys-section" data-section="temp">
            {sectionHead("temp")}
            {[0, 1].map(i => <Fragment key={i}>{row(entry(`slot:temp[${i}]`))}</Fragment>)}
        </section>
    );

    const dirSection = () => (
        <section className="keys-section" data-section="dir">
            {sectionHead("dir")}
            <div className="keys-compass">
                {(["nw", "n", "ne", "w", "zerknij", "e", "sw", "s", "se"] as const).map(d => {
                    const e = entry(`slot:directions.${d}`);
                    return (
                        <div key={d} className={`keys-compass__cell${visible(e) ? "" : " is-hidden"}`} data-bind={e.id}>
                            <span className="keys-muted">{e.label}</span>
                            {kc(e, true)}
                        </div>
                    );
                })}
            </div>
            <div className="keys-compass keys-compass--extra">
                {(["u", "d", "special"] as const).map(d => {
                    const e = entry(`slot:directions.${d}`);
                    return (
                        <div key={d} className={`keys-compass__cell${visible(e) ? "" : " is-hidden"}`} data-bind={e.id}>
                            <span className="keys-muted">{e.label}</span>
                            {kc(e, true)}
                        </div>
                    );
                })}
            </div>
        </section>
    );

    // Own shortcuts, whether the page hears them or the helper does: a shortcut
    // on a key the browser keeps is still an own shortcut, just heard elsewhere.
    const ownEntries = entries.filter(e => e.group === "own");

    /** The row just added, so its command field takes the caret. */
    const newRowRef = useRef<string | null>(null);
    const isNewRow = (e: KeyEntry) => newRowRef.current === e.id;

    const commandOf = (e: KeyEntry) => e.ref.kind === "custom"
        ? binds.custom[e.ref.index]?.command ?? ""
        : helperBinds.find(b => b.id === (e.ref as Extract<EntryRef, { kind: "helper" }>).id)?.command ?? "";

    /** Typing in a row's field: the twin follows, so both halves stay one binding. */
    const editCommand = (e: KeyEntry, command: string) => {
        if (e.ref.kind === "custom") {
            const index = e.ref.index;
            commit({ ...binds, custom: binds.custom.map((b, i) => i === index ? { ...b, command } : b) }, true);
        }
        const helperId = e.ref.kind === "helper" ? e.ref.id : e.twinId;
        if (helperId) commitHelper(helperBinds.map(b => b.id === helperId ? { ...b, command } : b), true);
    };

    /**
     * Adds an own shortcut of one of the two flavours. The client's own can be
     * typed straight away and given a key after; the helper's needs the key
     * first, since a hotkey is registered by its key.
     */
    const addOwnCommand = (reach: Reach, combo?: Combo) => {
        setListTab("own");
        if (reach === "client") {
            newRowRef.current = `custom:${binds.custom.length}`;
            commit({ ...binds, custom: [...binds.custom, { command: "", ...(combo ? bindOf(combo) : { key: "" }) }] });
            return;
        }
        // A key already in hand (picked on the drawing) needs no capture.
        if (combo) {
            const hb = newHelperBind(combo, { action: "command", command: "" }, reach);
            if (hb) {
                newRowRef.current = `helper:${hb.id}`;
                commitHelper([...helperBinds, hb]);
            }
            return;
        }
        startCapture({ kind: "new-helper-command", label: "Skrót przez helpera" });
    };
    const ownSection = () => (
        <section className="keys-section" data-section="own">
            {sectionHead("own", undefined, ownEntries.length)}
            {ownEntries.length === 0 && <p className="keys-muted keys-empty">Brak własnych skrótów.</p>}
            {ownEntries.map(e => (
                <div
                    key={e.id}
                    className={`keys-row keys-row--own${e.combo ? " is-pickable" : ""}${visible(e) ? "" : " is-hidden"}`}
                    data-bind={e.id}
                    onClick={() => selectEntry(e)}
                >
                    {kc(e)}
                    <Input
                        mono
                        className="keys-command"
                        placeholder="Komenda"
                        value={commandOf(e)}
                        onClick={ev => ev.stopPropagation()}
                        onChange={ev => editCommand(e, ev.target.value)}
                        ref={el => {
                            if (el && isNewRow(e)) {
                                newRowRef.current = null;
                                el.focus();
                                el.scrollIntoView({ block: "nearest" });
                            }
                        }}
                    />
                    {reachBadge(e)}
                    {/* The command field covers most of the row and keeps its own
                        clicks, so this is the dependable way to open the panel. */}
                    <Button
                        size="sm"
                        variant="ghost"
                        className="popup-btn--icon"
                        title="Pokaż klawisz i gdzie działa"
                        disabled={!e.combo}
                        onClick={ev => { ev.stopPropagation(); selectEntry(e); }}
                    >
                        <Pencil size={15} strokeWidth={1.75} />
                    </Button>
                    <DeleteButton onClick={ev => { ev.stopPropagation(); removeEntry(e); }} />
                </div>
            ))}
            <div className="keys-adds">
                <button type="button" className="keys-add" onClick={() => addOwnCommand("client")}>
                    <Plus size={14} strokeWidth={2.2} />Komenda
                </button>
                <button
                    type="button"
                    className="keys-add"
                    title="Skrót, którego słucha helper — działa też poza klientem"
                    onClick={() => addOwnCommand("global")}
                >
                    <Plus size={14} strokeWidth={2.2} />Komenda przez helpera<Globe size={12} className="keys-global-icon" />
                </button>
            </div>
        </section>
    );

    const notWorking = entries.filter(e => e.reach !== "client" && !helperConnected).length;
    const download = getDownloadUrl();

    /** The helper block is about the helper itself; the bindings live in the lists. */
    const helperSection = () => (
        <section className="keys-section keys-helper" data-section="helper">
            <div className="keys-helper__status">
                {helperConnected ? (
                    <div className="keys-helper__box is-ok">
                        <Plug size={15} />
                        <span>Helper połączony{helperPlatform ? ` · ${helperPlatform}` : ""}. Skróty oznaczone <Globe size={12} className="keys-global-icon" /> działają w każdym oknie.</span>
                    </div>
                ) : (
                    <div className="keys-helper__box">
                        <Plug size={15} />
                        <span>
                            Helper niepołączony.
                            {notWorking > 0 && <span className="keys-dim"> {notWorking} {notWorking === 1 ? "skrót działa tylko w kliencie" : "skróty działają tylko w kliencie"}.</span>}
                        </span>
                        {helperConnection && (
                            <Button size="sm" onClick={() => helperState === "disconnected" ? helperConnection.launch() : undefined} disabled={helperState === "connecting"}>
                                {helperState === "connecting" ? "Łączenie…" : "Uruchom"}
                            </Button>
                        )}
                    </div>
                )}
                <div className="keys-row keys-row--focus">
                    <span className="keys-row__label">Przywołaj okno klienta</span>
                    {focusEntry
                        ? <>{kc(focusEntry)}<DeleteButton onClick={() => removeEntry(focusEntry)} /></>
                        : (
                            <button
                                type="button"
                                className="keys-add"
                                onClick={() => startCapture({ kind: "new-helper", target: FOCUS_HELPER_TARGET, label: "Przywołaj okno klienta" })}
                            >
                                <Plus size={14} strokeWidth={2.2} />Nadaj klawisz
                            </button>
                        )}
                </div>
            </div>
            <div className="keys-helper__notes">
                <p className="keys-dim">
                    Helper słyszy klawisze także poza klientem i te, których przeglądarka nie oddaje (na rysunku kreskowane).
                    Zaznacz klawisz i wybierz „gdzie działa”.
                </p>
                {!helperConnected && download && (
                    <a className="keys-link" href={download.url} download>
                        Pobierz helpera — {download.label}<Download size={13} />
                    </a>
                )}
                <p className="keys-muted keys-helper__platforms">
                    Windows: wszystko · macOS: wymaga uprawnienia Dostępność · Linux: X11 z xdotool lub wmctrl, bez Waylanda
                </p>
                <p className="keys-muted keys-helper__platforms">
                    {isStandaloneWindow()
                        ? "„Wszędzie + okno” przywołuje okno klienta — masz je osobno, więc trafia prosto w grę."
                        : "„Wszędzie + okno” przywołuje okno przeglądarki i działa, gdy klient jest w nim aktywną kartą: przeglądarka nie pozwala przełączać kart z zewnątrz. Zainstaluj klienta jako aplikację (menu przeglądarki → Zainstaluj), a dostanie własne okno i przywołanie zawsze trafi w grę."}
                </p>
            </div>
        </section>
    );


    const sections: Record<Group | "helper", () => ReactNode> = {
        basic: basicSection, enemy: enemySection, temp: tempSection, dir: dirSection, own: ownSection, helper: helperSection,
    };

    // ── Keyboard ────────────────────────────────────────────────────────

    const boardHeight = (kbWidth / KEYBOARD_WIDTH) * KEYBOARD_HEIGHT;

    const keyCell = (cap: KeyCap, mini: boolean) => {
        const combo = comboInLayer(cap.code, layer);
        const id = comboId(combo);
        const list = cap.inert ? [] : byCombo.get(id) ?? [];
        const reserved = !cap.inert && isBrowserReserved(combo);
        const state = classifyKey(list, helperConnected);
        const conflict = state.conflict;
        const group = groupOf(state.active.length ? state.active : list);
        const dimmed = searching && !list.some(visible);
        const helperIcon = list.some(e => e.reach === "helper");
        const globalIcon = list.some(e => e.reach === "global" || e.reach === "global_focus");
        // The key being re-bound blinks along with its keycap in the list.
        const capturingThis = capture?.target.kind === "entry" && sameCombo(capture.target.entry.combo, combo);
        const cls = [
            "keys-key",
            cap.inert && "is-inert",
            list.length && "is-bound",
            conflict && "is-conflict",
            reserved && "is-reserved",
            selected === id && "is-selected",
            dimmed && "is-dimmed",
            capturingThis && "is-capturing-target",
        ].filter(Boolean).join(" ");
        const u = kbWidth / KEYBOARD_WIDTH;
        const style: CSSProperties = {
            left: cap.x * u,
            top: cap.y * u,
            width: (cap.w ?? 1) * u - (mini ? 2 : 4),
            height: (cap.h ?? 1) * u - (mini ? 2 : 4),
        };
        // A key the helper takes over still names its one function, not "2 bindy".
        const label = conflict ? bindsWord(state.active.length) : (state.active[0] ?? list[0])?.short;
        const onClick = () => {
            if (cap.inert) return;
            if (capture) {
                finishCapture(combo);
                return;
            }
            setSelected(id);
            // On the colour map a key with one binding jumps to it in the list.
            const only = mini && list.length === 1 ? list[0] : null;
            const target = only
                ? rootRef.current?.querySelector(`[data-bind="${only.id}"]`)
                    ?? rootRef.current?.querySelector(`[data-section="${only.ref.kind === "helper" ? "helper" : only.group}"]`)
                : null;
            if (target) target.scrollIntoView({ block: "center", behavior: "smooth" });
            else setDetailOpen(true);
        };
        return (
            <button
                key={cap.code}
                type="button"
                className={cls}
                style={style}
                data-code={cap.code}
                data-group={group}
                disabled={cap.inert}
                title={cap.inert ? undefined : `${comboLabel(combo)}${list.length ? `: ${list.map(e => e.label).join(", ")}` : ""}`}
                onClick={onClick}
            >
                {!mini && <span className="keys-key__cap">{keyLabel(cap.code)}</span>}
                {!mini && label && <span className="keys-key__fn">{label}</span>}
                {!mini && (helperIcon || globalIcon) && (
                    <span className="keys-key__badge">{globalIcon ? <Globe size={10} /> : <Plug size={10} />}</span>
                )}
            </button>
        );
    };

    const keyboard = (mini: boolean) => (
        <div className={`keys-board${mini ? " keys-board--mini" : ""}${capture ? " is-capturing" : ""}`} ref={kbRef}>
            {/* The height comes from the aspect ratio in CSS, not from the measured
                width: the board must hold its place on the very first paint, or the
                window jumps the moment the keys arrive. */}
            <div className="keys-board__inner">
                {kbWidth > 0 && KEYBOARD.map(cap => keyCell(cap, mini))}
            </div>
        </div>
    );

    const legend = (withReserved: boolean) => (
        <div className="keys-legend">
            {GROUPS.map(g => (
                <span key={g.id} className="keys-legend__item"><span className="keys-dot" data-group={g.id} />{g.label}</span>
            ))}
            {withReserved && (
                <>
                    <span className="keys-legend__item"><span className="keys-legend__hatch" />Zajęte przez przeglądarkę</span>
                    <span className="keys-legend__item"><Plug size={12} className="keys-helper-icon" />Przez helpera</span>
                    <span className="keys-legend__item"><Globe size={12} className="keys-global-icon" />Działa wszędzie</span>
                </>
            )}
        </div>
    );

    // ── Selected key ────────────────────────────────────────────────────

    const selectedCombo: Combo | null = useMemo(() => {
        if (!selected) return null;
        const parts = selected.split("+");
        const code = parts.pop()!;
        return comboInLayer(code, parts.join("+"));
    }, [selected]);

    const helperIdOf = (e: KeyEntry) => e.ref.kind === "slot" ? SLOT_BY_PATH.get(e.ref.path)?.helperId : undefined;

    const detail = () => {
        if (!selectedCombo) {
            return (
                <div className="keys-detail keys-detail--empty">
                    <p className="keys-dim">Wybierz klawisz na rysunku, by zobaczyć, co robi, albo coś mu przypisać.</p>
                    <p className="keys-muted">Kliknij klawisz na liście poniżej i naciśnij nowy, by go zmienić.</p>
                </div>
            );
        }
        const list = byCombo.get(comboId(selectedCombo)) ?? [];
        const state = classifyKey(list, helperConnected);
        const reserved = isBrowserReserved(selectedCombo);
        const layerText = layerOf(selectedCombo) ? layerLabel(layerOf(selectedCombo)) : "bez modyfikatora";
        const single = list.length === 1 ? list[0] : null;
        const title = single ? single.label : state.conflict ? `${state.active.length} przypisania` : list.length > 1 ? state.active[0]?.label ?? "" : "Wolny klawisz";
        return (
            <div className="keys-detail">
                <div className="keys-detail__head">
                    <span className={`keys-kc keys-kc--big${state.conflict ? " is-conflict" : ""}`}>{comboLabel(selectedCombo)}</span>
                    <div className="keys-detail__title">
                        <span>{title}</span>
                        {/* What the binding is and where it works is spelled out in the
                            row below; repeating it here only moved the panel about. */}
                        {list.length === 0 && <span className="keys-muted">{layerText}</span>}
                    </div>
                    <span className="keys-spacer" />
                    {state.conflict && <span className="keys-chip is-danger">konflikt</span>}
                    {!state.conflict && state.shadowed.length > 0 && (
                        <span className="keys-chip is-ok"><Plug size={12} />przez helpera</span>
                    )}
                    {size !== "wide" && (
                        <button type="button" className="keys-ib" title="Zamknij" onClick={() => setDetailOpen(false)}><X size={15} /></button>
                    )}
                </div>
                {reserved && (
                    <p className="keys-dim">
                        W przeglądarce ten skrót jest zajęty ({comboLabel(selectedCombo)} {selectedCombo.code === "KeyW" ? "zamyka kartę" : "robi coś w przeglądarce"}).
                        Helper przechwytuje go wcześniej.
                    </p>
                )}
                {state.conflict && (
                    <p className="keys-dim">Kilka przypisań na jednym klawiszu: naciśnięcie uruchomi wszystkie naraz.</p>
                )}
                {!state.conflict && state.shadowed.length > 0 && (
                    <p className="keys-dim">
                        {state.helperTakesOver
                            ? "Helper przechwytuje ten klawisz, zanim dotrze do przeglądarki — działa ta sama funkcja, tylko wszędzie."
                            : "Gdy helper się połączy, przejmie ten klawisz i będzie działał także poza klientem."}
                    </p>
                )}
                {list.length > 0 && (
                    <div className="keys-acts">
                        {list.map(e => {
                            const shadowed = state.shadowed.includes(e);
                            const works = !shadowed && entryWorks(e, helperConnected);
                            const note = shadowed
                                ? (state.helperTakesOver ? "teraz obsługuje to helper" : "zadziała, gdy helper nie działa")
                                : works ? REACH_LABELS[e.reach] : "nie działa";
                            return (
                                <div key={e.id} className={`keys-act${shadowed ? " is-shadowed" : ""}`}>
                                    <span className="keys-dot" data-group={e.group} />
                                    <div className="keys-act__text">
                                        <span className={e.command !== undefined ? "keys-mono" : undefined}>{e.label}</span>
                                        <span className={works || shadowed ? "keys-muted" : "keys-danger"}>
                                            {e.ref.kind === "slot" ? "wbudowane" : e.ref.kind === "custom" ? "własny" : "helper"} · {note}
                                        </span>
                                    </div>
                                    <Button size="sm" onClick={() => startCapture({ kind: "entry", entry: e })}>
                                        {capturingId === e.id ? "naciśnij…" : "Zmień klawisz"}
                                    </Button>
                                    {/* A built-in bind cannot be deleted, but it can be left
                                        without a key; an own shortcut goes altogether. */}
                                    <DeleteButton
                                        title={e.ref.kind === "slot" ? "Zdejmij klawisz" : "Usuń skrót"}
                                        onClick={() => removeEntry(e)}
                                    />
                                </div>
                            );
                        })}
                    </div>
                )}
                {state.conflict && (() => {
                    const last = state.active[state.active.length - 1];
                    const free = freeKeysNear(selectedCombo, byCombo);
                    if (!free.length) return null;
                    return (
                        <div className="keys-detail__free">
                            <span className="keys-muted">Wolne w pobliżu, kliknij, by przenieść „{last.label}”:</span>
                            <div className="keys-detail__keys">
                                {free.map(c => (
                                    <button key={comboId(c)} type="button" className="keys-kc" onClick={() => { assign(last, c); selectCombo(c); }}>
                                        {comboLabel(c)}
                                    </button>
                                ))}
                            </div>
                        </div>
                    );
                })()}
                {single && reachChoice(single)}
                {single && single.ref.kind === "slot" && helperIdOf(single) && (
                    <button
                        type="button"
                        className="keys-add"
                        onClick={() => startCapture({ kind: "new-helper", target: helperIdOf(single)!, label: single.label })}
                    >
                        <Plus size={14} strokeWidth={2.2} />Drugi klawisz przez helpera (np. globalny)
                    </button>
                )}
                {list.length === 0 && (
                    <button
                        type="button"
                        className="keys-add"
                        onClick={() => addOwnCommand(reserved ? "helper" : "client", selectedCombo)}
                    >
                        <Plus size={14} strokeWidth={2.2} />Przypisz komendę
                    </button>
                )}
            </div>
        );
    };

    const reachChoice = (e: KeyEntry) => {
        const reserved = !!e.combo && isBrowserReserved(e.combo);
        const helperOk = !!e.combo && toHelperKey(e.combo) !== null;
        const isBindAction = e.targetLabel !== undefined || (e.ref.kind === "helper" && e.command === undefined);
        const options: { reach: Reach; short: string; hint: string; disabled: boolean }[] = [
            {
                reach: "client", short: "w kliencie",
                hint: reserved ? "ten klawisz zajmuje przeglądarka" : isBindAction ? "drugi klawisz działa tylko przez helpera" : "gdy okno klienta jest aktywne",
                disabled: reserved || isBindAction,
            },
            { reach: "helper", short: "przez helpera", hint: "gdy okno klienta jest aktywne, klawisz łapie helper", disabled: !helperOk },
            { reach: "global", short: "wszędzie", hint: "także gdy grasz w innym oknie", disabled: !helperOk },
        ];
        const current: Reach = e.reach === "global_focus" ? "global" : e.reach;
        // One row of choices instead of three stacked cards: the panel has to fit
        // beside the keyboard without scrolling.
        const offered = options.filter(o => !o.disabled || o.reach === current);
        return (
            <div className="keys-reach">
                <span className="keys-cap">Gdzie działa</span>
                <Segmented
                    name={`reach-${e.id}`}
                    value={current}
                    onChange={(r: Reach) => setReach(e, r)}
                    options={offered.map(o => ({
                        value: o.reach,
                        label: (
                            <>
                                {o.short}
                                {o.reach === "helper" && <Plug size={11} className="keys-helper-icon" />}
                                {o.reach === "global" && <Globe size={11} className="keys-global-icon" />}
                            </>
                        ),
                    }))}
                />
                {current === "global" && (
                    <label className="keys-reach__focus">
                        <input
                            type="checkbox"
                            checked={e.reach === "global_focus"}
                            onChange={ev => setReach(e, ev.target.checked ? "global_focus" : "global")}
                        />
                        i przywołaj okno klienta
                    </label>
                )}
                <p className="keys-muted">{options.find(o => o.reach === current)?.hint}</p>
                {!helperOk && <p className="keys-muted">Helper nie obsługuje tego klawisza.</p>}
            </div>
        );
    };


    // ── Toolbar ─────────────────────────────────────────────────────────

    const more = usePopover({ width: 240 });
    const moreItems: { label: string; onSelect: () => void; disabled?: boolean; danger?: boolean }[] = [
        { label: "Zmień nazwę mapy", onSelect: startRename },
        ...(size === "wide" ? [] : [{ label: "Nowa mapa", onSelect: handleCreateKeymap }]),
        { label: "Importuj bazę multibindów…", onSelect: importMultibinds },
        { label: "Przywróć domyślne", onSelect: () => setConfirm("restore") },
        { label: "Usuń mapę klawiszy", onSelect: () => setConfirm("delete"), disabled: keymapList.length <= 1, danger: true },
    ];

    const helperChip = helperConnection ? (
        <button
            type="button"
            className={`keys-chip keys-chip--button${helperConnected ? " is-ok" : ""}`}
            title={helperConnected ? "Helper połączony" : "Helper niepołączony: kliknij, by uruchomić"}
            onClick={() => { if (helperState === "disconnected") helperConnection.launch(); }}
        >
            <Plug size={12} />
            {size === "wide" ? (helperConnected ? `Helper połączony${helperPlatform ? ` · ${helperPlatform}` : ""}` : "Helper niepołączony") : "Helper"}
        </button>
    ) : null;

    const toolbar = (
        <div className="keys-toolbar">
            {size !== "phone" && size !== "narrow" && <span className="keys-muted">Mapa</span>}
            {renaming ? (
                <Input
                    mono
                    className="keys-toolbar__name"
                    value={nameDraft}
                    onChange={ev => setNameDraft(ev.target.value)}
                    onBlur={finishRename}
                    onKeyDown={ev => {
                        if (ev.key === "Enter") finishRename();
                        else if (ev.key === "Escape") setRenaming(false);
                    }}
                    data-dialog-escape="local"
                    autoFocus
                />
            ) : (
                <select
                    id="binds-keymap-select"
                    className="popup-input popup-input--control keys-toolbar__map"
                    value={keymapId}
                    onChange={ev => handleKeymapSwitch(ev.target.value)}
                >
                    {keymapList.map(k => <option key={k.id} value={k.id}>{k.name}</option>)}
                </select>
            )}
            <span className="keys-spacer" />
            {size !== "narrow" && size !== "phone" && helperChip}
            {size === "wide" && (
                <Button size="sm" variant="ghost" onClick={handleCreateKeymap} title="Nowa mapa (kopia bieżących bindów)">
                    <Plus size={14} strokeWidth={2.2} />Nowa mapa
                </Button>
            )}
            <div className="popup-menu-anchor" ref={more.rootRef}>
                <button ref={more.anchorRef} type="button" className={`keys-ib${more.open ? " is-active" : ""}`} title="Więcej" onClick={more.toggle}>
                    <MoreHorizontal size={16} />
                </button>
                {more.style && (
                    <div className="popup-popover popup-menu" style={more.style}>
                        {moreItems.map(item => (
                            <button
                                key={item.label}
                                type="button"
                                className={`popup-menu__item${item.danger ? " keys-menu-danger" : ""}`}
                                title={item.label}
                                disabled={item.disabled}
                                onClick={() => { more.close(); item.onSelect(); }}
                            >
                                {item.label}
                            </button>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );

    // ── Layout ──────────────────────────────────────────────────────────

    const conflictBanner = conflictIds.length > 0 && (size === "narrow" || size === "phone") && (() => {
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

    const layerTabs = (
        <Segmented
            name="keys-layer"
            value={layer}
            onChange={setLayer}
            options={layers.map(l => {
                const n = layerCount(l);
                const short = size === "narrow" || size === "phone";
                const text = short && l === "ctrl+alt" ? "C+A" : layerLabel(l, size !== "wide");
                return { value: l, label: <>{text}{!short && n > 0 && <span className="keys-muted keys-count">{n}</span>}</> };
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

    const listOrder: (Group | "helper")[] = ["dir", "basic", "enemy", "temp", "own", "helper"];
    const tabCount = (g: Group | "helper") => g === "helper" ? 0 : entries.filter(e => e.group === g && e.combo).length;

    let body: ReactNode;
    if (size === "wide") {
        body = (
            <>
                <div className="keys-bar">
                    {layerTabs}
                    <span className="keys-spacer" />
                    {legend(false)}
                    {searchField}
                </div>
                <div className="keys-top">
                    {/* The panel never grows the row past the keyboard; it scrolls instead,
                        so picking a key can't push the lists down the page. */}
                    {keyboard(false)}
                    <aside className="keys-aside" style={{ maxHeight: boardHeight || undefined }}>{detail()}</aside>
                </div>
                <div className="keys-lists">
                    {basicSection()}
                    <div className="keys-lists__stack">{enemySection()}{tempSection()}</div>
                    {dirSection()}
                    {ownSection()}
                </div>
                {helperSection()}
            </>
        );
    } else if (size === "medium") {
        body = (
            <>
                <div className="keys-bar">
                    {layerTabs}
                    <span className="keys-spacer" />
                    <div className="popup-menu-anchor">
                        <Button size="sm" onClick={() => setLegendOpen(!legendOpen)}>
                            <span className="keys-dot" data-group="basic" /><span className="keys-dot" data-group="enemy" /><span className="keys-dot" data-group="own" />Legenda
                        </Button>
                        {legendOpen && <div className="keys-legend-pop">{legend(true)}</div>}
                    </div>
                    {searchOpen ? searchField : (
                        <button type="button" className="keys-ib keys-ib--box" title="Szukaj" onClick={() => setSearchOpen(true)}><Search size={15} /></button>
                    )}
                </div>
                <div className="keys-top keys-top--medium">
                    {keyboard(false)}
                    {detailOpen && selectedCombo && <div className="keys-pop">{detail()}</div>}
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
                <div className="keys-tabpanel">{searching ? listOrder.map(g => <div key={g}>{sections[g]()}</div>) : sections[listTab]()}</div>
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
                        {searchOpen ? searchField : (
                            <button type="button" className="keys-ib keys-ib--box" title="Szukaj" onClick={() => setSearchOpen(true)}><Search size={15} /></button>
                        )}
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
                        {!kbCollapsed && legend(true)}
                    </div>
                )}
                {dirSection()}
                {tempSection()}
                {basicSection()}
                {enemySection()}
                {ownSection()}
                {helperSection()}
            </>
        );
    }

    const sheetOpen = (size === "narrow" || size === "phone") && detailOpen && !!selectedCombo;
    const captureSheet = capture && (size === "phone" || size === "narrow") && (() => {
        const label = capture.target.kind === "entry" ? capture.target.entry.label : capture.target.label;
        const previous = capture.target.kind === "entry" ? capture.target.entry.combo : null;
        const mods = layerOf(liveMods);
        return (
            <div className="keys-sheet keys-sheet--capture">
                <div className="keys-sheet__grip" />
                <span className="keys-cap">Nowy klawisz dla</span>
                <strong className="keys-sheet__title">{label}</strong>
                <div className="keys-sheet__keys">
                    {mods && <><span className="keys-kc keys-kc--big">{layerLabel(mods)}</span><span className="keys-muted">+</span></>}
                    <span className="keys-kc keys-kc--big is-capturing">?</span>
                </div>
                <span className="keys-dim">{capture.via === "helper" ? "Naciśnij klawisz, słucha helper" : "Naciśnij klawisz na klawiaturze"}</span>
                <span className="keys-muted">Działa z klawiaturą Bluetooth lub USB</span>
                {previous && <div className="keys-sheet__prev"><span className="keys-muted">Poprzednio</span><span className="keys-kc">{comboLabel(previous)}</span></div>}
                <div className="keys-sheet__actions">
                    {capture.target.kind === "entry" && <Button onClick={() => finishCapture(null)}>Wyczyść</Button>}
                    <Button onClick={() => setCapture(null)}>Anuluj</Button>
                </div>
            </div>
        );
    })();

    const helperCaptureBar = capture?.via === "helper" && size !== "phone" && size !== "narrow" && (
        <div className="keys-capturebar">
            <span className="keys-kc is-capturing">naciśnij…</span>
            <span className="keys-dim">Naciśnij dowolną kombinację dla „{capture.target.kind === "entry" ? capture.target.entry.label : capture.target.label}”</span>
            <span className="keys-muted"><Plug size={12} className="keys-helper-icon" /> słucha helper, przeglądarka nic nie dostanie</span>
            <span className="keys-spacer" />
            <Button size="sm" onClick={() => setCapture(null)}>Anuluj</Button>
        </div>
    );
    const browserCaptureBar = capture?.via === "browser" && capture.target.kind !== "entry" && size !== "phone" && size !== "narrow" && (
        <div className="keys-capturebar">
            <span className="keys-kc is-capturing">naciśnij…</span>
            <span className="keys-dim">Naciśnij klawisz dla „{capture.target.label}” albo wybierz go na rysunku</span>
            <span className="keys-spacer" />
            <Button size="sm" onClick={() => setCapture(null)}>Anuluj</Button>
        </div>
    );

    return (
        <div className={`keys keys--${size}`} ref={rootRef}>
            <MultibindImport openEvent="binds-open-import" />
            {headerSlot ? createPortal(toolbar, headerSlot) : toolbar}
            {size === "phone" && helperChip && <div className="keys-phone-helper">{helperChip}</div>}
            {helperCaptureBar}
            {browserCaptureBar}
            {notice && <div className="keys-notice" role="status">{notice}<button type="button" className="keys-ib keys-ib--sm" onClick={() => setNotice(null)}><X size={13} /></button></div>}
            {body}
            {sheetOpen && !capture && (
                <>
                    <div className="keys-scrim" onClick={() => setDetailOpen(false)} />
                    <div className="keys-sheet">{detail()}</div>
                </>
            )}
            {captureSheet}
            {confirm === "delete" && (
                <SubDialog
                    size="sm"
                    title="Usunąć mapę klawiszy?"
                    onClose={() => setConfirm(null)}
                    footer={(
                        <>
                            <Button onClick={() => setConfirm(null)}>Anuluj</Button>
                            <Button variant="danger" onClick={handleDelete}>Usuń</Button>
                        </>
                    )}
                >
                    Czy na pewno chcesz usunąć mapę klawiszy <strong>{keymapList.find(k => k.id === keymapId)?.name}</strong>?
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
                            <Button variant="solid" onClick={handleRestore}>Przywróć</Button>
                        </>
                    )}
                >
                    Standardowe bindy zostaną przywrócone do wartości domyślnych. Własne skróty pozostaną bez zmian.
                </SubDialog>
            )}
        </div>
    );
}


/** A free key: give it a command, heard by the page or by the helper. */

