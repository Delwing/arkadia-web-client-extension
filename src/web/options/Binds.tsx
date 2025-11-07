import { useEffect, useMemo, useRef, useState } from "react";
import {Alert, Button, Form, Modal, ProgressBar, Spinner, Table} from 'react-bootstrap';
import storage from "@modules/core/storage";
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

interface Bind {
    key: string;
    ctrl?: boolean;
    alt?: boolean;
    shift?: boolean;
}

interface CustomBind extends Bind {
    command: string;
}

interface DirectionBinds {
    n: Bind;
    s: Bind;
    w: Bind;
    e: Bind;
    nw: Bind;
    ne: Bind;
    sw: Bind;
    se: Bind;
    u: Bind;
    d: Bind;
    special: Bind;
}

interface BindSettings {
    main: Bind;
    lamp: Bind;
    attack: Bind;
    support: Bind;
    moveMode: Bind;
    directions: DirectionBinds;
    custom: CustomBind[];
    temp: Bind[];
}

const defaultBinds: BindSettings = {
    main: { key: 'BracketRight' },
    lamp: { key: 'Digit4', ctrl: true },
    attack: { key: 'Digit1', ctrl: true },
    support: { key: 'KeyQ', ctrl: true },
    moveMode: { key: 'Backquote' },
    temp: [
        { key: 'F4' },
        { key: 'F5' },
    ],
    directions: {
        n: { key: 'Numpad8' },
        s: { key: 'Numpad2' },
        w: { key: 'Numpad4' },
        e: { key: 'Numpad6' },
        nw: { key: 'Numpad7' },
        ne: { key: 'Numpad9' },
        sw: { key: 'Numpad1' },
        se: { key: 'Numpad3' },
        u: { key: 'NumpadMultiply' },
        d: { key: 'NumpadSubtract' },
        special: { key: 'Numpad0' },
    },
    custom: [],
};

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
    const parts: string[] = [];
    if (bind.ctrl) parts.push('CTRL');
    if (bind.alt) parts.push('ALT');
    if (bind.shift) parts.push('SHIFT');
    parts.push(key);
    return parts.join('+');
}

function Binds() {
    const [binds, setBinds] = useState<BindSettings>(defaultBinds);
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

    useEffect(() => {
        storage.getItem('binds').then(res => {
            setBinds({
                ...defaultBinds,
                main: res?.binds?.main || defaultBinds.main,
                lamp: res?.binds?.lamp || defaultBinds.lamp,
                attack: res?.binds?.attack || defaultBinds.attack,
                support: res?.binds?.support || defaultBinds.support,
                moveMode: res?.binds?.moveMode || defaultBinds.moveMode,
                temp: [
                    { ...defaultBinds.temp[0], ...(res?.binds?.temp?.[0] || {}) },
                    { ...defaultBinds.temp[1], ...(res?.binds?.temp?.[1] || {}) },
                ],
                directions: {
                    ...defaultBinds.directions,
                    ...res?.binds?.directions,
                },
                custom: res?.binds?.custom || [],
            });
        });
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

    function handleCommandChange(idx: number, command: string) {
        setBinds(prev => ({
            ...prev,
            custom: prev.custom.map((b, i) => i === idx ? { ...b, command } : b),
        }));
    }

    function addCustomBind() {
        setBinds(prev => ({ ...prev, custom: [...prev.custom, { key: '', command: '' }] }));
    }

    function removeCustomBind(idx: number) {
        setBinds(prev => ({
            ...prev,
            custom: prev.custom.filter((_, i) => i !== idx),
        }));
    }

    function save() {
        storage.setItem('binds', binds).then(() => {
            window.dispatchEvent(new Event('close-options'));
        });
    }

    return (
        <div className="m-2 d-flex flex-column gap-2">
            <input
                ref={fileInputRef}
                type="file"
                accept=".db,application/x-sqlite3"
                style={{ display: 'none' }}
                onChange={handleFileSelected}
            />
            <Modal show={showImportModal} onHide={closeImportModal} backdrop={isRunningImport ? 'static' : true} keyboard={!isRunningImport}>
                <Modal.Header closeButton={!isRunningImport}>
                    <Modal.Title>Importuj bazę multibindów</Modal.Title>
                </Modal.Header>
                <Modal.Body>
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
                </Modal.Body>
                <Modal.Footer>
                    {isRunningImport ? (
                        <Button variant="secondary" onClick={handleCancelImport}>Anuluj</Button>
                    ) : (
                        <>
                            <Button variant="secondary" onClick={closeImportModal}>Zamknij</Button>
                            <Button onClick={runImport} disabled={!importPlan || importPlan.rows.length === 0 || !!importResult}>Importuj</Button>
                        </>
                    )}
                </Modal.Footer>
            </Modal>
            <div className="d-flex align-items-center gap-2">
                <Button size="sm" variant="secondary" onClick={handleImportClick} disabled={isParsingDb}>Importuj bazę multibindów…</Button>
                {isParsingDb && <Spinner animation="border" size="sm" role="status" />}
            </div>
            {importError && !showImportModal && (
                <Alert variant="danger" className="mb-0">{importError}</Alert>
            )}
            <fieldset className="p-0 border-0 m-0">
                <Table bordered size="sm" hover className="table-modern table-zebra mb-2">
                    <tbody className="align-middle">
                        <tr>
                            <td className="w-32">Domyślny</td>
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
                            <tr key={idx}>
                                <td>
                                    <Form.Control
                                        type="text"
                                        size="sm"
                                        value={b.command}
                                        onChange={ev => handleCommandChange(idx, ev.target.value)}
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
                        <tr>
                            <td colSpan={2}>
                                <Button size="sm" onClick={addCustomBind}>Dodaj skrót</Button>
                            </td>
                        </tr>
                    </tbody>
                </Table>
                <Button className="mt-2 w-auto" onClick={save}>Zapisz</Button>
            </fieldset>
        </div>
    );
}

export default Binds;
