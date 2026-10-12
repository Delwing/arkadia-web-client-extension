import { useEffect, useMemo, useRef, useState } from "react";
import type { MultibindImportRow, ParsedMultibindDatabase } from "@web/options/multibindImport.shared.ts";
import {
    replaceAll as replaceMultibinds,
    subscribe as subscribeMultibinds,
    toKey,
    type StoredMultibindRecord,
} from "@web/dataStores/multibindStore.ts";
import { Button, Check, Field, Notice, Select } from "@web-ui/primitives/index.ts";
import { parseInWorker } from "./parseInWorker";
import { ImportActions, ImportRow, type ImportResult } from "./ImportRow";

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
 * Import of the Mudlet multibind database (.db), as a row of the "Import z
 * innych klientów" page: parse, an inline summary with the conflict policy,
 * then a cancellable, progress-reporting import.
 */
export default function MultibindImport() {
    const [multibinds, setMultibinds] = useState<StoredMultibindRecord[]>([]);
    const [importData, setImportData] = useState<ImportData | null>(null);
    const [conflictPolicy, setConflictPolicy] = useState<ConflictPolicy>('keep-last');
    const [overwriteExisting, setOverwriteExisting] = useState(true);
    const [result, setResult] = useState<ImportResult>(null);
    const [isParsingDb, setIsParsingDb] = useState(false);
    const [isRunningImport, setIsRunningImport] = useState(false);
    const [importProgress, setImportProgress] = useState<{ processed: number; total: number; eta: number | null } | null>(null);
    const [importCancelled, setImportCancelled] = useState(false);
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

    async function handleFile(file: File) {
        setIsParsingDb(true);
        setResult(null);
        setImportData(null);
        setImportCancelled(false);
        try {
            const parsed = await parseInWorker<ParsedMultibindDatabase>(
                () => new Worker(new URL('../options/multibindImport.worker.ts', import.meta.url), { type: 'module' }),
                await file.arrayBuffer(),
            );
            setImportData({ fileName: file.name, rows: parsed.rows, totalRows: parsed.totalRows, invalidRows: parsed.invalidRows });
            setConflictPolicy('keep-last');
            setOverwriteExisting(true);
        } catch (err) {
            setResult({ kind: 'error', message: err instanceof Error ? err.message : 'Nie udało się odczytać bazy danych.' });
        } finally {
            setIsParsingDb(false);
        }
    }

    async function runImport() {
        if (!importPlan || importPlan.rows.length === 0) return;
        setIsRunningImport(true);
        setImportCancelled(false);
        setResult(null);
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
            const updated = overwriteExisting ? updateCount : 0;
            setResult({
                kind: 'done',
                message: `Import zakończony.\nNowe wpisy: ${newCount}\nZaktualizowane: ${updated}\nPominięte: ${skippedCount}`,
            });
            setImportData(null);
        } catch (err) {
            setResult({ kind: 'error', message: err instanceof Error ? err.message : 'Nie udało się zapisać multibindów.' });
        } finally {
            setIsRunningImport(false);
            setImportProgress(null);
        }
    }

    function cancelPreview() {
        setImportData(null);
        setImportCancelled(false);
    }

    return (
        <ImportRow
            id="import-multibinds"
            title="Multibindy"
            file={<>Plik <code>Database_multibinds.db</code> z profilu Mudleta. Przed importem pokaże podsumowanie i pozwoli wybrać, co zrobić z konfliktami.</>}
            accept=".db,application/x-sqlite3"
            busy={isParsingDb || isRunningImport}
            onFile={file => void handleFile(file)}
            result={result}
            onDismiss={() => setResult(null)}
        >
            {importData && importSummary && (
                <>
                    <div className="binds-import__summary">
                        {([
                            ['Plik', importData.fileName || '—'],
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
                    <div className="settings-fields-row">
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
                    </div>
                    <Check
                        label="Nadpisz wpisy"
                        checked={overwriteExisting}
                        disabled={isRunningImport}
                        onChange={ev => setOverwriteExisting(ev.target.checked)}
                    />
                    {importProgress && (
                        <div className="popup-field">
                            <progress className="popup-progress" max={importProgress.total || 1} value={importProgress.processed} />
                            <div className="binds-import__progress-text">
                                <span>Przetworzono wierszy: {importProgress.processed}/{importProgress.total}</span>
                                <span>{importProgress.eta !== null ? `~${importProgress.eta.toFixed(1)} s do końca` : 'Szacowanie…'}</span>
                            </div>
                        </div>
                    )}
                    {importCancelled && <Notice variant="warning">Import przerwany.</Notice>}
                    {isRunningImport ? (
                        <div className="popup-inline">
                            <Button size="sm" variant="solid" disabled><span className="popup-spinner" /> Importowanie…</Button>
                            <Button size="sm" variant="ghost" onClick={() => { cancelImportRef.current = true; }}>Przerwij</Button>
                        </div>
                    ) : (
                        <ImportActions onImport={() => void runImport()} onCancel={cancelPreview} disabled={importSummary.toImport === 0} />
                    )}
                </>
            )}
        </ImportRow>
    );
}
