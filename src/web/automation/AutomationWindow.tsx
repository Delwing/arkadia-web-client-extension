import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent, type MouseEvent } from "react";
import {
    ArrowLeft,
    ChevronDown,
    ChevronRight,
    Code2,
    Folder,
    FolderOpen,
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
import { AliasEditor } from "./AliasEditor";
import { TriggerEditor } from "./TriggerEditor";
import { ScriptEditor } from "./ScriptEditor";
import { Switch, openMenuAt } from "./EditorParts";
import { useCustomSounds, usePluginMacros } from "./useCustomSounds";
import {
    KIND_LABEL,
    buildPack,
    deleteGroup,
    draftError,
    draftFromItem,
    ensureStoredIds,
    importPack,
    itemFromDraft,
    itemSearchText,
    itemSummary,
    itemTitle,
    loadItems,
    newDraft,
    parsePack,
    removeItem,
    renameGroup,
    scriptUsers,
    sameDraft,
    setGroupEnabled,
    setItemEnabled,
    writeItem,
    type AutomationItem,
    type AutomationKind,
    type Draft,
} from "./automationModel";
import "./automation.css";

type KindFilter = "all" | AutomationKind;

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
function GroupHeader({ group, count, collapsed, onToggleCollapse, onMenu, renaming, onRenamed }: {
    group: AutomationGroup | null;
    count: number;
    collapsed: boolean;
    onToggleCollapse: () => void;
    onMenu?: (e: MouseEvent<HTMLElement>) => void;
    renaming: boolean;
    onRenamed: () => void;
}) {
    const [name, setName] = useState(group?.name ?? "");
    useEffect(() => setName(group?.name ?? ""), [group?.name, renaming]);
    const off = group?.enabled === false;
    const Chevron = collapsed ? ChevronRight : ChevronDown;
    const Icon = collapsed ? Folder : FolderOpen;
    return (
        <div className={`automation-group${off ? " is-off" : ""}`} onContextMenu={onMenu}>
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
        const known = new Set(groups.map(g => g.id));
        for (const item of visible) {
            const key = item.data.group && known.has(item.data.group) ? item.data.group : "";
            if (!byGroup.has(key)) byGroup.set(key, []);
            byGroup.get(key)!.push(item);
        }
        const list: { group: AutomationGroup | null; items: AutomationItem[] }[] = groups
            // Empty groups stay listed while nothing is filtered, so they can be managed.
            .filter(g => byGroup.has(g.id) || !filtering)
            .map(g => ({ group: g, items: byGroup.get(g.id) ?? [] }));
        if (byGroup.has("")) list.push({ group: null, items: byGroup.get("")! });
        return list;
    }, [visible, groups, filtering]);

    const selectedItem = items.find(i => i.id === selectedId) ?? null;
    const selectedDraft: Draft | null = selectedId
        ? drafts[selectedId] ?? (selectedItem ? draftFromItem(selectedItem, groups) : null)
        : null;

    // A stored element that disappeared (deleted elsewhere) is no longer selected.
    useEffect(() => {
        if (selectedId && !selectedItem && !drafts[selectedId]) setSelectedId(null);
    }, [selectedId, selectedItem, drafts]);

    const isDirty = (draft: Draft) => {
        if (draft.isNew) return true;
        const stored = items.find(i => i.id === draft.id);
        return !stored || !sameDraft(draft, draftFromItem(stored, groups));
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

    function create(kind: AutomationKind, groupName = "") {
        const draft = newDraft(kind, groupName);
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
        writeItem(itemFromDraft(selectedDraft));
        dropDraft(selectedDraft.id);
        setSaveError(null);
    }

    function revert() {
        if (!selectedDraft) return;
        dropDraft(selectedDraft.id);
        if (selectedDraft.isNew) setSelectedId(null);
        setSaveError(null);
    }

    function remove() {
        if (!selectedDraft) return;
        if (!selectedDraft.isNew) {
            const users = selectedDraft.kind === "script" ? scriptUsers(selectedDraft.id, items).length : 0;
            const warning = users ? ` Uzywa go ${users} ${users === 1 ? "element" : "elementow"} - ich akcja przestanie dzialac.` : "";
            if (!confirm(`Czy na pewno chcesz usunąć ${THIS_ONE[selectedDraft.kind]}?${warning}`)) return;
            removeItem(selectedDraft.kind, selectedDraft.id);
        }
        dropDraft(selectedDraft.id);
        setSelectedId(null);
    }

    function duplicate() {
        if (!selectedDraft) return;
        const copy = newDraft(selectedDraft.kind, selectedDraft.groupName);
        const data = { ...selectedDraft.data, id: copy.id, name: selectedDraft.data.name ? `${selectedDraft.data.name} (kopia)` : undefined };
        const draft = { ...copy, data };
        setDrafts(prev => ({ ...prev, [draft.id]: draft }));
        select(draft.id);
    }

    function toggleItem(item: AutomationItem, on: boolean) {
        setItemEnabled(item, on);
        // An open edit follows the switch rather than silently undoing it on save.
        const draft = drafts[item.id];
        if (draft) setDrafts(prev => ({ ...prev, [item.id]: { ...draft, data: { ...draft.data, enabled: on ? undefined : false } } }));
    }

    function groupMenu(e: MouseEvent<HTMLElement>, group: AutomationGroup) {
        e.preventDefault();
        openMenuAt(e, [
            { label: "Nowy alias w grupie", action: () => create("alias", group.name) },
            { label: "Nowy wyzwalacz w grupie", action: () => create("trigger", group.name) },
            { label: "Nowy skrypt w grupie", action: () => create("script", group.name) },
            { label: "Zmien nazwe", action: () => setRenamingGroup(group.id) },
            { label: "Eksportuj grupe", action: () => download(packFileName(group.name), JSON.stringify(buildPack(group.id), null, 2)) },
            {
                label: "Usun grupe",
                action: () => {
                    if (confirm(`Usunac grupe "${group.name}"? Jej aliasy i wyzwalacze zostana, bez grupy.`)) deleteGroup(group.id);
                },
            },
        ]);
    }

    function addMenu(e: MouseEvent<HTMLElement>) {
        if (kindFilter !== "all") {
            create(kindFilter);
            return;
        }
        openMenuAt(e, [
            { label: "Alias - gdy wpiszesz komende", action: () => create("alias") },
            { label: "Wyzwalacz - gdy gra wypisze linie lub zajdzie zdarzenie", action: () => create("trigger") },
            { label: "Skrypt - kod JavaScript uruchamiany akcja lub komenda", action: () => create("script") },
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
            const scripts = result.scripts ? " Skrypty sa wylaczone - przejrzyj ich kod, zanim je wlaczysz." : "";
            setNotice(`Zaimportowano: ${countLabel(result.aliases, result.triggers, result.scripts)}.${skipped}${scripts}`);
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

    const renderRow = (item: AutomationItem) => {
        const draft = drafts[item.id];
        const shown: AutomationItem = draft ? { ...item, data: draft.data } as AutomationItem : item;
        const title = itemTitle(shown);
        const off = item.data.enabled === false;
        return (
            <div key={item.id} className={`automation-item${selectedId === item.id ? " is-selected" : ""}${off ? " is-off" : ""}`}>
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
                                />
                            )}
                            {!isCollapsed && (
                                <div className={group || groups.length > 0 ? "automation-section__items" : undefined}>
                                    {sectionItems.map(renderRow)}
                                    {group && sectionItems.length === 0 && <p className="automation-empty is-small">Pusta grupa.</p>}
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
                <input
                    className="automation-editor__group popup-input"
                    autoComplete="off"
                    {...NO_PASSWORD_MANAGER}
                    title="Grupa"
                    list="automation-groups"
                    value={selectedDraft.groupName}
                    placeholder="Bez grupy"
                    onChange={e => updateDraft({ ...selectedDraft, groupName: e.target.value })}
                />
                <datalist id="automation-groups">
                    {groups.map(g => <option key={g.id} value={g.name} />)}
                </datalist>
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
