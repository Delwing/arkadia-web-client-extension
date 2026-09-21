import { useEffect, useMemo, useRef, useState } from "react";
import { Button, Check, DeleteButton, Field, Input, Select } from '@web-ui/primitives/index.ts';
import {
    type MultibindImportRow,
    type MultibindImportWorkerRequest,
    type MultibindImportWorkerResponse,
    type ParsedMultibindDatabase,
} from "./multibindImport.shared";
import {
    replaceAll as replaceMultibinds,
    subscribe as subscribeMultibinds,
    toKey,
    type StoredMultibindRecord,
} from "../dataStores/multibindStore";
import type { Bind, BindSettings, DirectionBinds, Keymap } from "@modules/core/keymapTypes";
import SubDialog from "../SubDialog";
import {
    getKeymapStore,
    getKeymapList,
    getActiveKeymapId,
    saveKeymapBinds,
    switchKeymap,
    createKeymap,
    renameKeymap,
    deleteKeymap,
    defaultBinds,
    mergeBindSettings,
} from "@modules/core/keymapStorage";

const isMac = typeof navigator !== 'undefined' && /Mac/.test(navigator.platform);
const ALT_LABEL = isMac ? '⌥' : 'ALT';

type ConflictPolicy = 'keep-last' | 'keep-first' | 'skip-conflicts';

interface ImportData {
    fileName: string;
    rows: MultibindImportRow[];
    totalRows: number;
    invalidRows: number;
}

interface ImportPlan {
    rows: MultibindImportRow[];
    totalRows: number;
    invalidRows: number;
    duplicatesDropped: number;
    newEntries: number;
    potentialUpdates: number;
}

const CONFLICT_POLICIES: { value: ConflictPolicy; label: string }[] = [
    { value: 'keep-last', label: 'Zachowaj ostatni wpis' },
    { value: 'keep-first', label: 'Zachowaj pierwszy wpis' },
    { value: 'skip-conflicts', label: 'Pomiń konflikty' },
];

function applyConflictPolicy(rows: MultibindImportRow[], policy: ConflictPolicy) {
    const map = new Map<string, MultibindImportRow>();
    const removedKeys = new Set<string>();
    let dropped = 0;

    rows.forEach(row => {
        const key = row.uniqness;
        if (removedKeys.has(key)) {
            dropped += 1;
            return;
        }
        const existing = map.get(key);
        if (!existing) {
            map.set(key, row);
            return;
        }
        if (policy === 'keep-first') {
            dropped += 1;
            return;
        }
        if (policy === 'keep-last') {
            map.set(key, row);
            dropped += 1;
            return;
        }
        map.delete(key);
        removedKeys.add(key);
        dropped += 2;
    });

    return { rows: Array.from(map.values()), dropped };
}

function label(bind: Bind) {
    let key = bind.key;
    if (key.startsWith('Digit')) key = key.substring(5);
    else if (key.startsWith('Key')) key = key.substring(3);
    else if (key === 'BracketRight') key = ']';
    else if (key === 'BracketLeft') key = '[';
    else if (key === 'Backquote') key = '`';
    else if (key === 'Equal') key = '=';
    else if (key === 'Minus') key = '-';
    const parts: string[] = [];
    if (bind.ctrl) parts.push('CTRL');
    if (bind.alt) parts.push(ALT_LABEL);
    if (bind.shift) parts.push('SHIFT');
    parts.push(key);
    return parts.join('+');
}

/** Drops incomplete custom shortcuts (missing a key or a command) so an empty
 *  row left behind by "Dodaj skrót" is never persisted. */
function sanitizeBinds(binds: BindSettings): BindSettings {
    return {
        ...binds,
        custom: binds.custom.filter(b => b.command.trim() !== '' && b.key !== ''),
    };
}

type SimpleBindName = 'lamp' | 'attack' | 'support' | 'moveMode' | 'roomBind' | 'drinkable' | 'gateBind' | 'doubleK';

/** Read-only field that takes the next keypress (with modifiers) as the bind. */
function KeyCapture({ value, placeholder, onKeyDown }: {
    value: string;
    placeholder?: string;
    onKeyDown: (ev: React.KeyboardEvent) => void;
}) {
    return (
        <input
            type="text"
            readOnly
            className="popup-input popup-input--control bind-key"
            value={value}
            placeholder={placeholder ?? 'Klawisz…'}
            onKeyDown={onKeyDown}
        />
    );
}

/** A labelled bind. `stacked` puts the label over the key (compass cells). */
function BindRow({ label: text, value, placeholder, onKeyDown, onClear, stacked }: {
    label: string;
    value: string;
    placeholder?: string;
    onKeyDown: (ev: React.KeyboardEvent) => void;
    onClear?: () => void;
    stacked?: boolean;
}) {
    return (
        <div className={`bind-row${stacked ? ' bind-row--stacked' : ''}`}>
            <span className="bind-row__label">{text}</span>
            <div className="bind-row__keys">
                <KeyCapture value={value} placeholder={placeholder} onKeyDown={onKeyDown} />
                {onClear && (
                    <Button size="sm" variant="ghost" className="popup-btn--icon" title="Przywróć domyślny" onClick={onClear}>✕</Button>
                )}
            </div>
        </div>
    );
}

function Binds() {
    const [binds, setBinds] = useState<BindSettings>(defaultBinds);
    const [keymapList, setKeymapList] = useState<Keymap[]>([]);
    const [selectedKeymapId, setSelectedKeymapId] = useState<string>('');
    const [editingName, setEditingName] = useState(false);
    const [keymapNameDraft, setKeymapNameDraft] = useState('');
    const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
    const [showRestoreConfirm, setShowRestoreConfirm] = useState(false);
    const [multibinds, setMultibinds] = useState<StoredMultibindRecord[]>([]);
    const [importData, setImportData] = useState<ImportData | null>(null);
    const [conflictPolicy, setConflictPolicy] = useState<ConflictPolicy>('keep-last');
    const [overwriteExisting, setOverwriteExisting] = useState(true);
    const [showImportModal, setShowImportModal] = useState(false);
    const [importError, setImportError] = useState<string | null>(null);
    const [importResult, setImportResult] = useState<{ newCount: number; updatedCount: number; skippedCount: number } | null>(null);
    const [isParsingDb, setIsParsingDb] = useState(false);
    const [isRunningImport, setIsRunningImport] = useState(false);
    const [importProgress, setImportProgress] = useState<{ processed: number; total: number; eta: number | null } | null>(null);
    const [importCancelled, setImportCancelled] = useState(false);
    const fileInputRef = useRef<HTMLInputElement | null>(null);
    const cancelImportRef = useRef(false);
    const workerRef = useRef<Worker | null>(null);

    useEffect(() => {
        return () => {
            if (workerRef.current) {
                workerRef.current.terminate();
                workerRef.current = null;
            }
        };
    }, []);

    async function parseInWorker(buffer: ArrayBuffer): Promise<ParsedMultibindDatabase> {
        if (!workerRef.current) {
            workerRef.current = new Worker(new URL('./multibindImport.worker.ts', import.meta.url), {
                type: 'module',
            });
        }

        const worker = workerRef.current;

        return new Promise((resolve, reject) => {
            const cleanup = () => {
                worker.removeEventListener('message', handleMessage);
                worker.removeEventListener('error', handleError);
            };

            const handleMessage = (event: MessageEvent) => {
                const data = event.data as MultibindImportWorkerResponse | undefined;
                if (!data) {
                    return;
                }
                if (data.type === 'success') {
                    cleanup();
                    resolve(data.payload);
                }
                if (data.type === 'error') {
                    cleanup();
                    reject(new Error(data.message));
                }
            };

            const handleError = (event: ErrorEvent) => {
                cleanup();
                if (workerRef.current === worker) {
                    workerRef.current.terminate();
                    workerRef.current = null;
                }
                reject(event.error ?? new Error(event.message));
            };

            worker.addEventListener('message', handleMessage);
            worker.addEventListener('error', handleError);

            const request: MultibindImportWorkerRequest = {
                type: 'parse',
                buffer,
            };
            worker.postMessage(request, [buffer]);
        });
    }

    function loadKeymap(keymapId?: string) {
        const list = getKeymapList();
        setKeymapList(list);

        const targetId = keymapId || getActiveKeymapId();
        setSelectedKeymapId(targetId);

        const store = getKeymapStore();
        const keymap = store.keymaps[targetId];
        if (keymap) {
            setBinds(mergeBindSettings(keymap.binds));
        } else if (list.length > 0) {
            setSelectedKeymapId(list[0].id);
            setBinds(mergeBindSettings(list[0].binds));
        } else {
            setBinds(defaultBinds);
        }
    }

    useEffect(() => {
        loadKeymap();
    }, []);

    useEffect(() => {
        const unsubscribe = subscribeMultibinds(setMultibinds);
        return () => {
            unsubscribe();
        };
    }, []);

    const importPlan = useMemo<ImportPlan | null>(() => {
        if (!importData) {
            return null;
        }
        const conflictResult = applyConflictPolicy(importData.rows, conflictPolicy);
        const existingMap = new Map(multibinds.map(item => [toKey(item.roomId, item.index), item]));
        let newEntries = 0;
        let potentialUpdates = 0;
        conflictResult.rows.forEach(row => {
            const key = toKey(row.roomId, row.index);
            if (existingMap.has(key)) {
                potentialUpdates += 1;
            } else {
                newEntries += 1;
            }
        });
        return {
            rows: conflictResult.rows,
            totalRows: importData.totalRows,
            invalidRows: importData.invalidRows,
            duplicatesDropped: conflictResult.dropped,
            newEntries,
            potentialUpdates,
        };
    }, [importData, conflictPolicy, multibinds]);

    const importSummary = useMemo(() => {
        if (!importPlan) {
            return null;
        }
        const updates = overwriteExisting ? importPlan.potentialUpdates : 0;
        const skippedFromUpdates = overwriteExisting ? 0 : importPlan.potentialUpdates;
        const skipped = importPlan.invalidRows + importPlan.duplicatesDropped + skippedFromUpdates;
        return {
            totalRows: importPlan.totalRows,
            toImport: importPlan.rows.length,
            newEntries: importPlan.newEntries,
            updates,
            skipped,
            invalidRows: importPlan.invalidRows,
            duplicates: importPlan.duplicatesDropped,
            potentialUpdates: importPlan.potentialUpdates,
        };
    }, [importPlan, overwriteExisting]);

    function handleImportClick() {
        setImportError(null);
        setImportCancelled(false);
        setImportResult(null);
        fileInputRef.current?.click();
    }

    async function handleFileSelected(ev: React.ChangeEvent<HTMLInputElement>) {
        const file = ev.target.files?.[0];
        if (!file) {
            return;
        }
        setIsParsingDb(true);
        setImportError(null);
        setImportCancelled(false);
        setImportResult(null);
        try {
            const buffer = await file.arrayBuffer();
            const parsed = await parseInWorker(buffer);
            setImportData({
                fileName: file.name,
                rows: parsed.rows,
                totalRows: parsed.totalRows,
                invalidRows: parsed.invalidRows,
            });
            setConflictPolicy('keep-last');
            setOverwriteExisting(true);
            setShowImportModal(true);
        } catch (err) {
            setImportData(null);
            setShowImportModal(false);
            setImportError(err instanceof Error ? err.message : 'Nie udało się odczytać bazy danych.');
        } finally {
            setIsParsingDb(false);
            if (fileInputRef.current) {
                fileInputRef.current.value = '';
            }
        }
    }

    async function runImport() {
        if (!importPlan || importPlan.rows.length === 0) {
            return;
        }
        setIsRunningImport(true);
        setImportCancelled(false);
        setImportError(null);
        setImportResult(null);
        cancelImportRef.current = false;
        const total = importPlan.rows.length;
        setImportProgress({ processed: 0, total, eta: null });
        const existingMap = new Map(multibinds.map(item => [toKey(item.roomId, item.index), item]));
        const finalMap = new Map(existingMap);
        let processed = 0;
        let newCount = 0;
        let updateCount = 0;
        let skippedCount = importPlan.invalidRows + importPlan.duplicatesDropped;
        const startTime = performance.now();
        for (const row of importPlan.rows) {
            if (cancelImportRef.current) {
                break;
            }
            const key = toKey(row.roomId, row.index);
            const hasExisting = existingMap.has(key);
            if (hasExisting) {
                if (!overwriteExisting) {
                    skippedCount += 1;
                } else {
                    updateCount += 1;
                    finalMap.set(key, { roomId: row.roomId, index: row.index, action: row.action });
                }
            } else {
                newCount += 1;
                finalMap.set(key, { roomId: row.roomId, index: row.index, action: row.action });
            }
            processed += 1;
            if (processed % 20 === 0 || processed === total) {
                const elapsed = (performance.now() - startTime) / 1000;
                const eta = processed ? ((total - processed) * (elapsed / processed)) : null;
                setImportProgress({ processed, total, eta: eta && Number.isFinite(eta) ? Math.max(0, eta) : null });
            }
            if (processed % 200 === 0) {
                await new Promise<void>(resolve => setTimeout(resolve, 0));
            }
        }
        if (cancelImportRef.current) {
            setIsRunningImport(false);
            setImportProgress(null);
            setImportCancelled(true);
            return;
        }
        const finalList = Array.from(finalMap.values()).sort((a, b) => (a.roomId - b.roomId) || (a.index - b.index));
        try {
            await replaceMultibinds(finalList);
            setImportResult({
                newCount,
                updatedCount: overwriteExisting ? updateCount : 0,
                skippedCount,
            });
        } catch (err) {
            setImportError(err instanceof Error ? err.message : 'Nie udało się zapisać multibindów.');
        } finally {
            setIsRunningImport(false);
            setImportProgress(null);
        }
    }

    function handleCancelImport() {
        if (!isRunningImport) {
            setShowImportModal(false);
            return;
        }
        cancelImportRef.current = true;
    }

    function closeImportModal() {
        if (isRunningImport) {
            return;
        }
        setShowImportModal(false);
        setImportData(null);
        setImportError(null);
        setImportCancelled(false);
        setImportResult(null);
    }

    function handleCapture(name: keyof BindSettings, ev: React.KeyboardEvent) {
        ev.preventDefault();
        const { code, ctrlKey, altKey, shiftKey } = ev;
        setBinds(prev => ({ ...prev, [name]: { key: code, ctrl: ctrlKey, alt: altKey, shift: shiftKey } }));
    }

    function handleCaptureOptional(name: 'mainGates' | 'mainTransport' | 'mainLoot', ev: React.KeyboardEvent) {
        ev.preventDefault();
        const { code, ctrlKey, altKey, shiftKey } = ev;
        setBinds(prev => ({ ...prev, [name]: { key: code, ctrl: ctrlKey, alt: altKey, shift: shiftKey } }));
    }

    function handleClearOptional(name: 'mainGates' | 'mainTransport' | 'mainLoot') {
        setBinds(prev => {
            const next = { ...prev };
            delete next[name];
            return next;
        });
    }

    function handleCaptureDir(dir: keyof DirectionBinds, ev: React.KeyboardEvent) {
        ev.preventDefault();
        const { code, ctrlKey, altKey, shiftKey } = ev;
        setBinds(prev => ({
            ...prev,
            directions: { ...prev.directions, [dir]: { key: code, ctrl: ctrlKey, alt: altKey, shift: shiftKey } },
        }));
    }

    function handleCaptureCustom(idx: number, ev: React.KeyboardEvent) {
        ev.preventDefault();
        const { code, ctrlKey, altKey, shiftKey } = ev;
        setBinds(prev => ({
            ...prev,
            custom: prev.custom.map((b, i) => i === idx ? { ...b, key: code, ctrl: ctrlKey, alt: altKey, shift: shiftKey } : b),
        }));
    }

    function handleCaptureTemp(idx: number, ev: React.KeyboardEvent) {
        ev.preventDefault();
        const { code, ctrlKey, altKey, shiftKey } = ev;
        setBinds(prev => ({
            ...prev,
            temp: prev.temp.map((b, i) => i === idx ? { key: code, ctrl: ctrlKey, alt: altKey, shift: shiftKey } : b),
        }));
    }

    function handleCaptureEnemy(idx: number, ev: React.KeyboardEvent) {
        ev.preventDefault();
        const { code, ctrlKey, altKey, shiftKey } = ev;
        setBinds(prev => ({
            ...prev,
            enemy: prev.enemy.map((b, i) => i === idx ? { key: code, ctrl: ctrlKey, alt: altKey, shift: shiftKey } : b),
        }));
    }

    function handleCaptureEnemyBlock(idx: number, ev: React.KeyboardEvent) {
        ev.preventDefault();
        const { code, ctrlKey, altKey, shiftKey } = ev;
        setBinds(prev => ({
            ...prev,
            enemyBlock: prev.enemyBlock.map((b, i) => i === idx ? { key: code, ctrl: ctrlKey, alt: altKey, shift: shiftKey } : b),
        }));
    }

    function handleCommandChange(idx: number, command: string) {
        setBinds(prev => ({
            ...prev,
            custom: prev.custom.map((b, i) => i === idx ? { ...b, command } : b),
        }));
    }

    function addCustomBind() {
        shouldScrollToNewCustom.current = true;
        setBinds(prev => ({ ...prev, custom: [...prev.custom, { key: '', command: '' }] }));
    }

    function removeCustomBind(idx: number) {
        setBinds(prev => ({
            ...prev,
            custom: prev.custom.filter((_, i) => i !== idx),
        }));
    }

    function save() {
        saveKeymapBinds(selectedKeymapId, sanitizeBinds(binds));
        window.dispatchEvent(new Event('close-options'));
    }

    function handleKeymapSwitch(keymapId: string) {
        // Save current edits to the current keymap before switching
        saveKeymapBinds(selectedKeymapId, sanitizeBinds(binds));

        setSelectedKeymapId(keymapId);
        const store = getKeymapStore();
        const keymap = store.keymaps[keymapId];
        if (keymap) {
            setBinds(mergeBindSettings(keymap.binds));
        }
        // Also activate this keymap for the current device
        switchKeymap(keymapId);
    }

    function handleCreateKeymap() {
        // Save current edits first
        saveKeymapBinds(selectedKeymapId, sanitizeBinds(binds));
        // Create new keymap carrying over currently shown bindings
        const newKeymap = createKeymap('Nowa mapa klawiszy', binds);
        // Switch to the new keymap
        switchKeymap(newKeymap.id);
        loadKeymap(newKeymap.id);
        // Start editing the name immediately
        setEditingName(true);
        setKeymapNameDraft(newKeymap.name);
    }

    function handleStartRename() {
        const current = keymapList.find(k => k.id === selectedKeymapId);
        if (current) {
            setEditingName(true);
            setKeymapNameDraft(current.name);
        }
    }

    function handleFinishRename() {
        if (keymapNameDraft.trim()) {
            renameKeymap(selectedKeymapId, keymapNameDraft.trim());
        }
        setEditingName(false);
        setKeymapList(getKeymapList());
    }

    function handleRenameKeyDown(ev: React.KeyboardEvent) {
        if (ev.key === 'Enter') {
            handleFinishRename();
        } else if (ev.key === 'Escape') {
            setEditingName(false);
        }
    }

    function handleDeleteKeymap() {
        if (deleteKeymap(selectedKeymapId)) {
            setShowDeleteConfirm(false);
            loadKeymap();
        }
    }

    function handleRestoreDefaults() {
        const restored = { ...structuredClone(defaultBinds), custom: binds.custom };
        delete restored.mainGates;
        delete restored.mainTransport;
        delete restored.mainLoot;
        setBinds(restored);
        setShowRestoreConfirm(false);
    }

    // The import trigger sits in the modal's title bar and Save in its footer, so
    // both stay visible while the bind list scrolls. Each shell (stock Bootstrap,
    // forge MenuModal) hosts its own chrome and reaches these handlers through
    // window events; refs keep the listeners bound to the latest closures without
    // re-subscribing on every keystroke. Parsing state is broadcast back so the
    // title-bar button can reflect its disabled/spinner state.
    const handleImportClickRef = useRef(handleImportClick);
    handleImportClickRef.current = handleImportClick;
    const saveRef = useRef(save);
    saveRef.current = save;
    const addCustomBindRef = useRef(addCustomBind);
    addCustomBindRef.current = addCustomBind;
    useEffect(() => {
        const onImport = () => handleImportClickRef.current();
        const onSave = () => saveRef.current();
        const onAddCustom = () => addCustomBindRef.current();
        window.addEventListener('binds-open-import', onImport);
        window.addEventListener('binds-save', onSave);
        window.addEventListener('binds-add-custom', onAddCustom);
        return () => {
            window.removeEventListener('binds-open-import', onImport);
            window.removeEventListener('binds-save', onSave);
            window.removeEventListener('binds-add-custom', onAddCustom);
        };
    }, []);
    useEffect(() => {
        window.dispatchEvent(new CustomEvent('binds-parsing', { detail: isParsingDb }));
    }, [isParsingDb]);

    // After "Dodaj skrót" (fired from the footer) appends a row, bring it into
    // view and focus its command input so the user can type straight away.
    const lastCustomRowRef = useRef<HTMLDivElement | null>(null);
    const shouldScrollToNewCustom = useRef(false);
    useEffect(() => {
        if (!shouldScrollToNewCustom.current) return;
        shouldScrollToNewCustom.current = false;
        const row = lastCustomRowRef.current;
        if (!row) return;
        row.scrollIntoView({ block: 'nearest' });
        row.querySelector('input')?.focus();
    }, [binds.custom.length]);

    const optionalRows: { name: 'mainGates' | 'mainTransport' | 'mainLoot'; label: string }[] = [
        { name: 'mainGates', label: 'Wrota' },
        { name: 'mainTransport', label: 'Transport' },
        { name: 'mainLoot', label: 'Zbieranie z cial' },
    ];
    const simpleRows: { name: SimpleBindName; label: string }[] = [
        { name: 'lamp', label: 'Napełnij lampę' },
        { name: 'attack', label: 'Atakuj' },
        { name: 'support', label: 'Wesprzyj' },
        { name: 'moveMode', label: 'Tryb ruchu' },
        { name: 'roomBind', label: 'Bind w lokacji' },
        { name: 'drinkable', label: 'Napij się wody' },
        { name: 'gateBind', label: 'Wrota' },
        { name: 'doubleK', label: 'Dwukrotne +k' },
    ];
    // Compass order, read row by row: NW N NE / W zerknij E / SW S SE.
    const compass: (keyof DirectionBinds)[] = ['nw', 'n', 'ne', 'w', 'zerknij', 'e', 'sw', 's', 'se'];
    const dirLabel = (dir: keyof DirectionBinds) =>
        dir === 'zerknij' ? 'Zerknij' : dir === 'special' ? 'Specjalne' : dir.toUpperCase();

    return (
        <div className="binds-editor">
            <input ref={fileInputRef} type="file" accept=".db,application/x-sqlite3" hidden onChange={handleFileSelected} />
            {showImportModal && (
                <SubDialog
                    title="Importuj bazę multibindów"
                    onClose={closeImportModal}
                    // No way out while the worker is chewing through the file —
                    // matches the old modal's static backdrop + keyboard={false}.
                    dismissible={!isRunningImport}
                    footer={isRunningImport ? (
                        <Button onClick={handleCancelImport}>Anuluj</Button>
                    ) : (
                        <>
                            <Button onClick={closeImportModal}>Zamknij</Button>
                            <Button variant="solid" onClick={runImport} disabled={!importPlan || importPlan.rows.length === 0 || !!importResult}>Importuj</Button>
                        </>
                    )}
                >
                    <div className="ui-settings-stack">
                        {importError && <div className="popup-notice popup-notice--danger">{importError}</div>}
                        {importSummary ? (
                            <div className="binds-import__summary">
                                {([
                                    ['Plik', importData?.fileName || '—'],
                                    ['Łącznie wierszy', importSummary.totalRows],
                                    ['Wiersze do importu', importSummary.toImport],
                                    ['Nowe wpisy', importSummary.newEntries],
                                    ['Aktualizacje', importSummary.updates],
                                    ['Pominięte', importSummary.skipped],
                                    ...(importSummary.invalidRows > 0 ? [['Nieprawidłowe wiersze', importSummary.invalidRows]] : []),
                                    ...(importSummary.duplicates > 0 ? [['Usunięte konflikty', importSummary.duplicates]] : []),
                                ] as [string, string | number][]).map(([name, value]) => (
                                    <div key={name} className="binds-import__row">
                                        <span>{name}:</span> <strong>{value}</strong>
                                    </div>
                                ))}
                            </div>
                        ) : (
                            !importError && <p className="popup-field__hint">Brak danych do importu.</p>
                        )}
                        {importPlan && (
                            <>
                                <Check
                                    label="Nadpisz wpisy"
                                    checked={overwriteExisting}
                                    disabled={isRunningImport}
                                    onChange={ev => setOverwriteExisting(ev.target.checked)}
                                />
                                <Field label="Polityka konfliktów">
                                    <Select
                                        className="settings-narrow"
                                        value={conflictPolicy}
                                        onChange={ev => setConflictPolicy(ev.target.value as ConflictPolicy)}
                                        disabled={isRunningImport}
                                    >
                                        {CONFLICT_POLICIES.map(option => (
                                            <option key={option.value} value={option.value}>{option.label}</option>
                                        ))}
                                    </Select>
                                </Field>
                            </>
                        )}
                        {importProgress && (
                            <div className="popup-field">
                                <progress
                                    className="popup-progress"
                                    max={importProgress.total || 1}
                                    value={importProgress.processed}
                                />
                                <div className="binds-import__progress-text">
                                    <span>Przetworzono wierszy: {importProgress.processed}/{importProgress.total}</span>
                                    <span>{importProgress.eta !== null ? `~${importProgress.eta.toFixed(1)} s do końca` : 'Szacowanie…'}</span>
                                </div>
                            </div>
                        )}
                        {isRunningImport && (
                            <div className="popup-inline">
                                <span className="popup-spinner" />
                                <span>Importowanie…</span>
                            </div>
                        )}
                        {importCancelled && <div className="popup-notice popup-notice--warning">Import przerwany.</div>}
                        {importResult && !isRunningImport && (
                            <div className="popup-notice popup-notice--success">
                                <strong>Import zakończony.</strong>
                                <div>Nowe wpisy: {importResult.newCount}</div>
                                <div>Zaktualizowane: {importResult.updatedCount}</div>
                                <div>Pominięte: {importResult.skippedCount}</div>
                            </div>
                        )}
                    </div>
                </SubDialog>
            )}
            {importError && !showImportModal && (
                <div className="popup-notice popup-notice--danger">{importError}</div>
            )}

            <div className="binds-keymap">
                <label className="popup-field__label" htmlFor="binds-keymap-select">Mapa klawiszy</label>
                {editingName ? (
                    <Input
                        mono
                        className="binds-keymap__control"
                        value={keymapNameDraft}
                        onChange={ev => setKeymapNameDraft(ev.target.value)}
                        onBlur={handleFinishRename}
                        onKeyDown={handleRenameKeyDown}
                        data-dialog-escape="local"
                        autoFocus
                    />
                ) : (
                    <Select
                        id="binds-keymap-select"
                        className="binds-keymap__control"
                        value={selectedKeymapId}
                        onChange={ev => handleKeymapSwitch(ev.target.value)}
                    >
                        {keymapList.map(k => (
                            <option key={k.id} value={k.id}>{k.name}</option>
                        ))}
                    </Select>
                )}
                <div className="binds-keymap__actions">
                <Button size="sm" variant="ghost" onClick={handleStartRename} disabled={editingName}>Zmień nazwę</Button>
                <Button size="sm" variant="ghost" onClick={handleCreateKeymap} title="Nowa mapa (kopia bieżących bindów)">Nowa mapa</Button>
                <Button size="sm" variant="ghost" onClick={() => setShowRestoreConfirm(true)} title="Przywróć domyślne bindy (zachowaj własne skróty)">
                    Przywróć domyślne
                </Button>
                <DeleteButton
                    title="Usuń mapę klawiszy"
                    onClick={() => setShowDeleteConfirm(true)}
                    disabled={keymapList.length <= 1}
                />
                </div>
            </div>
            {showDeleteConfirm && (
                <SubDialog
                    size="sm"
                    title="Usunąć mapę klawiszy?"
                    onClose={() => setShowDeleteConfirm(false)}
                    footer={(
                        <>
                            <Button onClick={() => setShowDeleteConfirm(false)}>Anuluj</Button>
                            <Button variant="danger" onClick={handleDeleteKeymap}>Usuń</Button>
                        </>
                    )}
                >
                    Czy na pewno chcesz usunąć mapę klawiszy <strong>{keymapList.find(k => k.id === selectedKeymapId)?.name}</strong>?
                </SubDialog>
            )}
            {showRestoreConfirm && (
                <SubDialog
                    size="sm"
                    title="Przywrócić domyślne bindy?"
                    onClose={() => setShowRestoreConfirm(false)}
                    footer={(
                        <>
                            <Button onClick={() => setShowRestoreConfirm(false)}>Anuluj</Button>
                            <Button variant="solid" onClick={handleRestoreDefaults}>Przywróć</Button>
                        </>
                    )}
                >
                    Standardowe bindy zostaną przywrócone do wartości domyślnych. Własne skróty pozostaną bez zmian.
                </SubDialog>
            )}

            <p className="popup-field__hint binds-editor__hint">Kliknij pole i naciśnij klawisz (z CTRL / {ALT_LABEL} / SHIFT), aby przypisać skrót.</p>

            <section className="binds-section">
                <h6 className="binds-section__title">Funkcyjny</h6>
                <p className="popup-field__hint">
                    Jeden klawisz do tego, co akurat jest pod ręką: wrota, transport, zbieranie z ciał…
                    Wybranym sytuacjom możesz dać osobny klawisz — puste pole używa klawisza funkcyjnego.
                </p>
                <div className="binds-functional">
                    <BindRow label="Funkcyjny" value={label(binds.main)} onKeyDown={ev => handleCapture('main', ev)} />
                    <div className="binds-group">
                        <span className="popup-field__label">Osobny klawisz dla</span>
                        {optionalRows.map(row => (
                            <BindRow
                                key={row.name}
                                label={row.label}
                                value={binds[row.name] ? label(binds[row.name]!) : ''}
                                placeholder={label(binds.main)}
                                onKeyDown={ev => handleCaptureOptional(row.name, ev)}
                                onClear={binds[row.name] ? () => handleClearOptional(row.name) : undefined}
                            />
                        ))}
                    </div>
                </div>
            </section>

            <section className="binds-section">
                <h6 className="binds-section__title">Podstawowe</h6>
                <div className="binds-grid binds-grid--columns">
                    {simpleRows.map(row => (
                        <BindRow key={row.name} label={row.label} value={label(binds[row.name] as Bind)} onKeyDown={ev => handleCapture(row.name, ev)} />
                    ))}
                    {[0, 1].map(i => (
                        <BindRow key={`temp${i}`} label={`Tymczasowe ${i + 1}`} value={label(binds.temp[i])} onKeyDown={ev => handleCaptureTemp(i, ev)} />
                    ))}
                </div>
            </section>

            <section className="binds-section">
                <h6 className="binds-section__title">Wrogowie</h6>
                <div className="binds-grid binds-grid--columns">
                    {[0, 1, 2].map(i => (
                        <BindRow key={`enemy${i}`} label={`Atakuj wroga ${i + 1}`} value={label(binds.enemy[i])} onKeyDown={ev => handleCaptureEnemy(i, ev)} />
                    ))}
                    {[0, 1, 2].map(i => (
                        <BindRow key={`block${i}`} label={`Blokuj wroga ${i + 1}`} value={label(binds.enemyBlock[i])} onKeyDown={ev => handleCaptureEnemyBlock(i, ev)} />
                    ))}
                </div>
            </section>

            <section className="binds-section">
                <h6 className="binds-section__title">Kierunki</h6>
                <div className="binds-directions">
                    <div className="binds-compass">
                        {compass.map(dir => (
                            <BindRow key={dir} stacked label={dirLabel(dir)} value={label(binds.directions[dir])} onKeyDown={ev => handleCaptureDir(dir, ev)} />
                        ))}
                    </div>
                    <div className="binds-group">
                        {(['u', 'd', 'special'] as const).map(dir => (
                            <BindRow key={dir} label={dirLabel(dir)} value={label(binds.directions[dir])} onKeyDown={ev => handleCaptureDir(dir, ev)} />
                        ))}
                    </div>
                </div>
            </section>

            <section className="binds-section">
                <h6 className="binds-section__title">Własne skróty</h6>
                {binds.custom.length === 0 ? (
                    <p className="popup-field__hint">Brak własnych skrótów. Dodaj je przyciskiem „Dodaj skrót” na dole okna.</p>
                ) : (
                    <div className="binds-custom">
                        {binds.custom.map((b, idx) => (
                            <div key={idx} className="bind-row bind-row--custom" ref={idx === binds.custom.length - 1 ? lastCustomRowRef : undefined}>
                                <Input
                                    mono
                                    placeholder="Komenda"
                                    value={b.command}
                                    onChange={ev => handleCommandChange(idx, ev.target.value)}
                                />
                                <KeyCapture value={b.key ? label(b) : ''} onKeyDown={ev => handleCaptureCustom(idx, ev)} />
                                <DeleteButton onClick={() => removeCustomBind(idx)} />
                            </div>
                        ))}
                    </div>
                )}
            </section>
        </div>
    );
}

export default Binds;
