import { useCallback, useEffect, useMemo, useRef, useState, type DragEvent, type HTMLAttributes, type KeyboardEvent, type MouseEvent } from "react";
import {
    ArrowLeft,
    ChevronDown,
    ChevronRight,
    Code2,
    Folder,
    FolderOpen,
    FolderPlus,
    LayoutList,
    MoreHorizontal,
    Plus,
    Search,
    SquareTerminal,
    Trash2,
    Upload,
    Zap,
} from "lucide-react";
import { Button, Check, Input, InputGroup, NO_PASSWORD_MANAGER } from "@web-ui/primitives/index.ts";
import { characterStorage, globalStorage } from "@modules/core/storage";
import {
    AUTOMATION_GROUPS_KEY,
    getAutomationGroups,
    isAutomationActive,
    type AutomationGroup,
} from "@modules/core/automation";
import type { UserAlias } from "@client/scripts/userAliases";
import type { UserTrigger } from "@client/scripts/userTriggers";
import type { UserScript } from "@client/scripts/userScripts";
import { openSettingsPage } from "@web/settings/categories.ts";
import { MODAL_EVENT } from "@web/modals/appModal.ts";
import { showContextMenu, type ContextMenuEntry } from "@web/contextMenu";
import { AliasEditor } from "./AliasEditor";
import { TriggerEditor } from "./TriggerEditor";
import { ScriptEditor } from "./ScriptEditor";
import { Switch, openMenuAt } from "./EditorParts";
import { useCustomSounds, usePluginMacros } from "./useCustomSounds";
import {
    KIND_LABEL,
    buildPack,
    createGroup,
    deleteGroup,
    effectiveGroup,
    draftError,
    draftFromItem,
    ensureStoredIds,
    importPack,
    itemFromDraft,
    itemSearchText,
    itemSummary,
    itemTitle,
    loadItems,
    moveGroup,
    moveItem,
    newDraft,
    parsePack,
    placeDraft,
    removeItem,
    renameGroup,
    scriptUsers,
    sameDraft,
    setGroupEnabled,
    setItemEnabled,
    sortItems,
    writeItem,
    type AutomationItem,
    type AutomationKind,
    type Draft,
} from "./automationModel";
import "./automation.css";

type KindFilter = "all" | AutomationKind;

/** What is being dragged in the list. */
type Drag = { type: "item"; kind: AutomationKind; id: string } | { type: "group"; id: string };

/** Where it would land: before/after a row, into a group, before a group. */
interface DropAt {
    target: string;
    where: "before" | "after" | "into";
}

const KIND_ICON = { alias: SquareTerminal, trigger: Zap, script: Code2 } as const;

const KIND_NAV: Record<AutomationKind, string> = { alias: "Aliasy", trigger: "Wyzwalacze", script: "Skrypty" };
const NEW_NAME: Record<AutomationKind, string> = { alias: "Nowy alias", trigger: "Nowy wyzwalacz", script: "Nowy skrypt" };
const THIS_ONE: Record<AutomationKind, string> = { alias: "ten alias", trigger: "ten wyzwalacz", script: "ten skrypt" };

function KindIcon({ kind, size = 14 }: { kind: AutomationKind; size?: number }) {
    const Icon = KIND_ICON[kind];
    return <span className={`automation-kind automation-kind--${kind}`}><Icon size={size} strokeWidth={2} /></span>;
}

function download(name: string, text: string) {
    const url = URL.createObjectURL(new Blob([text], { type: "application/json" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = name;
    a.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function packFileName(label: string) {
    const date = new Date().toISOString().slice(0, 10);
    const slug = label.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "grupa";
    return `automatyzacja-${slug}-${date}.json`;
}

function countLabel(aliases: number, triggers: number, scripts = 0) {
    const parts: string[] = [];
    if (aliases) parts.push(`${aliases} ${aliases === 1 ? "alias" : "aliasow"}`);
    if (triggers) parts.push(`${triggers} ${triggers === 1 ? "wyzwalacz" : "wyzwalaczy"}`);
    if (scripts) parts.push(`${scripts} ${scripts === 1 ? "skrypt" : "skryptow"}`);
    return parts.join(" i ") || "nic nowego";
}

function charactersChip(n: number) {
    const few = n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 10 || n % 100 >= 20);
    return n === 1 ? "1 postac" : `${n} ${few ? "postacie" : "postaci"}`;
}

/** Group header in the list: collapse, name (renamable), count, on/off. */
function GroupHeader({ group, count, collapsed, onToggleCollapse, onMenu, renaming, onRenamed, dnd, drop }: {
    group: AutomationGroup | null;
    count: number;
    collapsed: boolean;
    onToggleCollapse: () => void;
    onMenu?: (e: MouseEvent<HTMLElement>) => void;
    renaming: boolean;
    onRenamed: () => void;
    /** Drag and drop handlers for the header. */
    dnd: HTMLAttributes<HTMLDivElement>;
    /** Where a drop would land, to draw it. */
    drop?: "into" | "before";
}) {
    const [name, setName] = useState(group?.name ?? "");
    useEffect(() => setName(group?.name ?? ""), [group?.name, renaming]);
    const off = group?.enabled === false;
    const Chevron = collapsed ? ChevronRight : ChevronDown;
    const Icon = collapsed ? Folder : FolderOpen;
    return (
        <div className={`automation-group${off ? " is-off" : ""}${drop ? ` is-drop-${drop}` : ""}`} onContextMenu={onMenu} {...dnd}>
            <button type="button" className="automation-group__toggle" onClick={onToggleCollapse} title={collapsed ? "Rozwin" : "Zwin"}>
                <Chevron size={14} />
                <Icon size={14} className="automation-group__ic" />
                {!renaming && <span className="automation-group__name">{group ? group.name : "Bez grupy"}</span>}
            </button>
            {renaming && group && (
                <input
                    className="automation-group__rename"
                    autoComplete="off"
                    {...NO_PASSWORD_MANAGER}
                    title="Nazwa grupy"
                    value={name}
                    autoFocus
                    onFocus={e => e.currentTarget.select()}
                    onChange={e => setName(e.target.value)}
                    onBlur={() => { renameGroup(group.id, name); onRenamed(); }}
                    onKeyDown={e => {
                        if (e.key === "Enter") { renameGroup(group.id, name); onRenamed(); }
                        if (e.key === "Escape") { e.stopPropagation(); onRenamed(); }
                    }}
                />
            )}
            <span className="automation-group__count">{count}</span>
            {off && <span className="automation-chip">wylaczona</span>}
            <span className="automation-spacer" />
            {group && onMenu && (
                <button type="button" className="automation-icon-btn" title="Opcje grupy" onClick={onMenu}>
                    <MoreHorizontal size={15} />
                </button>
            )}
            {group && (
                <Switch on={!off} title={off ? "Grupa wylaczona" : "Grupa wlaczona"} onChange={on => setGroupEnabled(group.id, on)} />
            )}
        </div>
    );
}

/** Automatyzacja: aliases and triggers in one list, grouped, with an editor beside it. */
export default function AutomationWindow() {
    const [items, setItems] = useState<AutomationItem[]>([]);
    const [groups, setGroups] = useState<AutomationGroup[]>(getAutomationGroups);
    const [character, setCharacter] = useState<string | null>(() => characterStorage.getCharacter());
    const [kindFilter, setKindFilter] = useState<KindFilter>("all");
    const [showDisabled, setShowDisabled] = useState(true);
    const [onlyThisCharacter, setOnlyThisCharacter] = useState(false);
    const [query, setQuery] = useState("");
    const [selectedId, setSelectedId] = useState<string | null>(null);
    const [drafts, setDrafts] = useState<Record<string, Draft>>({});
    const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
    const [renamingGroup, setRenamingGroup] = useState<string | null>(null);
    const [drag, setDrag] = useState<Drag | null>(null);
    const [dropAt, setDropAt] = useState<DropAt | null>(null);
    const [saveError, setSaveError] = useState<string | null>(null);
    const [notice, setNotice] = useState<string | null>(null);
    const fileRef = useRef<HTMLInputElement>(null);
    const rootRef = useRef<HTMLDivElement>(null);
    const { customSounds, requestSoundUpload, soundInput } = useCustomSounds();
    const pluginMacros = usePluginMacros();

    /**
     * Stock mounts the window at startup and only shows and hides it. Ids are
     * written only while it is open: assigning them on every change made by
     * someone else (the assistant, sync, an import) would turn each of those
     * into a second write, synced again.
     */
    const reload = useCallback((opening = false) => {
        const modal = rootRef.current?.closest(".app-modal") as HTMLElement | null;
        if (opening || !modal || !modal.hidden) ensureStoredIds();
        setItems(loadItems());
    }, []);

    useEffect(() => {
        reload();
        const onChange = () => reload();
        const onShow = () => reload(true);
        const offAliases = globalStorage.onChange("aliases", onChange);
        const offTriggers = globalStorage.onChange("triggers", onChange);
        const offScripts = globalStorage.onChange("automationScripts", onChange);
        const offGroups = globalStorage.onChange(AUTOMATION_GROUPS_KEY, () => setGroups(getAutomationGroups()));
        const offCharacter = characterStorage.onCharacterChange(setCharacter);
        const modal = document.getElementById("automation-modal");
        modal?.addEventListener(MODAL_EVENT.show, onShow);
        return () => {
            offAliases();
            offTriggers();
            offScripts();
            offGroups();
            offCharacter();
            modal?.removeEventListener(MODAL_EVENT.show, onShow);
        };
    }, [reload]);

    useEffect(() => {
        if (!notice) return;
        const t = window.setTimeout(() => setNotice(null), 6000);
        return () => window.clearTimeout(t);
    }, [notice]);

    const pluginLabel = useCallback(
        (type: string) => pluginMacros.find(pm => pm.id === type)?.label,
        [pluginMacros],
    );

    const counts = {
        all: items.length,
        alias: items.filter(i => i.kind === "alias").length,
        trigger: items.filter(i => i.kind === "trigger").length,
        script: items.filter(i => i.kind === "script").length,
    };

    const newDrafts = Object.values(drafts).filter(d => d.isNew);

    const visible = useMemo(() => {
        const q = query.trim().toLowerCase();
        return items.filter(item => {
            if (kindFilter !== "all" && item.kind !== kindFilter) return false;
            if (!showDisabled && item.data.enabled === false) return false;
            if (onlyThisCharacter && !isAutomationActive({ characters: item.data.characters }, [], character)) return false;
            if (q && !itemSearchText(item, groups).includes(q)) return false;
            return true;
        });
    }, [items, kindFilter, showDisabled, onlyThisCharacter, character, query, groups]);

    const filtering = !!query.trim() || kindFilter !== "all" || !showDisabled || onlyThisCharacter;
    const sections = useMemo(() => {
        const byGroup = new Map<string, AutomationItem[]>();
        for (const item of sortItems(visible)) {
            const key = effectiveGroup(item, groups) ?? "";
            if (!byGroup.has(key)) byGroup.set(key, []);
            byGroup.get(key)!.push(item);
        }
        const list: { group: AutomationGroup | null; items: AutomationItem[] }[] = groups
            // Empty groups stay listed while nothing is filtered, so they can be managed.
            .filter(g => byGroup.has(g.id) || !filtering)
            .map(g => ({ group: g, items: byGroup.get(g.id) ?? [] }));
        // Bez grupy stays while groups exist, as a place to drag things out to.
        if (byGroup.has("") || (groups.length > 0 && !filtering)) list.push({ group: null, items: byGroup.get("") ?? [] });
        return list;
    }, [visible, groups, filtering]);

    const selectedItem = items.find(i => i.id === selectedId) ?? null;
    const selectedDraft: Draft | null = selectedId
        ? drafts[selectedId] ?? (selectedItem ? draftFromItem(selectedItem) : null)
        : null;

    // A stored element that disappeared (deleted elsewhere) is no longer selected.
    useEffect(() => {
        if (selectedId && !selectedItem && !drafts[selectedId]) setSelectedId(null);
    }, [selectedId, selectedItem, drafts]);

    const isDirty = (draft: Draft) => {
        if (draft.isNew) return true;
        const stored = items.find(i => i.id === draft.id);
        return !stored || !sameDraft(draft, draftFromItem(stored));
    };

    function select(id: string) {
        setSelectedId(id);
        setSaveError(null);
    }

    function updateDraft(draft: Draft) {
        setSaveError(null);
        setDrafts(prev => {
            const next = { ...prev };
            if (isDirty(draft)) next[draft.id] = draft;
            else delete next[draft.id];
            return next;
        });
    }

    function dropDraft(id: string) {
        setDrafts(prev => {
            const { [id]: _gone, ...rest } = prev;
            return rest;
        });
    }

    function create(kind: AutomationKind, group?: string) {
        const draft = newDraft(kind, group);
        setDrafts(prev => ({ ...prev, [draft.id]: draft }));
        select(draft.id);
    }

    function save() {
        if (!selectedDraft) return;
        const error = draftError(selectedDraft, items);
        if (error) {
            setSaveError(error);
            return;
        }
        writeItem(itemFromDraft(placeDraft(selectedDraft, items)));
        dropDraft(selectedDraft.id);
        setSaveError(null);
    }

    function revert() {
        if (!selectedDraft) return;
        dropDraft(selectedDraft.id);
        if (selectedDraft.isNew) setSelectedId(null);
        setSaveError(null);
    }

    /** Deletes a stored element after asking; false when the player said no. */
    function confirmRemove(kind: AutomationKind, id: string): boolean {
        const users = kind === "script" ? scriptUsers(id, items).length : 0;
        const warning = users ? ` Uzywa go ${users} ${users === 1 ? "element" : "elementow"} - ich akcja przestanie dzialac.` : "";
        if (!confirm(`Czy na pewno chcesz usunąć ${THIS_ONE[kind]}?${warning}`)) return false;
        removeItem(kind, id);
        dropDraft(id);
        setSelectedId(current => (current === id ? null : current));
        return true;
    }

    /** Deletes a group with everything in it, after asking. */
    function confirmRemoveGroup(group: AutomationGroup) {
        const members = items.filter(i => i.data.group === group.id);
        const memberIds = new Set(members.map(i => i.id));
        const count = (kind: AutomationKind) => members.filter(i => i.kind === kind).length;
        const contents = members.length
            ? ` razem z tym, co w niej jest (${countLabel(count("alias"), count("trigger"), count("script"))})`
            : "";
        // A script in the group may be run by an element that stays.
        const users = new Set(members
            .filter(i => i.kind === "script")
            .flatMap(i => scriptUsers(i.id, items))
            .filter(u => !memberIds.has(u.id))
            .map(u => u.id)).size;
        const warning = users ? ` Skrypty z tej grupy uzywa ${users} ${users === 1 ? "element" : "elementow"} spoza niej - ich akcja przestanie dzialac.` : "";
        if (!confirm(`Usunac grupe "${group.name}"${contents}?${warning}`)) return;
        deleteGroup(group.id);
        // Unsaved changes to what was in the group go with it.
        setDrafts(prev => Object.fromEntries(
            Object.entries(prev).filter(([id, d]) => !memberIds.has(id) && d.data.group !== group.id),
        ));
    }

    function remove() {
        if (!selectedDraft) return;
        if (selectedDraft.isNew) {
            dropDraft(selectedDraft.id);
            setSelectedId(null);
            return;
        }
        confirmRemove(selectedDraft.kind, selectedDraft.id);
    }

    function duplicateOf(source: Draft) {
        const copy = newDraft(source.kind, source.data.group);
        const { order: _order, ...rest } = source.data;
        const data = { ...rest, id: copy.id, name: source.data.name ? `${source.data.name} (kopia)` : undefined };
        const draft = { ...copy, data };
        setDrafts(prev => ({ ...prev, [draft.id]: draft }));
        select(draft.id);
    }

    function duplicate() {
        if (selectedDraft) duplicateOf(selectedDraft);
    }

    /** A new group, its name ready to type over. */
    function addGroup(): string {
        const id = createGroup();
        setRenamingGroup(id);
        return id;
    }

    /** Right-click on a row: what the editor and the list offer, without opening it. */
    function rowMenu(e: MouseEvent<HTMLElement>, item: AutomationItem) {
        e.preventDefault();
        const current = effectiveGroup(item, groups);
        const off = item.data.enabled === false;
        const move = "Przenies do grupy";
        const entries: ContextMenuEntry[] = [
            { label: "Edytuj", action: () => select(item.id) },
            { label: "Duplikuj", action: () => duplicateOf(drafts[item.id] ?? draftFromItem(item)) },
            { label: off ? "Wlacz" : "Wylacz", action: () => toggleItem(item, off) },
            ...groups.filter(g => g.id !== current).map(g => ({ label: g.name, section: move, action: () => moveItem(item.kind, item.id, g.id) })),
            ...(current ? [{ label: "Bez grupy", section: move, action: () => moveItem(item.kind, item.id, undefined) }] : []),
            { label: "Nowa grupa", section: move, icon: FolderPlus, action: () => moveItem(item.kind, item.id, addGroup()) },
            { label: "Usun", tone: "danger", separator: true, icon: Trash2, action: () => { confirmRemove(item.kind, item.id); } },
        ];
        showContextMenu(entries, e.clientX, e.clientY, { header: itemTitle(item).text, smallHeader: true });
    }

    // ── Drag and drop: rows into groups and between rows, groups between groups ──

    const endDrag = () => {
        setDrag(null);
        setDropAt(null);
    };

    function showDrop(target: string, where: DropAt["where"]) {
        setDropAt(prev => (prev?.target === target && prev.where === where ? prev : { target, where }));
    }

    /** Before or after a row, by which half of it the pointer is over. */
    function half(e: DragEvent<HTMLElement>): "before" | "after" {
        const rect = e.currentTarget.getBoundingClientRect();
        return e.clientY < rect.top + rect.height / 2 ? "before" : "after";
    }

    function rowDnd(item: AutomationItem, sectionItems: AutomationItem[], index: number, group: string | undefined): HTMLAttributes<HTMLDivElement> {
        return {
            draggable: true,
            onDragStart: e => {
                e.dataTransfer.effectAllowed = "move";
                e.dataTransfer.setData("text/plain", item.id);
                setDrag({ type: "item", kind: item.kind, id: item.id });
            },
            onDragEnd: endDrag,
            onDragOver: e => {
                if (drag?.type !== "item") return;
                e.preventDefault();
                showDrop(`item:${item.id}`, half(e));
            },
            onDrop: e => {
                if (drag?.type !== "item") return;
                e.preventDefault();
                const before = half(e) === "before" ? item.id : sectionItems[index + 1]?.id;
                moveItem(drag.kind, drag.id, group, before);
                endDrag();
            },
        };
    }

    function groupDnd(group: AutomationGroup | null): HTMLAttributes<HTMLDivElement> {
        const target = `group:${group?.id ?? ""}`;
        return {
            draggable: !!group && renamingGroup !== group.id,
            onDragStart: group ? e => {
                e.dataTransfer.effectAllowed = "move";
                e.dataTransfer.setData("text/plain", group.id);
                setDrag({ type: "group", id: group.id });
            } : undefined,
            onDragEnd: endDrag,
            onDragOver: e => {
                if (!drag) return;
                e.preventDefault();
                showDrop(target, drag.type === "item" ? "into" : "before");
            },
            onDrop: e => {
                if (!drag) return;
                e.preventDefault();
                if (drag.type === "item") moveItem(drag.kind, drag.id, group?.id);
                // Onto a group: before it. Onto Bez grupy (always last): to the end.
                else moveGroup(drag.id, group?.id);
                endDrag();
            },
        };
    }

    const dropOn = (target: string) => (dropAt?.target === target ? dropAt.where : undefined);

    function toggleItem(item: AutomationItem, on: boolean) {
        setItemEnabled(item, on);
        // An open edit follows the switch rather than silently undoing it on save.
        const draft = drafts[item.id];
        if (draft) setDrafts(prev => ({ ...prev, [item.id]: { ...draft, data: { ...draft.data, enabled: on ? undefined : false } } }));
    }

    function groupMenu(e: MouseEvent<HTMLElement>, group: AutomationGroup) {
        e.preventDefault();
        openMenuAt(e, [
            { label: "Nowy alias w grupie", action: () => create("alias", group.id) },
            { label: "Nowy wyzwalacz w grupie", action: () => create("trigger", group.id) },
            { label: "Nowy skrypt w grupie", action: () => create("script", group.id) },
            { label: "Zmien nazwe", action: () => setRenamingGroup(group.id) },
            { label: "Eksportuj grupe", action: () => download(packFileName(group.name), JSON.stringify(buildPack(group.id), null, 2)) },
            {
                label: "Usun grupe",
                tone: "danger",
                separator: true,
                icon: Trash2,
                action: () => confirmRemoveGroup(group),
            },
        ]);
    }

    function addMenu(e: MouseEvent<HTMLElement>) {
        const kinds: ContextMenuEntry[] = [
            { label: "Alias - gdy wpiszesz komende", icon: SquareTerminal, action: () => create("alias") },
            { label: "Wyzwalacz - gdy gra wypisze linie lub zajdzie zdarzenie", icon: Zap, action: () => create("trigger") },
            { label: "Skrypt - kod JavaScript uruchamiany akcja lub komenda", icon: Code2, action: () => create("script") },
        ];
        // Filtered to one kind, only that one is offered; a group always is.
        const shown = kindFilter === "all" ? kinds : [kinds[["alias", "trigger", "script"].indexOf(kindFilter)]];
        openMenuAt(e, [
            ...shown,
            { label: "Grupa - do porzadkowania elementow", icon: FolderPlus, separator: true, action: () => { addGroup(); } },
        ]);
    }

    function importMenu(e: MouseEvent<HTMLElement>) {
        openMenuAt(e, [
            { label: "Plik automatyzacji (.json)", action: () => fileRef.current?.click() },
            { label: "Aliasy z klienta Arkadii (.json)", action: () => openSettingsPage("data-import", "import-aliases-arkadia") },
            { label: "Aliasy z Blowtorch (.xml)", action: () => openSettingsPage("data-import", "import-aliases-blowtorch") },
        ]);
    }

    async function importFile(file: File) {
        try {
            const result = importPack(parsePack(await file.text()));
            const skipped = result.skipped ? ` Pominieto ${result.skipped} juz istniejacych.` : "";
            setNotice(`Zaimportowano: ${countLabel(result.aliases, result.triggers, result.scripts)}.${skipped}`);
        } catch (err) {
            setNotice(err instanceof SyntaxError ? "Plik nie jest poprawnym JSON-em." : (err as Error).message);
        }
    }

    function onEditorKeyDown(e: KeyboardEvent) {
        if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
            e.preventDefault();
            save();
        }
    }

    const renderRow = (item: AutomationItem, index: number, sectionItems: AutomationItem[], group: string | undefined) => {
        const draft = drafts[item.id];
        const shown: AutomationItem = draft ? { ...item, data: draft.data } as AutomationItem : item;
        const title = itemTitle(shown);
        const off = item.data.enabled === false;
        const drop = dropOn(`item:${item.id}`);
        const dragging = drag?.type === "item" && drag.id === item.id;
        return (
            <div
                key={item.id}
                className={`automation-item${selectedId === item.id ? " is-selected" : ""}${off ? " is-off" : ""}${drop ? ` is-drop-${drop}` : ""}${dragging ? " is-dragging" : ""}`}
                onContextMenu={e => rowMenu(e, item)}
                {...rowDnd(item, sectionItems, index, group)}
            >
                <button type="button" className="automation-item__main" onClick={() => select(item.id)}>
                    <KindIcon kind={item.kind} />
                    <span className="automation-item__text">
                        <span className={`automation-item__title${title.mono ? " is-mono" : ""}`}>
                            {title.prefix && <span className="automation-item__prefix">{title.prefix} </span>}
                            {title.text}
                            {draft && <span className="automation-dot" title="Niezapisane zmiany" />}
                        </span>
                        <span className="automation-item__sub">{itemSummary(shown, pluginLabel, items)}</span>
                    </span>
                    {item.data.characters?.length ? (
                        <span className="automation-chip" title={item.data.characters.join(", ")}>{charactersChip(item.data.characters.length)}</span>
                    ) : null}
                </button>
                <Switch on={!off} title={off ? "Wylaczony" : "Wlaczony"} onChange={on => toggleItem(item, on)} />
            </div>
        );
    };

    const renderNewRow = (draft: Draft) => (
        <div key={draft.id} className={`automation-item is-new${selectedId === draft.id ? " is-selected" : ""}`}>
            <button type="button" className="automation-item__main" onClick={() => select(draft.id)}>
                <KindIcon kind={draft.kind} />
                <span className="automation-item__text">
                    <span className="automation-item__title">
                        {draft.data.name?.trim() || NEW_NAME[draft.kind]}
                        <span className="automation-dot" title="Niezapisane zmiany" />
                    </span>
                    <span className="automation-item__sub">niezapisany</span>
                </span>
            </button>
        </div>
    );

    const nav = (
        <nav className="automation-nav">
            {(["all", "alias", "trigger", "script"] as const).map(kind => (
                <button
                    key={kind}
                    type="button"
                    className={`automation-nav__kind${kindFilter === kind ? " is-active" : ""}`}
                    onClick={() => setKindFilter(kind)}
                >
                    {kind === "all"
                        ? <span className="automation-kind"><LayoutList size={14} /></span>
                        : <KindIcon kind={kind} />}
                    <span className="automation-nav__label">{kind === "all" ? "Wszystko" : KIND_NAV[kind]}</span>
                    <span className="automation-nav__count">{counts[kind]}</span>
                </button>
            ))}
            <div className="automation-nav__filters">
                <span className="automation-cap">Pokaz</span>
                <Check label="Wylaczone" checked={showDisabled} onChange={e => setShowDisabled(e.target.checked)} />
                <Check
                    label="Tylko tej postaci"
                    checked={onlyThisCharacter}
                    disabled={!character}
                    title={character ? `Tylko to, co dziala dla ${character}` : "Nie zalogowano na postac"}
                    onChange={e => setOnlyThisCharacter(e.target.checked)}
                />
            </div>
            <span className="automation-spacer" />
            <div className="automation-nav__io">
                <Button variant="ghost" size="sm" onClick={importMenu}><Upload size={14} />Importuj</Button>
                <Button
                    variant="ghost"
                    size="sm"
                    disabled={!items.length}
                    onClick={() => download(packFileName("wszystko"), JSON.stringify(buildPack(), null, 2))}
                >
                    Eksportuj wszystko
                </Button>
            </div>
            {notice && <p className="automation-notice">{notice}</p>}
            <input
                ref={fileRef}
                type="file"
                accept=".json,application/json"
                hidden
                onChange={e => { const f = e.target.files?.[0]; e.target.value = ""; if (f) void importFile(f); }}
            />
        </nav>
    );

    const listEmpty = items.length === 0 && newDrafts.length === 0;

    const list = (
        <div className="automation-list">
            <div className="automation-list__tools">
                <InputGroup before={<Search size={14} strokeWidth={1.9} />}>
                    <Input
                        title="Szukaj"
                        value={query}
                        placeholder="Szukaj wzorca, komendy, nazwy..."
                        onChange={e => setQuery(e.target.value)}
                        onKeyDown={e => { if (e.key === "Escape" && query) { e.stopPropagation(); setQuery(""); } }}
                    />
                </InputGroup>
                <Button className="popup-btn--icon" title="Nowa grupa" onClick={addGroup}>
                    <FolderPlus size={16} />
                </Button>
                <Button variant="solid" className="popup-btn--icon" title="Dodaj" onClick={addMenu}>
                    <Plus size={16} />
                </Button>
            </div>
            <div className="automation-list__rows">
                {newDrafts.map(renderNewRow)}
                {sections.map(({ group, items: sectionItems }) => {
                    const key = group?.id ?? "";
                    const isCollapsed = collapsed.has(key) && !query.trim();
                    return (
                        <div key={key || "ungrouped"} className="automation-section">
                            {(group || groups.length > 0) && (
                                <GroupHeader
                                    group={group}
                                    count={sectionItems.length}
                                    collapsed={isCollapsed}
                                    onToggleCollapse={() => setCollapsed(prev => {
                                        const next = new Set(prev);
                                        if (next.has(key)) next.delete(key); else next.add(key);
                                        return next;
                                    })}
                                    onMenu={group ? e => groupMenu(e, group) : undefined}
                                    renaming={!!group && renamingGroup === group.id}
                                    onRenamed={() => setRenamingGroup(null)}
                                    dnd={groupDnd(group)}
                                    drop={dropOn(`group:${key}`) as "into" | "before" | undefined}
                                />
                            )}
                            {!isCollapsed && (
                                <div className={group || groups.length > 0 ? "automation-section__items" : undefined}>
                                    {sectionItems.map((item, index) => renderRow(item, index, sectionItems, group?.id))}
                                    {(group || groups.length > 0) && sectionItems.length === 0 && (
                                        <p
                                            className={`automation-empty is-small${dropOn(`group:${key}`) === "into" ? " is-drop-into" : ""}`}
                                            {...groupDnd(group)}
                                            draggable={false}
                                        >
                                            {group ? "Pusta grupa - przeciagnij tu elementy." : "Przeciagnij tu, zeby wyjac z grupy."}
                                        </p>
                                    )}
                                </div>
                            )}
                        </div>
                    );
                })}
                {listEmpty && (
                    <p className="automation-empty">
                        Nie masz jeszcze aliasow ani wyzwalaczy. Alias zamienia wpisana komende na inne, np.{" "}
                        <code>zab (.+)</code> → <code>zabij $1</code>. Wyzwalacz reaguje na linie z gry albo zdarzenie
                        i wykonuje akcje: koloruje, wysyla komende, gra dzwiek... Kliknij + zeby dodac.
                    </p>
                )}
                {!listEmpty && visible.length === 0 && filtering && <p className="automation-empty">Nic nie pasuje.</p>}
            </div>
        </div>
    );

    const dirty = selectedDraft ? isDirty(selectedDraft) : false;

    const editor = selectedDraft ? (
        <section className="automation-editor" onKeyDown={onEditorKeyDown}>
            <div className="automation-editor__head">
                <button type="button" className="automation-icon-btn automation-back" title="Wroc do listy" onClick={() => setSelectedId(null)}>
                    <ArrowLeft size={16} />
                </button>
                <KindIcon kind={selectedDraft.kind} />
                <input
                    className="automation-editor__name"
                    autoComplete="off"
                    {...NO_PASSWORD_MANAGER}
                    title="Nazwa (opcjonalna)"
                    value={selectedDraft.data.name ?? ""}
                    placeholder={selectedDraft.kind === "script" ? "Skrypt - nazwa" : `${KIND_LABEL[selectedDraft.kind]} - nazwa (opcjonalna)`}
                    onChange={e => updateDraft({ ...selectedDraft, data: { ...selectedDraft.data, name: e.target.value || undefined } })}
                />
                <Switch
                    on={selectedDraft.data.enabled !== false}
                    title="Wlaczony"
                    onChange={on => updateDraft({ ...selectedDraft, data: { ...selectedDraft.data, enabled: on ? undefined : false } })}
                >
                    <span className="automation-switch__label">Wlaczony</span>
                </Switch>
                <button
                    type="button"
                    className="automation-icon-btn"
                    title="Wiecej"
                    onClick={e => openMenuAt(e, [
                        { label: "Duplikuj", action: duplicate },
                        { label: selectedDraft.isNew ? "Odrzuc" : "Usun", action: remove },
                    ])}
                >
                    <MoreHorizontal size={16} />
                </button>
            </div>
            <div className="automation-editor__body" key={selectedDraft.id}>
                {selectedDraft.kind === "script" ? (
                    <ScriptEditor
                        id={selectedDraft.id}
                        script={selectedDraft.data as UserScript}
                        users={scriptUsers(selectedDraft.id, items)}
                        onChange={data => updateDraft({ ...selectedDraft, data })}
                        onSelect={select}
                        onSave={save}
                    />
                ) : selectedDraft.kind === "alias" ? (
                    <AliasEditor
                        alias={selectedDraft.data as UserAlias}
                        onChange={data => updateDraft({ ...selectedDraft, data })}
                        sounds={customSounds}
                        onRequestSoundUpload={requestSoundUpload}
                    />
                ) : (
                    <TriggerEditor
                        trigger={selectedDraft.data as UserTrigger}
                        onChange={data => updateDraft({ ...selectedDraft, data })}
                        sounds={customSounds}
                        onRequestSoundUpload={requestSoundUpload}
                        pluginMacros={pluginMacros}
                    />
                )}
            </div>
            <footer className="automation-editor__foot">
                <Button variant="danger" onClick={remove}><Trash2 size={15} />{selectedDraft.isNew ? "Odrzuc" : "Usun"}</Button>
                {saveError && <span className="automation-error">{saveError}</span>}
                <span className="automation-spacer" />
                <span className="automation-keys"><kbd>Ctrl</kbd><kbd>Enter</kbd></span>
                <Button disabled={!dirty || selectedDraft.isNew} onClick={revert}>Cofnij zmiany</Button>
                <Button variant="solid" disabled={!dirty} onClick={save}>Zapisz</Button>
            </footer>
        </section>
    ) : (
        <section className="automation-editor automation-editor--empty">
            <Zap size={22} strokeWidth={1.6} />
            <p>Wybierz alias, wyzwalacz lub skrypt z listy albo dodaj nowy przyciskiem +.</p>
            {items.length === 0 && (
                <div className="automation-editor__starters">
                    <Button onClick={() => create("alias")}><SquareTerminal size={15} />Nowy alias</Button>
                    <Button onClick={() => create("trigger")}><Zap size={15} />Nowy wyzwalacz</Button>
                </div>
            )}
        </section>
    );

    return (
        <div ref={rootRef} className={`automation${selectedDraft ? " has-selection" : ""}`}>
            {soundInput}
            {nav}
            {list}
            {editor}
        </div>
    );
}
