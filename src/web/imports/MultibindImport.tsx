import { useEffect, useMemo, useRef, useState } from "react";
import type { MultibindImportRow, ParsedMultibindDatabase } from "@web/options/multibindImport.shared.ts";
import {
    replaceAll as replaceMultibinds,
    subscribe as subscribeMultibinds,
    toKey,
    type StoredMultibindRecord,
} from "@web/dataStores/multibindStore.ts";
import SubDialog from "@web/SubDialog.tsx";
import { Button, Check, Field, Select } from "@web-ui/primitives/index.ts";
import { parseInWorker } from "./parseInWorker";
import { ImportRow } from "./ImportRow";

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

/**
 * Import of the Mudlet multibind database (.db): parse, a summary dialog with
 * the conflict policy, then a cancellable, progress-reporting import.
 *
 * `row` renders it as a row of the "Import z innych klientów" page. Without it
 * the component is headless and opens its file picker on `openEvent` — how the
 * Klawisze window's ⋯ "Importuj bazę multibindów" works in forge.
 */
export default function MultibindImport({ row, openEvent }: { row?: boolean; openEvent?: string }) {
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

    useEffect(() => subscribeMultibinds(setMultibinds), []);

    const importPlan = useMemo<ImportPlan | null>(() => {
        if (!importData) return null;
        const conflictResult = applyConflictPolicy(importData.rows, conflictPolicy);
        const existingMap = new Map(multibinds.map(item => [toKey(item.roomId, item.index), item]));
        let newEntries = 0;
        let potentialUpdates = 0;
        conflictResult.rows.forEach(r => {
            if (existingMap.has(toKey(r.roomId, r.index))) potentialUpdates += 1;
            else newEntries += 1;
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
        if (!importPlan) return null;
        const updates = overwriteExisting ? importPlan.potentialUpdates : 0;
        const skippedFromUpdates = overwriteExisting ? 0 : importPlan.potentialUpdates;
        return {
            totalRows: importPlan.totalRows,
            toImport: importPlan.rows.length,
            newEntries: importPlan.newEntries,
            updates,
            skipped: importPlan.invalidRows + importPlan.duplicatesDropped + skippedFromUpdates,
            invalidRows: importPlan.invalidRows,
            duplicates: importPlan.duplicatesDropped,
        };
    }, [importPlan, overwriteExisting]);

    function openPicker() {
        setImportError(null);
        setImportCancelled(false);
        setImportResult(null);
        fileInputRef.current?.click();
    }

    async function handleFile(file: File) {
        setIsParsingDb(true);
        setImportError(null);
        setImportCancelled(false);
        setImportResult(null);
        try {
            const parsed = await parseInWorker<ParsedMultibindDatabase>(
                () => new Worker(new URL('../options/multibindImport.worker.ts', import.meta.url), { type: 'module' }),
                await file.arrayBuffer(),
            );
            setImportData({ fileName: file.name, rows: parsed.rows, totalRows: parsed.totalRows, invalidRows: parsed.invalidRows });
            setConflictPolicy('keep-last');
            setOverwriteExisting(true);
            setShowImportModal(true);
        } catch (err) {
            setImportData(null);
            setShowImportModal(false);
            setImportError(err instanceof Error ? err.message : 'Nie udało się odczytać bazy danych.');
        } finally {
            setIsParsingDb(false);
        }
    }

    async function runImport() {
        if (!importPlan || importPlan.rows.length === 0) return;
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
        for (const r of importPlan.rows) {
            if (cancelImportRef.current) break;
            const key = toKey(r.roomId, r.index);
            if (existingMap.has(key)) {
                if (!overwriteExisting) {
                    skippedCount += 1;
                } else {
                    updateCount += 1;
                    finalMap.set(key, { roomId: r.roomId, index: r.index, action: r.action });
                }
            } else {
                newCount += 1;
                finalMap.set(key, { roomId: r.roomId, index: r.index, action: r.action });
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
            setImportResult({ newCount, updatedCount: overwriteExisting ? updateCount : 0, skippedCount });
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
        if (isRunningImport) return;
        setShowImportModal(false);
        setImportData(null);
        setImportError(null);
        setImportCancelled(false);
        setImportResult(null);
    }

    // Headless mode: a host button elsewhere asks for the picker by event, and
    // hears back while the file is being parsed (to disable itself).
    const openPickerRef = useRef(openPicker);
    openPickerRef.current = openPicker;
    useEffect(() => {
        if (!openEvent) return;
        const onOpen = () => openPickerRef.current();
        window.addEventListener(openEvent, onOpen);
        return () => window.removeEventListener(openEvent, onOpen);
    }, [openEvent]);
    useEffect(() => {
        window.dispatchEvent(new CustomEvent('binds-parsing', { detail: isParsingDb }));
    }, [isParsingDb]);

    const dialog = showImportModal && (
        <SubDialog
            title="Importuj bazę multibindów"
            onClose={closeImportModal}
            // No way out while the worker is chewing through the file.
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
                        <progress className="popup-progress" max={importProgress.total || 1} value={importProgress.processed} />
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
    );

    if (row) {
        return (
            <>
                <ImportRow
                    id="import-multibinds"
                    title="Multibindy"
                    file={<>Baza multibindów z Mudleta (<code>.db</code>). Przed importem pokaże podsumowanie i pozwoli wybrać, co zrobić z konfliktami.</>}
                    accept=".db,application/x-sqlite3"
                    busy={isParsingDb}
                    onFile={file => void handleFile(file)}
                    result={importError && !showImportModal ? { kind: 'error', message: importError } : null}
                    onDismiss={() => setImportError(null)}
                />
                {dialog}
            </>
        );
    }
    return (
        <>
            <input
                ref={fileInputRef}
                type="file"
                accept=".db,application/x-sqlite3"
                hidden
                onChange={ev => {
                    const file = ev.target.files?.[0];
                    ev.target.value = '';
                    if (file) void handleFile(file);
                }}
            />
            {importError && !showImportModal && <div className="popup-notice popup-notice--danger">{importError}</div>}
            {dialog}
        </>
    );
}
