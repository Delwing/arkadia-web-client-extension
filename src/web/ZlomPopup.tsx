import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { DockablePopupWrapper } from './layout/components/DockablePopupWrapper';
import { usePopup } from './hooks/usePopup';
import { usePopupSetting } from './hooks/usePopupSetting';
import { characterStorage } from '@modules/core/storage';
import {
    mergeZlomData,
    setZlomColor,
    setZlomNote,
    ZlomSnapshot,
    WeaponEntry,
    ShieldEntry,
    ArmorEntry,
    ZlomMergeMode,
    ZlomKind,
} from '../client/scripts/zlom';
import {
    ensureZlomLoaded,
    getZlomSnapshot,
    subscribeZlom,
} from '@modules/data/zlomStore';
import { defaultSettings } from '@modules/core/defaultSettings';
import type {
    ZlomDbResult,
    ZlomDbWorkerRequest,
    ZlomDbWorkerResponse,
} from '@modules/data/zlomDbImport.shared';

const POPUP_ID = 'popup:zlom';
const PAGE_SIZE = 100;

type TabType = 'bronie' | 'tarcze' | 'zbroje';

function emptySnapshot(): ZlomSnapshot {
    return { bronie: [], tarcze: [], zbroje: [] };
}

function protectionText(k: number, o: number, c: number): string {
    return `${k}/${o}/${c}`;
}

const ZlomPopup: React.FC = () => {
    const { wrapperProps, isOpen } = usePopup(POPUP_ID, {
        openEvent: 'zlom.popup.open',
    });
    const [snap, setSnap] = useState<ZlomSnapshot>(emptySnapshot);
    const [activeTab, setActiveTab] = usePopupSetting<TabType>(POPUP_ID, 'activeTab', 'bronie');
    const [filter, setFilter] = useState('');
    const [page, setPage] = useState(0);

    useEffect(() => {
        setPage(0);
    }, [activeTab, filter]);

    const fileInputRef = useRef<HTMLInputElement>(null);
    const jsonInputRef = useRef<HTMLInputElement>(null);
    const workerRef = useRef<Worker | null>(null);
    const [importState, setImportState] = useState<
        | { phase: 'idle' }
        | { phase: 'loading' }
        | { phase: 'preview'; parsed: ZlomDbResult; mergeMode: ZlomMergeMode }
        | { phase: 'done'; message: string }
        | { phase: 'error'; message: string }
    >({ phase: 'idle' });

    useEffect(() => {
        return () => {
            if (workerRef.current) {
                workerRef.current.terminate();
                workerRef.current = null;
            }
        };
    }, []);

    useEffect(() => {
        let active = true;
        ensureZlomLoaded().then(() => {
            if (active) setSnap(getZlomSnapshot());
        });
        const unsub = subscribeZlom((s) => {
            if (active) setSnap(s);
        });
        return () => {
            active = false;
            unsub();
        };
    }, []);

    useEffect(() => {
        if (isOpen) setSnap(getZlomSnapshot());
    }, [isOpen]);

    const parseInWorker = useCallback(async (buffer: ArrayBuffer): Promise<ZlomDbResult> => {
        if (!workerRef.current) {
            workerRef.current = new Worker(
                new URL('@modules/data/zlomDbImport.worker.ts', import.meta.url),
                { type: 'module' },
            );
        }
        const worker = workerRef.current;
        return new Promise((resolve, reject) => {
            const cleanup = () => {
                worker.removeEventListener('message', handleMessage);
                worker.removeEventListener('error', handleError);
            };
            const handleMessage = (event: MessageEvent) => {
                const data = event.data as ZlomDbWorkerResponse | undefined;
                if (!data) return;
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
            const request: ZlomDbWorkerRequest = { type: 'parse', buffer };
            worker.postMessage(request, [buffer]);
        });
    }, []);

    const handleImportClick = useCallback(() => {
        fileInputRef.current?.click();
    }, []);

    const handleFileChange = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (e.target) e.target.value = '';
        if (!file) return;

        setImportState({ phase: 'loading' });
        try {
            const buffer = await file.arrayBuffer();
            const parsed = await parseInWorker(buffer);
            if (parsed.bronie.length + parsed.tarcze.length + parsed.zbroje.length === 0) {
                setImportState({ phase: 'error', message: 'Baza nie zawiera danych zlomu.' });
                return;
            }
            setImportState({ phase: 'preview', parsed, mergeMode: 'replace' });
        } catch (err) {
            setImportState({ phase: 'error', message: err instanceof Error ? err.message : 'Nieznany blad.' });
        }
    }, [parseInWorker]);

    const handleImportConfirm = useCallback(async () => {
        if (importState.phase !== 'preview') return;
        try {
            const counts = await mergeZlomData(importState.parsed, importState.mergeMode);
            const msg = `Zaimportowano: ${counts.bronie} broni, ${counts.tarcze} tarcz, ${counts.zbroje} zbroi.`;
            setImportState({ phase: 'done', message: msg });
        } catch (err) {
            setImportState({ phase: 'error', message: err instanceof Error ? err.message : 'Blad importu.' });
        }
    }, [importState]);

    const handleImportCancel = useCallback(() => {
        setImportState({ phase: 'idle' });
    }, []);

    const handleExport = useCallback(() => {
        const payload = {
            bronie: snap.bronie,
            tarcze: snap.tarcze,
            zbroje: snap.zbroje,
        };
        const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        const date = new Date().toISOString().slice(0, 10);
        a.href = url;
        a.download = `zlom-${date}.json`;
        a.click();
        URL.revokeObjectURL(url);
    }, [snap]);

    const handleJsonImportClick = useCallback(() => {
        jsonInputRef.current?.click();
    }, []);

    const handleJsonFileChange = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (e.target) e.target.value = '';
        if (!file) return;
        setImportState({ phase: 'loading' });
        try {
            const text = await file.text();
            const parsed = JSON.parse(text);
            const payload: ZlomDbResult = {
                bronie: Array.isArray(parsed?.bronie) ? parsed.bronie : [],
                tarcze: Array.isArray(parsed?.tarcze) ? parsed.tarcze : [],
                zbroje: Array.isArray(parsed?.zbroje) ? parsed.zbroje : [],
            };
            if (payload.bronie.length + payload.tarcze.length + payload.zbroje.length === 0) {
                setImportState({ phase: 'error', message: 'Plik nie zawiera danych zlomu.' });
                return;
            }
            setImportState({ phase: 'preview', parsed: payload, mergeMode: 'replace' });
        } catch (err) {
            setImportState({ phase: 'error', message: err instanceof Error ? err.message : 'Blad parsowania JSON.' });
        }
    }, []);

    const readSilver = () => {
        const s = characterStorage.get('settings')?.zlomSilver ?? defaultSettings.zlomSilver;
        return { color: s?.color ?? '#dadada', off: s?.off === true };
    };

    const [silver, setSilver] = useState<{ color: string; off: boolean }>(readSilver);

    useEffect(() => {
        const unsub = characterStorage.onChange('settings', (v) => {
            const s = v?.zlomSilver ?? defaultSettings.zlomSilver;
            setSilver({ color: s?.color ?? '#dadada', off: s?.off === true });
        });
        return unsub;
    }, []);

    const updateSilver = useCallback((patch: { color?: string; off?: boolean }) => {
        const current = characterStorage.get('settings') ?? defaultSettings;
        const prevSilver = current.zlomSilver ?? defaultSettings.zlomSilver ?? { color: '#dadada' };
        const nextSilver = { ...prevSilver, ...patch };
        characterStorage.set('settings', { ...current, zlomSilver: nextSilver });
    }, []);

    const handleColorChange = useCallback((kind: ZlomKind, opis: string, value: string) => {
        void setZlomColor(kind, opis, value || undefined);
    }, []);

    const handleColorClear = useCallback((kind: ZlomKind, opis: string) => {
        void setZlomColor(kind, opis, undefined);
    }, []);

    const [noteEditor, setNoteEditor] = useState<
        | { kind: ZlomKind; opis: string; value: string }
        | null
    >(null);
    const noteEditorRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (!noteEditor) return;
        const onDown = (ev: MouseEvent) => {
            const el = noteEditorRef.current;
            const target = ev.target as Node | null;
            if (el && target && !el.contains(target)) {
                setNoteEditor(null);
            }
        };
        document.addEventListener('mousedown', onDown);
        return () => document.removeEventListener('mousedown', onDown);
    }, [noteEditor]);

    const openNoteEditor = useCallback((kind: ZlomKind, entry: WeaponEntry | ShieldEntry | ArmorEntry) => {
        setNoteEditor({ kind, opis: entry.opis, value: entry.note ?? '' });
    }, []);

    const saveNoteEditor = useCallback(() => {
        if (!noteEditor) return;
        void setZlomNote(noteEditor.kind, noteEditor.opis, noteEditor.value || undefined);
        setNoteEditor(null);
    }, [noteEditor]);

    const renderNoteCell = (kind: ZlomKind, entry: WeaponEntry | ShieldEntry | ArmorEntry) => {
        const hasNote = !!entry.note;
        const isOpen = noteEditor?.kind === kind && noteEditor.opis === entry.opis;
        return (
            <td className="zlom-cell zlom-cell--note">
                <div className="zlom-note-wrap">
                    <button
                        type="button"
                        className={`zlom-note-btn${hasNote ? ' zlom-note-btn--has' : ''}`}
                        onClick={() => openNoteEditor(kind, entry)}
                        title={hasNote ? entry.note : 'Dodaj notatke'}
                    >
                        {hasNote ? '●' : '+'}
                    </button>
                    {isOpen && (
                        <div className="zlom-note-popover" ref={noteEditorRef}>
                            <textarea
                                className="popup-input zlom-note-textarea"
                                autoFocus
                                value={noteEditor!.value}
                                onChange={(e) => setNoteEditor({ ...noteEditor!, value: e.target.value })}
                                onKeyDown={(e) => {
                                    if (e.key === 'Escape') {
                                        e.preventDefault();
                                        setNoteEditor(null);
                                    } else if ((e.key === 'Enter' && (e.ctrlKey || e.metaKey))) {
                                        e.preventDefault();
                                        saveNoteEditor();
                                    }
                                }}
                                placeholder="Notatka..."
                            />
                            <div className="zlom-note-popover__actions">
                                <button type="button" className="popup-btn" onClick={() => setNoteEditor(null)}>Anuluj</button>
                                <button type="button" className="popup-btn" onClick={saveNoteEditor}>Zapisz</button>
                            </div>
                        </div>
                    )}
                </div>
            </td>
        );
    };

    const renderColorCell = (kind: ZlomKind, entry: WeaponEntry | ShieldEntry | ArmorEntry) => (
        <td className="zlom-cell zlom-cell--color">
            <input
                type="color"
                className="zlom-color-input"
                value={entry.color ?? '#ffffff'}
                onChange={(e) => handleColorChange(kind, entry.opis, e.target.value)}
                title={entry.color ? `Kolor: ${entry.color}` : 'Ustaw kolor'}
            />
            <button
                type="button"
                className="zlom-color-clear"
                onClick={() => handleColorClear(kind, entry.opis)}
                title="Usun kolor"
                style={entry.color ? undefined : { visibility: 'hidden' }}
            >
                x
            </button>
        </td>
    );

    const entries = useMemo(() => {
        const raw: (WeaponEntry | ShieldEntry | ArmorEntry)[] =
            activeTab === 'bronie' ? snap.bronie
                : activeTab === 'tarcze' ? snap.tarcze
                    : snap.zbroje;
        const needle = filter.trim().toLowerCase();
        const filtered = needle ? raw.filter(e => e.short.toLowerCase().includes(needle)) : raw;
        return [...filtered].sort((a, b) => a.short.localeCompare(b.short));
    }, [snap, activeTab, filter]);

    const totalPages = Math.max(1, Math.ceil(entries.length / PAGE_SIZE));
    const currentPage = Math.min(page, totalPages - 1);
    const pagedEntries = useMemo(
        () => entries.slice(currentPage * PAGE_SIZE, (currentPage + 1) * PAGE_SIZE),
        [entries, currentPage],
    );

    const total = {
        bronie: snap.bronie.length,
        tarcze: snap.tarcze.length,
        zbroje: snap.zbroje.length,
    };

    const effectiveSilverColor = silver.off ? undefined : silver.color;

    const renderAltWarning = (e: WeaponEntry | ShieldEntry | ArmorEntry) => {
        const hasAlt = !!e.shortAlt && e.shortAlt.trim() !== '';
        if (hasAlt) return null;
        return (
            <span
                className="zlom-tag zlom-tag--warn"
                title="Brak alternatywnego shorta (biernika)"
            >
                ⚠
            </span>
        );
    };

    const renderWeapon = (e: WeaponEntry, i: number) => {
        const effectiveColor = e.magik
            ? undefined
            : e.color ?? (e.srebro && effectiveSilverColor ? effectiveSilverColor : undefined);
        return (
        <tr key={e.opis || `${e.short}-${i}`} className={i % 2 ? 'zlom-row zlom-row--alt' : 'zlom-row'}>
            <td
                className="zlom-cell zlom-cell--short"
                style={effectiveColor ? { color: effectiveColor } : undefined}
            >
                {e.short}
                {renderAltWarning(e)}
                {e.srebro ? <span className="zlom-tag zlom-tag--silver" title="srebro">Ag</span> : null}
                {e.magik ? <span className="zlom-tag zlom-tag--magic" title="magia">M</span> : null}
            </td>
            <td className="zlom-cell">{e.typ}</td>
            <td className="zlom-cell">{protectionText(e.klute, e.obuch, e.ciete)}</td>
            <td className="zlom-cell zlom-cell--num">{e.wywazenie || ''}</td>
            <td className="zlom-cell zlom-cell--num">{e.parowanie || ''}</td>
            <td className="zlom-cell zlom-cell--num">{e.cena}</td>
            <td className="zlom-cell zlom-cell--num">{e.waga}</td>
            {renderColorCell('bronie', e)}
            {renderNoteCell('bronie', e)}
        </tr>
        );
    };

    const renderShield = (e: ShieldEntry, i: number) => (
        <tr key={e.opis || `${e.short}-${i}`} className={i % 2 ? 'zlom-row zlom-row--alt' : 'zlom-row'}>
            <td className="zlom-cell zlom-cell--short" style={!e.magik && e.color ? { color: e.color } : undefined}>
                {e.short}
                {renderAltWarning(e)}
                {e.magik ? <span className="zlom-tag zlom-tag--magic" title="magia">M</span> : null}
            </td>
            <td className="zlom-cell">{e.oslona}</td>
            <td className="zlom-cell">{protectionText(e.klute, e.obuch, e.ciete)}</td>
            <td className="zlom-cell zlom-cell--num">{e.parowanie || ''}</td>
            <td className="zlom-cell zlom-cell--num">{e.cena}</td>
            <td className="zlom-cell zlom-cell--num">{e.waga}</td>
            {renderColorCell('tarcze', e)}
            {renderNoteCell('tarcze', e)}
        </tr>
    );

    const renderArmor = (e: ArmorEntry, i: number) => (
        <tr key={e.opis || `${e.short}-${i}`} className={i % 2 ? 'zlom-row zlom-row--alt' : 'zlom-row'}>
            <td className="zlom-cell zlom-cell--short" style={!e.magik && e.color ? { color: e.color } : undefined}>
                {e.short}
                {renderAltWarning(e)}
                {e.magik ? <span className="zlom-tag zlom-tag--magic" title="magia">M</span> : null}
            </td>
            <td className="zlom-cell">{e.typ}</td>
            <td className="zlom-cell">{e.oslona}</td>
            <td className="zlom-cell">{protectionText(e.klute, e.obuch, e.ciete)}</td>
            <td className="zlom-cell zlom-cell--num">{e.cena}</td>
            <td className="zlom-cell zlom-cell--num">{e.waga}</td>
            {renderColorCell('zbroje', e)}
            {renderNoteCell('zbroje', e)}
        </tr>
    );

    const tableHead = activeTab === 'bronie' ? (
        <tr>
            <th>Short</th><th>Typ</th><th>K/O/C</th><th>Wyw.</th><th>Par.</th><th>Cena</th><th>Waga</th><th>Kolor</th><th>Notatka</th>
        </tr>
    ) : activeTab === 'tarcze' ? (
        <tr>
            <th>Short</th><th>Oslona</th><th>K/O/C</th><th>Par.</th><th>Cena</th><th>Waga</th><th>Kolor</th><th>Notatka</th>
        </tr>
    ) : (
        <tr>
            <th>Short</th><th>Typ</th><th>Oslona</th><th>K/O/C</th><th>Cena</th><th>Waga</th><th>Kolor</th><th>Notatka</th>
        </tr>
    );

    const headerActions = (
        <>
            <button
                type="button"
                className="popup-btn"
                onClick={handleExport}
                title="Zapisz baze do pliku JSON"
                disabled={importState.phase === 'loading'}
            >
                Export
            </button>
            <button
                type="button"
                className="popup-btn"
                onClick={handleJsonImportClick}
                title="Wczytaj baze z pliku JSON"
                disabled={importState.phase === 'loading'}
            >
                Import
            </button>
            <button
                type="button"
                className="popup-btn"
                onClick={handleImportClick}
                title="Importuj baze z pliku Mudleta"
                disabled={importState.phase === 'loading'}
            >
                Import z Mudleta
            </button>
            <input
                ref={fileInputRef}
                type="file"
                accept=".db,.sqlite"
                style={{ display: 'none' }}
                onChange={handleFileChange}
            />
            <input
                ref={jsonInputRef}
                type="file"
                accept=".json,application/json"
                style={{ display: 'none' }}
                onChange={handleJsonFileChange}
            />
        </>
    );

    return (
        <DockablePopupWrapper
            {...wrapperProps}
            popupType="zlom"
            title="Zlom"
            minWidth={480}
            minHeight={280}
            initialWidth={792}
            initialHeight={520}
            className="zlom-popup postepy2-popup"
            bodyClassName="zlom-popup-body postepy2-popup-body"
            headerActions={headerActions}
        >
            <div className="postepy2-header">
                <div className="zlom-header-actions">
                    <label className="zlom-toggle" title="Kolor dla broni ze srebrem (x aby wylaczyc)">
                        <span>Srebro</span>
                        <span className="zlom-silver-swatch">
                            <input
                                type="color"
                                className="zlom-color-input"
                                value={silver.color}
                                onMouseDown={() => {
                                    if (silver.off) updateSilver({ off: false });
                                }}
                                onChange={(e) => updateSilver({ color: e.target.value, off: false })}
                                style={silver.off ? { opacity: 0.4 } : undefined}
                            />
                            {silver.off && <span className="zlom-silver-swatch__cross">×</span>}
                        </span>
                        <button
                            type="button"
                            className="zlom-color-clear"
                            onClick={() => updateSilver({ off: true })}
                            title="Nie koloruj srebra"
                            style={silver.off ? { visibility: 'hidden' } : undefined}
                        >
                            x
                        </button>
                    </label>
                    <input
                        type="text"
                        className="zlom-filter"
                        placeholder="Filtruj..."
                        value={filter}
                        onChange={(e) => setFilter(e.target.value)}
                    />
                </div>
            </div>

            {importState.phase === 'loading' && (
                <div className="postepy2-import-panel">Wczytywanie bazy danych...</div>
            )}

            {importState.phase === 'preview' && (
                <div className="postepy2-import-panel">
                    <div className="postepy2-import-panel__row">
                        <label className="postepy2-import-panel__label">Tryb:</label>
                        <select
                            className="postepy2-import-panel__select"
                            value={importState.mergeMode}
                            onChange={(e) => setImportState({ ...importState, mergeMode: e.target.value as ZlomMergeMode })}
                        >
                            <option value="replace">Nadpisz istniejace</option>
                            <option value="keep">Zachowaj istniejace, dodaj nowe</option>
                            <option value="unique-short">Dodaj tylko nowe shorty</option>
                        </select>
                    </div>
                    <div className="postepy2-import-panel__info">
                        {importState.parsed.bronie.length} broni, {importState.parsed.tarcze.length} tarcz, {importState.parsed.zbroje.length} zbroi
                    </div>
                    <div className="postepy2-import-panel__actions">
                        <button type="button" className="postepy2-import-panel__btn postepy2-import-panel__btn--confirm" onClick={handleImportConfirm}>
                            Importuj
                        </button>
                        <button type="button" className="postepy2-import-panel__btn postepy2-import-panel__btn--cancel" onClick={handleImportCancel}>
                            Anuluj
                        </button>
                    </div>
                </div>
            )}

            {(importState.phase === 'done' || importState.phase === 'error') && (
                <div className={`postepy2-import-message ${importState.phase === 'error' ? 'postepy2-import-message--error' : 'postepy2-import-message--success'}`}>
                    <span>{importState.message}</span>
                    <button type="button" className="postepy2-import-message__close" onClick={handleImportCancel}>x</button>
                </div>
            )}

            <div className="postepy2-tabs">
                <button
                    type="button"
                    className={`popup-tab ${activeTab === 'bronie' ? 'popup-tab--active' : ''}`}
                    onClick={() => setActiveTab('bronie')}
                >
                    Bronie ({total.bronie})
                </button>
                <button
                    type="button"
                    className={`popup-tab ${activeTab === 'tarcze' ? 'popup-tab--active' : ''}`}
                    onClick={() => setActiveTab('tarcze')}
                >
                    Tarcze ({total.tarcze})
                </button>
                <button
                    type="button"
                    className={`popup-tab ${activeTab === 'zbroje' ? 'popup-tab--active' : ''}`}
                    onClick={() => setActiveTab('zbroje')}
                >
                    Zbroje ({total.zbroje})
                </button>
            </div>

            <div className="zlom-content postepy2-content">
                {entries.length === 0 ? (
                    <div className="popup-empty">Brak zapisanych pozycji.</div>
                ) : (
                    <table className="zlom-table">
                        <thead>{tableHead}</thead>
                        <tbody>
                            {activeTab === 'bronie' && pagedEntries.map((e, i) => renderWeapon(e as WeaponEntry, i))}
                            {activeTab === 'tarcze' && pagedEntries.map((e, i) => renderShield(e as ShieldEntry, i))}
                            {activeTab === 'zbroje' && pagedEntries.map((e, i) => renderArmor(e as ArmorEntry, i))}
                        </tbody>
                    </table>
                )}
            </div>

            {totalPages > 1 && (
                <div className="zlom-pagination">
                    <button
                        type="button"
                        onClick={() => setPage(0)}
                        disabled={currentPage === 0}
                        title="Pierwsza strona"
                    >
                        &laquo;
                    </button>
                    <button
                        type="button"
                        onClick={() => setPage(p => Math.max(0, p - 1))}
                        disabled={currentPage === 0}
                        title="Poprzednia strona"
                    >
                        &lsaquo;
                    </button>
                    <span className="zlom-pagination-info">
                        Strona {currentPage + 1} z {totalPages} ({entries.length})
                    </span>
                    <button
                        type="button"
                        onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
                        disabled={currentPage >= totalPages - 1}
                        title="Nastepna strona"
                    >
                        &rsaquo;
                    </button>
                    <button
                        type="button"
                        onClick={() => setPage(totalPages - 1)}
                        disabled={currentPage >= totalPages - 1}
                        title="Ostatnia strona"
                    >
                        &raquo;
                    </button>
                </div>
            )}
        </DockablePopupWrapper>
    );
};

export default ZlomPopup;
