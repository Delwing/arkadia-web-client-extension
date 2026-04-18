import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import eventBus from '@modules/core/eventBus';
import { DockablePopupWrapper } from './layout/components/DockablePopupWrapper';
import { usePopup } from './hooks/usePopup';
import { usePopupSetting } from './hooks/usePopupSetting';
import { characterStorage } from '@modules/core/storage';
import {
    loadZlomSnapshot,
    mergeZlomData,
    clearZlomData,
    setZlomColor,
    ZlomSnapshot,
    WeaponEntry,
    ShieldEntry,
    ArmorEntry,
    ZlomMergeMode,
    ZlomKind,
} from '../client/scripts/zlom';
import { defaultSettings } from '@modules/core/defaultSettings';
import type {
    ZlomDbResult,
    ZlomDbWorkerRequest,
    ZlomDbWorkerResponse,
} from '@modules/data/zlomDbImport.shared';

const POPUP_ID = 'popup:zlom';

type TabType = 'bronie' | 'tarcze' | 'zbroje';

function emptySnapshot(): ZlomSnapshot {
    return { bronie: {}, tarcze: {}, zbroje: {} };
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

    const fileInputRef = useRef<HTMLInputElement>(null);
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

    const reload = useCallback(() => {
        setSnap(loadZlomSnapshot());
    }, []);

    useEffect(() => {
        if (isOpen) reload();
    }, [isOpen, reload]);

    useEffect(() => {
        const unsubUpdated = eventBus.on('zlom.updated', reload);
        const unsubReplaced = eventBus.on('zlom.snapshotReplaced', reload);
        return () => {
            unsubUpdated();
            unsubReplaced();
        };
    }, [reload]);

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

    const handleImportConfirm = useCallback(() => {
        if (importState.phase !== 'preview') return;
        const counts = mergeZlomData(importState.parsed, importState.mergeMode);
        const msg = `Zaimportowano: ${counts.bronie} broni, ${counts.tarcze} tarcz, ${counts.zbroje} zbroi.`;
        setImportState({ phase: 'done', message: msg });
    }, [importState]);

    const handleImportCancel = useCallback(() => {
        setImportState({ phase: 'idle' });
    }, []);

    const handleReset = useCallback(() => {
        if (!window.confirm('Wyczyscic cala baze zlomu?')) return;
        clearZlomData();
    }, []);

    const [colorSilver, setColorSilver] = useState<boolean>(() => {
        const v = characterStorage.get('settings')?.zlomColorSilver;
        return v !== false;
    });

    useEffect(() => {
        const unsub = characterStorage.onChange('settings', (v) => {
            const next = v?.zlomColorSilver;
            setColorSilver(next !== false);
        });
        return unsub;
    }, []);

    const toggleColorSilver = useCallback(() => {
        const current = characterStorage.get('settings') ?? defaultSettings;
        characterStorage.set('settings', { ...current, zlomColorSilver: !colorSilver });
    }, [colorSilver]);

    const handleColorChange = useCallback((kind: ZlomKind, short: string, value: string) => {
        setZlomColor(kind, short, value || undefined);
    }, []);

    const handleColorClear = useCallback((kind: ZlomKind, short: string) => {
        setZlomColor(kind, short, undefined);
    }, []);

    const renderColorCell = (kind: ZlomKind, entry: WeaponEntry | ShieldEntry | ArmorEntry) => (
        <td className="zlom-cell zlom-cell--color">
            <input
                type="color"
                className="zlom-color-input"
                value={entry.color ?? '#ffffff'}
                onChange={(e) => handleColorChange(kind, entry.short, e.target.value)}
                title={entry.color ? `Kolor: ${entry.color}` : 'Ustaw kolor'}
            />
            {entry.color && (
                <button
                    type="button"
                    className="zlom-color-clear"
                    onClick={() => handleColorClear(kind, entry.short)}
                    title="Usun kolor"
                >
                    x
                </button>
            )}
        </td>
    );

    const entries = useMemo(() => {
        const raw: (WeaponEntry | ShieldEntry | ArmorEntry)[] =
            activeTab === 'bronie' ? Object.values(snap.bronie)
                : activeTab === 'tarcze' ? Object.values(snap.tarcze)
                    : Object.values(snap.zbroje);
        const needle = filter.trim().toLowerCase();
        const filtered = needle ? raw.filter(e => e.short.toLowerCase().includes(needle)) : raw;
        return [...filtered].sort((a, b) => a.short.localeCompare(b.short));
    }, [snap, activeTab, filter]);

    const characterName = characterStorage.getCharacter();

    const total = {
        bronie: Object.keys(snap.bronie).length,
        tarcze: Object.keys(snap.tarcze).length,
        zbroje: Object.keys(snap.zbroje).length,
    };

    const renderWeapon = (e: WeaponEntry, i: number) => (
        <tr key={e.short} className={i % 2 ? 'zlom-row zlom-row--alt' : 'zlom-row'}>
            <td
                className="zlom-cell zlom-cell--short"
                style={e.color ? { color: e.color, textDecoration: e.srebro && colorSilver ? 'underline' : undefined } : undefined}
            >
                {e.short}
                {e.srebro ? <span className="zlom-tag zlom-tag--silver" title="srebro"> Ag</span> : null}
                {e.magik ? <span className="zlom-tag zlom-tag--magic" title="magia"> M</span> : null}
            </td>
            <td className="zlom-cell">{e.typ}</td>
            <td className="zlom-cell">{protectionText(e.klute, e.obuch, e.ciete)}</td>
            <td className="zlom-cell zlom-cell--num">{e.wywazenie || ''}</td>
            <td className="zlom-cell zlom-cell--num">{e.parowanie || ''}</td>
            <td className="zlom-cell zlom-cell--num">{e.cena}</td>
            <td className="zlom-cell zlom-cell--num">{e.waga}</td>
            {renderColorCell('bronie', e)}
        </tr>
    );

    const renderShield = (e: ShieldEntry, i: number) => (
        <tr key={e.short} className={i % 2 ? 'zlom-row zlom-row--alt' : 'zlom-row'}>
            <td className="zlom-cell zlom-cell--short" style={e.color ? { color: e.color } : undefined}>
                {e.short}
                {e.magik ? <span className="zlom-tag zlom-tag--magic" title="magia"> M</span> : null}
            </td>
            <td className="zlom-cell">{e.oslona}</td>
            <td className="zlom-cell">{protectionText(e.klute, e.obuch, e.ciete)}</td>
            <td className="zlom-cell zlom-cell--num">{e.parowanie || ''}</td>
            <td className="zlom-cell zlom-cell--num">{e.cena}</td>
            <td className="zlom-cell zlom-cell--num">{e.waga}</td>
            {renderColorCell('tarcze', e)}
        </tr>
    );

    const renderArmor = (e: ArmorEntry, i: number) => (
        <tr key={e.short} className={i % 2 ? 'zlom-row zlom-row--alt' : 'zlom-row'}>
            <td className="zlom-cell zlom-cell--short" style={e.color ? { color: e.color } : undefined}>
                {e.short}
                {e.magik ? <span className="zlom-tag zlom-tag--magic" title="magia"> M</span> : null}
            </td>
            <td className="zlom-cell">{e.typ}</td>
            <td className="zlom-cell">{e.oslona}</td>
            <td className="zlom-cell">{protectionText(e.klute, e.obuch, e.ciete)}</td>
            <td className="zlom-cell zlom-cell--num">{e.cena}</td>
            <td className="zlom-cell zlom-cell--num">{e.waga}</td>
            {renderColorCell('zbroje', e)}
        </tr>
    );

    const tableHead = activeTab === 'bronie' ? (
        <tr>
            <th>Short</th><th>Typ</th><th>K/O/C</th><th>Wyw.</th><th>Par.</th><th>Cena</th><th>Waga</th><th>Kolor</th>
        </tr>
    ) : activeTab === 'tarcze' ? (
        <tr>
            <th>Short</th><th>Oslona</th><th>K/O/C</th><th>Par.</th><th>Cena</th><th>Waga</th><th>Kolor</th>
        </tr>
    ) : (
        <tr>
            <th>Short</th><th>Typ</th><th>Oslona</th><th>K/O/C</th><th>Cena</th><th>Waga</th><th>Kolor</th>
        </tr>
    );

    return (
        <DockablePopupWrapper
            {...wrapperProps}
            popupType="zlom"
            title="Zlom"
            minWidth={480}
            minHeight={280}
            initialWidth={720}
            initialHeight={520}
            className="zlom-popup postepy2-popup"
            bodyClassName="zlom-popup-body postepy2-popup-body"
        >
            <div className="postepy2-header">
                {characterName && (
                    <span>
                        <span className="postepy2-header__label">Postac:</span>
                        <span className="postepy2-header__name">{characterName}</span>
                    </span>
                )}
                <div className="zlom-header-actions">
                    <label className="zlom-toggle" title="Podkreslaj bronie ze srebrem">
                        <input type="checkbox" checked={colorSilver} onChange={toggleColorSilver} />
                        <span>Srebro</span>
                    </label>
                    <input
                        type="text"
                        className="zlom-filter"
                        placeholder="Filtruj..."
                        value={filter}
                        onChange={(e) => setFilter(e.target.value)}
                    />
                    <button
                        type="button"
                        className="postepy2-import-button"
                        onClick={handleImportClick}
                        disabled={importState.phase === 'loading'}
                    >
                        Import z Mudleta
                    </button>
                    <button
                        type="button"
                        className="postepy2-import-button"
                        onClick={handleReset}
                        title="Wyczysc baze"
                    >
                        Reset
                    </button>
                    <input
                        ref={fileInputRef}
                        type="file"
                        accept=".db,.sqlite"
                        style={{ display: 'none' }}
                        onChange={handleFileChange}
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
                    className={`postepy2-tab-button ${activeTab === 'bronie' ? 'postepy2-tab-button--active' : ''}`}
                    onClick={() => setActiveTab('bronie')}
                >
                    Bronie ({total.bronie})
                </button>
                <button
                    type="button"
                    className={`postepy2-tab-button ${activeTab === 'tarcze' ? 'postepy2-tab-button--active' : ''}`}
                    onClick={() => setActiveTab('tarcze')}
                >
                    Tarcze ({total.tarcze})
                </button>
                <button
                    type="button"
                    className={`postepy2-tab-button ${activeTab === 'zbroje' ? 'postepy2-tab-button--active' : ''}`}
                    onClick={() => setActiveTab('zbroje')}
                >
                    Zbroje ({total.zbroje})
                </button>
            </div>

            <div className="zlom-content postepy2-content">
                {entries.length === 0 ? (
                    <div className="postepy2-empty">Brak zapisanych pozycji.</div>
                ) : (
                    <table className="zlom-table">
                        <thead>{tableHead}</thead>
                        <tbody>
                            {activeTab === 'bronie' && entries.map((e, i) => renderWeapon(e as WeaponEntry, i))}
                            {activeTab === 'tarcze' && entries.map((e, i) => renderShield(e as ShieldEntry, i))}
                            {activeTab === 'zbroje' && entries.map((e, i) => renderArmor(e as ArmorEntry, i))}
                        </tbody>
                    </table>
                )}
            </div>
        </DockablePopupWrapper>
    );
};

export default ZlomPopup;
