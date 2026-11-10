import { useCallback, useEffect, useRef, useState, type RefObject } from "react";
import type { BindSettings, Keymap } from "@modules/core/keymapTypes";
import {
    createKeymap as storeCreateKeymap,
    defaultBinds,
    deleteKeymap,
    getActiveKeymapId,
    getKeymapList,
    getKeymapStore,
    mergeBindSettings,
    renameKeymap,
    saveKeymapBinds,
    switchKeymap as storeSwitchKeymap,
} from "@modules/core/keymapStorage";
import type { HelperConnection } from "@modules/helper/HelperConnection";
import { loadBinds as loadHelperBinds, saveBinds as saveHelperBinds, toHelperBind, type StoredBind } from "@modules/helper/helperBinds";
import { MODAL_EVENT } from "@web/modals/appModal.ts";
import { sanitize, type KeysEdit } from "./keyEdits";

const SAVE_DELAY = 400;

/**
 * The window's keymaps, the active keymap's binds and the helper's hotkeys,
 * and their storage. Every change is stored straight away; typing in a
 * command waits for a pause. The helper is re-sent its hotkeys on each store.
 */
export function useKeymapStore(rootRef: RefObject<HTMLElement | null>, helperConnection: HelperConnection | null | undefined) {
    const [keymapList, setKeymapList] = useState<Keymap[]>([]);
    const [keymapId, setKeymapId] = useState("");
    const [binds, setBinds] = useState<BindSettings>(defaultBinds);
    const [helperBinds, setHelperBinds] = useState<StoredBind[]>(loadHelperBinds);

    const pending = useRef<{ id: string; binds: BindSettings } | null>(null);
    const saveTimer = useRef<number | undefined>(undefined);
    const pendingHelper = useRef<{ next: StoredBind[]; gone: StoredBind[] } | null>(null);
    const helperTimer = useRef<number | undefined>(undefined);
    const helperRef = useRef<HelperConnection | null>(null);
    helperRef.current = helperConnection ?? null;
    // The latest hotkeys, so two writes in one event both count.
    const helperBindsRef = useRef(helperBinds);

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
        const stored = loadHelperBinds();
        helperBindsRef.current = stored;
        setHelperBinds(stored);
    }, []);

    useEffect(() => {
        load();
        return flush;
    }, [load, flush]);

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
    }, [rootRef, load, flush]);

    const commit = useCallback((next: BindSettings, debounce = false) => {
        setBinds(next);
        pending.current = { id: keymapId, binds: next };
        window.clearTimeout(saveTimer.current);
        if (debounce) saveTimer.current = window.setTimeout(flush, SAVE_DELAY);
        else flush();
    }, [keymapId, flush]);

    /** Stores the helper's hotkeys and re-registers them with it; the ones dropped are unregistered. */
    const commitHelper = useCallback((next: StoredBind[], debounce = false) => {
        const previous = helperBindsRef.current;
        const gone = pendingHelper.current?.gone ?? [];
        pendingHelper.current = { next, gone: [...gone, ...previous.filter(p => !next.some(n => n.id === p.id))] };
        helperBindsRef.current = next;
        setHelperBinds(next);
        window.clearTimeout(helperTimer.current);
        if (debounce) helperTimer.current = window.setTimeout(flushHelper, SAVE_DELAY);
        else flushHelper();
    }, [flushHelper]);

    /** Stores what an edit changed; returns its notice, if any. */
    const apply = useCallback((edit: KeysEdit, debounce = false) => {
        if (edit.helperBinds) commitHelper(edit.helperBinds, debounce);
        if (edit.binds) commit(edit.binds, debounce);
    }, [commit, commitHelper]);

    const switchKeymap = useCallback((id: string) => {
        flush();
        storeSwitchKeymap(id);
        load(id);
    }, [flush, load]);

    /** A copy of the current binds under a new keymap, made active; returns it. */
    const createKeymap = useCallback(() => {
        flush();
        const created = storeCreateKeymap("Nowa mapa klawiszy", sanitize(binds));
        storeSwitchKeymap(created.id);
        load(created.id);
        return created;
    }, [flush, load, binds]);

    const rename = useCallback((name: string) => {
        if (name.trim()) renameKeymap(keymapId, name.trim());
        setKeymapList(getKeymapList());
    }, [keymapId]);

    const deleteCurrent = useCallback(() => {
        flush();
        if (deleteKeymap(keymapId)) load();
    }, [flush, load, keymapId]);

    return { keymapList, keymapId, binds, helperBinds, apply, switchKeymap, createKeymap, rename, deleteCurrent };
}
