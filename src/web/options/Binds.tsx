import { useEffect, useMemo, useRef, useState } from "react";
import {Alert, Button, Form, ProgressBar, Spinner, Table} from 'react-bootstrap';
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
    const lastCustomRowRef = useRef<HTMLTableRowElement | null>(null);
    const shouldScrollToNewCustom = useRef(false);
    useEffect(() => {
        if (!shouldScrollToNewCustom.current) return;
        shouldScrollToNewCustom.current = false;
        const row = lastCustomRowRef.current;
        if (!row) return;
        row.scrollIntoView({ block: 'nearest' });
        row.querySelector('input')?.focus();
    }, [binds.custom.length]);

    return (
        <div className="m-2 d-flex flex-column gap-2">
            <input
                ref={fileInputRef}
                type="file"
                accept=".db,application/x-sqlite3"
                style={{ display: 'none' }}
                onChange={handleFileSelected}
            />
            {showImportModal && (
                <SubDialog
                    title="Importuj bazę multibindów"
                    onClose={closeImportModal}
                    // No way out while the worker is chewing through the file —
                    // matches the old modal's static backdrop + keyboard={false}.
                    dismissible={!isRunningImport}
                    footer={isRunningImport ? (
                        <Button variant="secondary" onClick={handleCancelImport}>Anuluj</Button>
                    ) : (
                        <>
                            <Button variant="secondary" onClick={closeImportModal}>Zamknij</Button>
                            <Button onClick={runImport} disabled={!importPlan || importPlan.rows.length === 0 || !!importResult}>Importuj</Button>
                        </>
                    )}
                >
                    {importError && (
                        <Alert variant="danger">{importError}</Alert>
                    )}
                    {importSummary ? (
                        <div className="d-flex flex-column gap-1">
                            <div><strong>Plik:</strong> {importData?.fileName || '—'}</div>
                            <div>Łącznie wierszy: {importSummary.totalRows}</div>
                            <div>Wiersze do importu: {importSummary.toImport}</div>
                            <div>Nowe wpisy: {importSummary.newEntries}</div>
                            <div>Aktualizacje: {importSummary.updates}</div>
                            <div>Pominięte: {importSummary.skipped}</div>
                            {importSummary.invalidRows > 0 && (
                                <div className="text-muted small">Nieprawidłowe wiersze: {importSummary.invalidRows}</div>
                            )}
                            {importSummary.duplicates > 0 && (
                                <div className="text-muted small">Usunięte konflikty: {importSummary.duplicates}</div>
                            )}
                        </div>
                    ) : (
                        !importError && <div>Brak danych do importu.</div>
                    )}
                    {importPlan && (
                        <>
                            <Form.Check
                                className="mt-3"
                                type="checkbox"
                                label="Nadpisz wpisy"
                                checked={overwriteExisting}
                                disabled={isRunningImport}
                                onChange={ev => setOverwriteExisting(ev.target.checked)}
                            />
                            <Form.Group className="mt-3">
                                <Form.Label>Polityka konfliktów</Form.Label>
                                <Form.Select
                                    value={conflictPolicy}
                                    onChange={ev => setConflictPolicy(ev.target.value as ConflictPolicy)}
                                    disabled={isRunningImport}
                                >
                                    {CONFLICT_POLICIES.map(option => (
                                        <option key={option.value} value={option.value}>{option.label}</option>
                                    ))}
                                </Form.Select>
                            </Form.Group>
                        </>
                    )}
                    {importProgress && (
                        <div className="mt-4">
                            <ProgressBar now={importProgress.total ? (importProgress.processed / importProgress.total) * 100 : 0} />
                            <div className="d-flex justify-content-between mt-2 small">
                                <span>Przetworzono wierszy: {importProgress.processed}/{importProgress.total}</span>
                                <span>{importProgress.eta !== null ? `~${importProgress.eta.toFixed(1)} s do końca` : 'Szacowanie…'}</span>
                            </div>
                        </div>
                    )}
                    {isRunningImport && (
                        <div className="mt-3 d-flex align-items-center gap-2">
                            <Spinner animation="border" size="sm" role="status" />
                            <span>Importowanie…</span>
                        </div>
                    )}
                    {importCancelled && (
                        <Alert variant="warning" className="mt-3 mb-0">Import przerwany.</Alert>
                    )}
                    {importResult && !isRunningImport && (
                        <Alert variant="success" className="mt-3 mb-0">
                            <div className="d-flex flex-column gap-1">
                                <div><strong>Import zakończony.</strong></div>
                                <div>Nowe wpisy: {importResult.newCount}</div>
                                <div>Zaktualizowane: {importResult.updatedCount}</div>
                                <div>Pominięte: {importResult.skippedCount}</div>
                            </div>
                        </Alert>
                    )}
                </SubDialog>
            )}
            {importError && !showImportModal && (
                <Alert variant="danger" className="mb-0">{importError}</Alert>
            )}
            <div className="d-flex align-items-center gap-2 flex-wrap">
                <Form.Label className="mb-0 fw-bold">Mapa klawiszy:</Form.Label>
                {editingName ? (
                    <Form.Control
                        type="text"
                        size="sm"
                        style={{ width: '200px' }}
                        value={keymapNameDraft}
                        onChange={ev => setKeymapNameDraft(ev.target.value)}
                        onBlur={handleFinishRename}
                        onKeyDown={handleRenameKeyDown}
                        autoFocus
                        autoCorrect="off"
                        autoComplete="off"
                        autoCapitalize="off"
                        spellCheck={false}
                    />
                ) : (
                    <Form.Select
                        size="sm"
                        style={{ width: '200px' }}
                        value={selectedKeymapId}
                        onChange={ev => handleKeymapSwitch(ev.target.value)}
                    >
                        {keymapList.map(k => (
                            <option key={k.id} value={k.id}>{k.name}</option>
                        ))}
                    </Form.Select>
                )}
                <Button size="sm" variant="outline-secondary" onClick={handleStartRename} disabled={editingName} title="Zmień nazwę">
                    Zmień nazwę
                </Button>
                <Button size="sm" variant="outline-primary" onClick={handleCreateKeymap} title="Nowa mapa (kopia bieżących bindów)">
                    Nowa mapa
                </Button>
                <Button
                    size="sm"
                    variant="outline-danger"
                    onClick={() => setShowDeleteConfirm(true)}
                    disabled={keymapList.length <= 1}
                    title="Usuń mapę klawiszy"
                >
                    Usuń
                </Button>
                <Button
                    size="sm"
                    variant="outline-warning"
                    onClick={() => setShowRestoreConfirm(true)}
                    title="Przywróć domyślne bindy (zachowaj własne skróty)"
                >
                    Przywróć domyślne
                </Button>
            </div>
            {showDeleteConfirm && (
                <SubDialog
                    size="sm"
                    title="Usunąć mapę klawiszy?"
                    onClose={() => setShowDeleteConfirm(false)}
                    footer={(
                        <>
                            <Button variant="secondary" size="sm" onClick={() => setShowDeleteConfirm(false)}>Anuluj</Button>
                            <Button variant="danger" size="sm" onClick={handleDeleteKeymap}>Usuń</Button>
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
                            <Button variant="secondary" size="sm" onClick={() => setShowRestoreConfirm(false)}>Anuluj</Button>
                            <Button variant="warning" size="sm" onClick={handleRestoreDefaults}>Przywróć</Button>
                        </>
                    )}
                >
                    Standardowe bindy zostaną przywrócone do wartości domyślnych. Własne skróty pozostaną bez zmian.
                </SubDialog>
            )}
            <fieldset className="p-0 border-0 m-0">
                <Table bordered size="sm" hover className="table-modern table-zebra mb-2">
                    <tbody className="align-middle">
                        <tr>
                            <td className="w-32">Funkcyjny</td>
                            <td>
                                <Form.Control
                                    type="text"
                                    readOnly
                                    size="sm"
                                    value={label(binds.main)}
                                    onKeyDown={ev => handleCapture('main', ev)}
                                />
                            </td>
                        </tr>
                        <tr>
                            <td className="w-32 ps-4 text-muted">└ Wrota</td>
                            <td>
                                <div className="d-flex gap-1 align-items-center">
                                    <Form.Control
                                        type="text"
                                        readOnly
                                        size="sm"
                                        placeholder={label(binds.main)}
                                        value={binds.mainGates ? label(binds.mainGates) : ''}
                                        onKeyDown={ev => handleCaptureOptional('mainGates', ev)}
                                    />
                                    {binds.mainGates && (
                                        <Button variant="outline-secondary" size="sm" onClick={() => handleClearOptional('mainGates')} title="Przywróć domyślny">✕</Button>
                                    )}
                                </div>
                            </td>
                        </tr>
                        <tr>
                            <td className="w-32 ps-4 text-muted">└ Transport</td>
                            <td>
                                <div className="d-flex gap-1 align-items-center">
                                    <Form.Control
                                        type="text"
                                        readOnly
                                        size="sm"
                                        placeholder={label(binds.main)}
                                        value={binds.mainTransport ? label(binds.mainTransport) : ''}
                                        onKeyDown={ev => handleCaptureOptional('mainTransport', ev)}
                                    />
                                    {binds.mainTransport && (
                                        <Button variant="outline-secondary" size="sm" onClick={() => handleClearOptional('mainTransport')} title="Przywróć domyślny">✕</Button>
                                    )}
                                </div>
                            </td>
                        </tr>
                        <tr>
                            <td className="w-32 ps-4 text-muted">└ Zbieranie z cial</td>
                            <td>
                                <div className="d-flex gap-1 align-items-center">
                                    <Form.Control
                                        type="text"
                                        readOnly
                                        size="sm"
                                        placeholder={label(binds.main)}
                                        value={binds.mainLoot ? label(binds.mainLoot) : ''}
                                        onKeyDown={ev => handleCaptureOptional('mainLoot', ev)}
                                    />
                                    {binds.mainLoot && (
                                        <Button variant="outline-secondary" size="sm" onClick={() => handleClearOptional('mainLoot')} title="Przywróć domyślny">✕</Button>
                                    )}
                                </div>
                            </td>
                        </tr>
                        <tr>
                            <td className="w-32">Napełnij lampę</td>
                            <td>
                                <Form.Control
                                    type="text"
                                    readOnly
                                    size="sm"
                                    value={label(binds.lamp)}
                                    onKeyDown={ev => handleCapture('lamp', ev)}
                                />
                            </td>
                        </tr>
                        <tr>
                            <td className="w-32">Atakuj</td>
                            <td>
                                <Form.Control
                                    type="text"
                                    readOnly
                                    size="sm"
                                    value={label(binds.attack)}
                                    onKeyDown={ev => handleCapture('attack', ev)}
                                />
                            </td>
                        </tr>
                        <tr>
                            <td className="w-32">Wesprzyj</td>
                            <td>
                                <Form.Control
                                    type="text"
                                    readOnly
                                    size="sm"
                                    value={label(binds.support)}
                                    onKeyDown={ev => handleCapture('support', ev)}
                                />
                            </td>
                        </tr>
                        <tr>
                            <td className="w-32">Tryb ruchu</td>
                            <td>
                                <Form.Control
                                    type="text"
                                    readOnly
                                    size="sm"
                                    value={label(binds.moveMode)}
                                    onKeyDown={ev => handleCapture('moveMode', ev)}
                                />
                            </td>
                        </tr>
                        <tr>
                            <td className="w-32">Bind w lokacji</td>
                            <td>
                                <Form.Control
                                    type="text"
                                    readOnly
                                    size="sm"
                                    value={label(binds.roomBind)}
                                    onKeyDown={ev => handleCapture('roomBind', ev)}
                                />
                            </td>
                        </tr>
                        <tr>
                            <td className="w-32">Napij się wody</td>
                            <td>
                                <Form.Control
                                    type="text"
                                    readOnly
                                    size="sm"
                                    value={label(binds.drinkable)}
                                    onKeyDown={ev => handleCapture('drinkable', ev)}
                                />
                            </td>
                        </tr>
                        <tr>
                            <td className="w-32">Wrota</td>
                            <td>
                                <Form.Control
                                    type="text"
                                    readOnly
                                    size="sm"
                                    value={label(binds.gateBind)}
                                    onKeyDown={ev => handleCapture('gateBind', ev)}
                                />
                            </td>
                        </tr>
                        <tr>
                            <td className="w-32">Dwukrotne +k</td>
                            <td>
                                <Form.Control
                                    type="text"
                                    readOnly
                                    size="sm"
                                    value={label(binds.doubleK)}
                                    onKeyDown={ev => handleCapture('doubleK', ev)}
                                />
                            </td>
                        </tr>
                        <tr>
                            <td className="w-32">Tymczasowe 1</td>
                            <td>
                                <Form.Control
                                    type="text"
                                    readOnly
                                    size="sm"
                                    value={label(binds.temp[0])}
                                    onKeyDown={ev => handleCaptureTemp(0, ev)}
                                />
                            </td>
                        </tr>
                        <tr>
                            <td className="w-32">Tymczasowe 2</td>
                            <td>
                                <Form.Control
                                    type="text"
                                    readOnly
                                    size="sm"
                                    value={label(binds.temp[1])}
                                    onKeyDown={ev => handleCaptureTemp(1, ev)}
                                />
                            </td>
                        </tr>
                        <tr>
                            <td className="w-32">Atakuj wroga 1</td>
                            <td>
                                <Form.Control
                                    type="text"
                                    readOnly
                                    size="sm"
                                    value={label(binds.enemy[0])}
                                    onKeyDown={ev => handleCaptureEnemy(0, ev)}
                                />
                            </td>
                        </tr>
                        <tr>
                            <td className="w-32">Atakuj wroga 2</td>
                            <td>
                                <Form.Control
                                    type="text"
                                    readOnly
                                    size="sm"
                                    value={label(binds.enemy[1])}
                                    onKeyDown={ev => handleCaptureEnemy(1, ev)}
                                />
                            </td>
                        </tr>
                        <tr>
                            <td className="w-32">Atakuj wroga 3</td>
                            <td>
                                <Form.Control
                                    type="text"
                                    readOnly
                                    size="sm"
                                    value={label(binds.enemy[2])}
                                    onKeyDown={ev => handleCaptureEnemy(2, ev)}
                                />
                            </td>
                        </tr>
                        <tr>
                            <td className="w-32">Blokuj wroga 1</td>
                            <td>
                                <Form.Control
                                    type="text"
                                    readOnly
                                    size="sm"
                                    value={label(binds.enemyBlock[0])}
                                    onKeyDown={ev => handleCaptureEnemyBlock(0, ev)}
                                />
                            </td>
                        </tr>
                        <tr>
                            <td className="w-32">Blokuj wroga 2</td>
                            <td>
                                <Form.Control
                                    type="text"
                                    readOnly
                                    size="sm"
                                    value={label(binds.enemyBlock[1])}
                                    onKeyDown={ev => handleCaptureEnemyBlock(1, ev)}
                                />
                            </td>
                        </tr>
                        <tr>
                            <td className="w-32">Blokuj wroga 3</td>
                            <td>
                                <Form.Control
                                    type="text"
                                    readOnly
                                    size="sm"
                                    value={label(binds.enemyBlock[2])}
                                    onKeyDown={ev => handleCaptureEnemyBlock(2, ev)}
                                />
                            </td>
                        </tr>
                        <tr>
                            <td className="w-32">N</td>
                            <td>
                                <Form.Control
                                    type="text"
                                    readOnly
                                    size="sm"
                                    value={label(binds.directions.n)}
                                    onKeyDown={ev => handleCaptureDir('n', ev)}
                                />
                            </td>
                        </tr>
                        <tr>
                            <td className="w-32">S</td>
                            <td>
                                <Form.Control
                                    type="text"
                                    readOnly
                                    size="sm"
                                    value={label(binds.directions.s)}
                                    onKeyDown={ev => handleCaptureDir('s', ev)}
                                />
                            </td>
                        </tr>
                        <tr>
                            <td className="w-32">W</td>
                            <td>
                                <Form.Control
                                    type="text"
                                    readOnly
                                    size="sm"
                                    value={label(binds.directions.w)}
                                    onKeyDown={ev => handleCaptureDir('w', ev)}
                                />
                            </td>
                        </tr>
                        <tr>
                            <td className="w-32">E</td>
                            <td>
                                <Form.Control
                                    type="text"
                                    readOnly
                                    size="sm"
                                    value={label(binds.directions.e)}
                                    onKeyDown={ev => handleCaptureDir('e', ev)}
                                />
                            </td>
                        </tr>
                        <tr>
                            <td className="w-32">NW</td>
                            <td>
                                <Form.Control
                                    type="text"
                                    readOnly
                                    size="sm"
                                    value={label(binds.directions.nw)}
                                    onKeyDown={ev => handleCaptureDir('nw', ev)}
                                />
                            </td>
                        </tr>
                        <tr>
                            <td className="w-32">NE</td>
                            <td>
                                <Form.Control
                                    type="text"
                                    readOnly
                                    size="sm"
                                    value={label(binds.directions.ne)}
                                    onKeyDown={ev => handleCaptureDir('ne', ev)}
                                />
                            </td>
                        </tr>
                        <tr>
                            <td className="w-32">SW</td>
                            <td>
                                <Form.Control
                                    type="text"
                                    readOnly
                                    size="sm"
                                    value={label(binds.directions.sw)}
                                    onKeyDown={ev => handleCaptureDir('sw', ev)}
                                />
                            </td>
                        </tr>
                        <tr>
                            <td className="w-32">SE</td>
                            <td>
                                <Form.Control
                                    type="text"
                                    readOnly
                                    size="sm"
                                    value={label(binds.directions.se)}
                                    onKeyDown={ev => handleCaptureDir('se', ev)}
                                />
                            </td>
                        </tr>
                        <tr>
                            <td className="w-32">U</td>
                            <td>
                                <Form.Control
                                    type="text"
                                    readOnly
                                    size="sm"
                                    value={label(binds.directions.u)}
                                    onKeyDown={ev => handleCaptureDir('u', ev)}
                                />
                            </td>
                        </tr>
                        <tr>
                            <td className="w-32">D</td>
                            <td>
                                <Form.Control
                                    type="text"
                                    readOnly
                                    size="sm"
                                    value={label(binds.directions.d)}
                                    onKeyDown={ev => handleCaptureDir('d', ev)}
                                />
                            </td>
                        </tr>
                        <tr>
                            <td className="w-32">Zerknij</td>
                            <td>
                                <Form.Control
                                    type="text"
                                    readOnly
                                    size="sm"
                                    value={label(binds.directions.zerknij)}
                                    onKeyDown={ev => handleCaptureDir('zerknij', ev)}
                                />
                            </td>
                        </tr>
                        <tr>
                            <td className="w-32">Specjalne</td>
                            <td>
                                <Form.Control
                                    type="text"
                                    readOnly
                                    size="sm"
                                    value={label(binds.directions.special)}
                                    onKeyDown={ev => handleCaptureDir('special', ev)}
                                />
                            </td>
                        </tr>
                        {binds.custom.map((b, idx) => (
                            <tr key={idx} ref={idx === binds.custom.length - 1 ? lastCustomRowRef : undefined}>
                                <td>
                                    <Form.Control
                                        type="text"
                                        size="sm"
                                        value={b.command}
                                        onChange={ev => handleCommandChange(idx, ev.target.value)}
                                        autoCorrect="off"
                                        autoComplete="off"
                                        autoCapitalize="off"
                                        spellCheck={false}
                                    />
                                </td>
                                <td>
                                    <div className="d-flex gap-2">
                                        <Form.Control
                                            type="text"
                                            readOnly
                                            size="sm"
                                            value={label(b)}
                                            onKeyDown={ev => handleCaptureCustom(idx, ev)}
                                        />
                                        <Button variant="danger" size="sm" onClick={() => removeCustomBind(idx)}>Usuń</Button>
                                    </div>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </Table>
            </fieldset>
        </div>
    );
}

export default Binds;
