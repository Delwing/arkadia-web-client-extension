import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { DockablePopupWrapper } from './layout/components/DockablePopupWrapper';
import { usePopup } from './hooks/usePopup';
import { usePopupSetting } from './hooks/usePopupSetting';
import { characterStorage } from '@modules/core/storage';
import {
    mergeZlomData,
    setZlomColor,
    setZlomNote,
    setZlomILine,
    ZlomSnapshot,
    WeaponEntry,
    ShieldEntry,
    ArmorEntry,
    WearableEntry,
    ZlomImportPayload,
    ZlomMergeMode,
    ZlomKind,
} from '../client/scripts/zlom';
import {
    ensureZlomLoaded,
    getZlomSnapshot,
    iLineMatcher,
    subscribeZlom,
} from '@modules/data/zlomStore';
import { defaultSettings } from '@modules/core/defaultSettings';
import { openSettingsPage } from '@web/settings/categories.ts';
import { ColorInput, HeaderButton } from '@web-ui/primitives';
import { getCrowdSnapshot, subscribeCrowdSnapshot, type CrowdSnapshot } from '@modules/crowd/crowdSnapshot';
import { buildZlomView, type CrowdMarks, type ViewArmour, type ViewShield, type ViewWeapon, type ViewWearable, type ZlomView } from '@modules/crowd/crowdView';

const POPUP_ID = 'popup:zlom';
const PAGE_SIZE = 100;

type TabType = ZlomKind;

const TABS: { tab: TabType; label: string }[] = [
    { tab: 'bronie', label: 'Bronie' },
    { tab: 'tarcze', label: 'Tarcze' },
    { tab: 'zbroje', label: 'Zbroje' },
    { tab: 'ubrania', label: 'Ubrania' },
    { tab: 'dodatki', label: 'Dodatki' },
];

type AnyEntry = WeaponEntry | ShieldEntry | ArmorEntry | WearableEntry;
type AnyViewEntry = ViewWeapon | ViewShield | ViewArmour | ViewWearable;

/** What a row's popover edits: the note, or how the `i` reply words the piece */
type NoteField = 'note' | 'iLine';

function noteValue(entry: AnyEntry, field: NoteField): string | undefined {
    return field === 'iLine' ? (entry as ArmorEntry).iLine : entry.note;
}

function emptySnapshot(): ZlomSnapshot {
    return { bronie: [], tarcze: [], zbroje: [], ubrania: [], dodatki: [] };
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
    // Present only for a player who shares: crowdSnapshot downloads it for them alone
    const [crowd, setCrowd] = useState<CrowdSnapshot | null>(getCrowdSnapshot);
    useEffect(() => subscribeCrowdSnapshot(setCrowd), []);
    const [showCrowd, setShowCrowd] = usePopupSetting<boolean>(POPUP_ID, 'showCrowd', true);

    useEffect(() => {
        setPage(0);
    }, [activeTab, filter]);

    const jsonInputRef = useRef<HTMLInputElement>(null);
    const [importState, setImportState] = useState<
        | { phase: 'idle' }
        | { phase: 'loading' }
        | { phase: 'preview'; parsed: ZlomImportPayload; mergeMode: ZlomMergeMode }
        | { phase: 'done'; message: string }
        | { phase: 'error'; message: string }
    >({ phase: 'idle' });

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

    const handleImportConfirm = useCallback(async () => {
        if (importState.phase !== 'preview') return;
        try {
            const counts = await mergeZlomData(importState.parsed, importState.mergeMode);
            const msg = `Zaimportowano: ${counts.bronie} broni, ${counts.tarcze} tarcz, ${counts.zbroje} zbroi, ${counts.ubrania} ubrań, ${counts.dodatki} dodatków.`;
            setImportState({ phase: 'done', message: msg });
        } catch (err) {
            setImportState({ phase: 'error', message: err instanceof Error ? err.message : 'Błąd importu.' });
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
            ubrania: snap.ubrania,
            dodatki: snap.dodatki,
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
            const payload: Required<ZlomImportPayload> = {
                bronie: Array.isArray(parsed?.bronie) ? parsed.bronie : [],
                tarcze: Array.isArray(parsed?.tarcze) ? parsed.tarcze : [],
                zbroje: Array.isArray(parsed?.zbroje) ? parsed.zbroje : [],
                ubrania: Array.isArray(parsed?.ubrania) ? parsed.ubrania : [],
                dodatki: Array.isArray(parsed?.dodatki) ? parsed.dodatki : [],
            };
            if (Object.values(payload).every(list => list.length === 0)) {
                setImportState({ phase: 'error', message: 'Plik nie zawiera danych złomu.' });
                return;
            }
            setImportState({ phase: 'preview', parsed: payload, mergeMode: 'replace' });
        } catch (err) {
            setImportState({ phase: 'error', message: err instanceof Error ? err.message : 'Błąd parsowania JSON.' });
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
        | { kind: ZlomKind; opis: string; field: NoteField; value: string }
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

    const openNoteEditor = useCallback((kind: ZlomKind, entry: AnyEntry, field: NoteField) => {
        setNoteEditor({ kind, opis: entry.opis, field, value: noteValue(entry, field) ?? '' });
    }, []);

    const saveNoteEditor = useCallback(() => {
        if (!noteEditor) return;
        if (noteEditor.field === 'iLine') {
            void setZlomILine(noteEditor.kind as Exclude<ZlomKind, 'bronie'>, noteEditor.opis, noteEditor.value || undefined);
        } else {
            void setZlomNote(noteEditor.kind, noteEditor.opis, noteEditor.value || undefined);
        }
        setNoteEditor(null);
    }, [noteEditor]);

    const renderNoteCell = (kind: ZlomKind, entry: AnyEntry, field: NoteField = 'note') => {
        const value = noteValue(entry, field);
        const hasNote = !!value;
        const isOpen = noteEditor?.kind === kind && noteEditor.opis === entry.opis && noteEditor.field === field;
        const isILine = field === 'iLine';
        // Text is always fine; a /regexp/ only when it compiles
        const invalid = isOpen && isILine && noteEditor!.value.trim() !== '' && !iLineMatcher(noteEditor!.value);
        return (
            <td className="zlom-cell zlom-cell--note">
                <div className="zlom-note-wrap">
                    <button
                        type="button"
                        className={`zlom-note-btn${hasNote ? ' zlom-note-btn--has' : ''}`}
                        onClick={() => openNoteEditor(kind, entry, field)}
                        title={hasNote ? value : isILine ? 'Jak opisuje go i, gdy nie z nazwy' : 'Dodaj notatkę'}
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
                                    } else if (e.key === 'Enter' && (e.ctrlKey || e.metaKey) && !invalid) {
                                        e.preventDefault();
                                        saveNoteEditor();
                                    }
                                }}
                                placeholder={isILine ? 'Linia z i albo /regexp/' : 'Notatka...'}
                            />
                            {isILine && (
                                <div className={`zlom-note-hint${invalid ? ' zlom-note-hint--error' : ''}`}>
                                    {invalid
                                        ? 'Błędny regexp'
                                        : 'Tekst, który zawiera linia z i, albo /regexp/. Sprawdzane tylko w odpowiedzi na i.'}
                                </div>
                            )}
                            <div className="zlom-note-popover__actions">
                                <button type="button" className="popup-btn" onClick={() => setNoteEditor(null)}>Anuluj</button>
                                <button type="button" className="popup-btn" onClick={saveNoteEditor} disabled={invalid}>Zapisz</button>
                            </div>
                        </div>
                    )}
                </div>
            </td>
        );
    };

    const renderColorCell = (kind: ZlomKind, entry: AnyEntry) => (
        <td className="zlom-cell zlom-cell--color">
            <ColorInput
                className="zlom-color-input"
                value={entry.color ?? '#ffffff'}
                onChange={v => handleColorChange(kind, entry.opis, v)}
                title={entry.color ? `Kolor: ${entry.color}` : 'Ustaw kolor'}
            />
            <button
                type="button"
                className="zlom-color-clear"
                onClick={() => handleColorClear(kind, entry.opis)}
                title="Usuń kolor"
                style={entry.color ? undefined : { visibility: 'hidden' }}
            >
                x
            </button>
        </td>
    );

    // The player's list, completed from other players' when they share and want to see it.
    // Only for looking at: export, colours and notes stay on the player's own entries.
    const view: ZlomView = useMemo(
        () => (showCrowd && crowd ? buildZlomView(snap, crowd) : snap),
        [snap, crowd, showCrowd],
    );

    const entries = useMemo(() => {
        const raw: AnyViewEntry[] = view[activeTab] ?? [];
        const needle = filter.trim().toLowerCase();
        const filtered = needle ? raw.filter(e => e.short.toLowerCase().includes(needle)) : raw;
        return [...filtered].sort((a, b) => a.short.localeCompare(b.short));
    }, [view, activeTab, filter]);

    const totalPages = Math.max(1, Math.ceil(entries.length / PAGE_SIZE));
    const currentPage = Math.min(page, totalPages - 1);
    const pagedEntries = useMemo(
        () => entries.slice(currentPage * PAGE_SIZE, (currentPage + 1) * PAGE_SIZE),
        [entries, currentPage],
    );



    /** A crowd row knows no weight, price or ratings: blank, not a misleading 0 */
    const own = (e: CrowdMarks, value: React.ReactNode) => (e.fromCrowd ? '' : value);

    const renderCrowdTag = (e: CrowdMarks) => {
        if (e.fromCrowd) {
            return (
                <span
                    className="zlom-tag zlom-tag--crowd"
                    title={`Ze wspólnego spisu (potwierdzeń: ${e.confirmations ?? 1}). Nie oceniłeś go sam: waga, cena i oceny są nieznane.`}
                >
                    W
                </span>
            );
        }
        if (e.crowdFilled?.length) {
            return (
                <span className="zlom-tag zlom-tag--crowd-filled" title={`Uzupełnione ze wspólnego spisu: ${e.crowdFilled.join(', ')}`}>
                    +W
                </span>
            );
        }
        return null;
    };

    /** Colour and note belong to the player's own entries; a crowd row has neither */
    const ownCells = (kind: ZlomKind, e: AnyViewEntry, withILine: boolean) => e.fromCrowd ? (
        <>
            {withILine && <td className="zlom-cell zlom-cell--note" title={(e as ViewArmour).iLine}>{(e as ViewArmour).iLine ? '●' : ''}</td>}
            <td className="zlom-cell" />
            <td className="zlom-cell" />
        </>
    ) : (
        <>
            {withILine && renderNoteCell(kind, e, 'iLine')}
            {renderColorCell(kind, e)}
            {renderNoteCell(kind, e)}
        </>
    );

    const effectiveSilverColor = silver.off ? undefined : silver.color;

    const renderAltWarning = (e: AnyEntry) => {
        const hasAlt = !!e.shortAlt && e.shortAlt.trim() !== '';
        if (hasAlt) return null;
        return (
            <span
                className="zlom-tag zlom-tag--warn"
                title="Biernik nieznany - wpis nie pochodzi z oceny (import lub stary zapis). Oceń przedmiot ponownie."
            >
                ⚠
            </span>
        );
    };

    const rowClass = (e: CrowdMarks, i: number) =>
        `zlom-row${i % 2 ? ' zlom-row--alt' : ''}${e.fromCrowd ? ' zlom-row--crowd' : ''}`;

    const renderWeapon = (e: ViewWeapon, i: number) => {
        const effectiveColor = e.magik
            ? undefined
            : e.color ?? (e.srebro && effectiveSilverColor ? effectiveSilverColor : undefined);
        return (
        <tr key={`${e.fromCrowd ? 'w:' : ''}${e.opis || `${e.short}-${i}`}`} className={rowClass(e, i)}>
            <td
                className="zlom-cell zlom-cell--short"
                style={effectiveColor ? { color: effectiveColor } : undefined}
            >
                {e.short}
                {!e.fromCrowd && renderAltWarning(e)}
                {renderCrowdTag(e)}
                {e.srebro ? <span className="zlom-tag zlom-tag--silver" title="srebro">Ag</span> : null}
                {e.magik ? <span className="zlom-tag zlom-tag--magic" title="magia">M</span> : null}
            </td>
            <td className="zlom-cell">{e.typ}</td>
            <td className="zlom-cell">{protectionText(e.klute, e.obuch, e.ciete)}</td>
            <td className="zlom-cell zlom-cell--num">{own(e, e.wywazenie || '')}</td>
            <td className="zlom-cell zlom-cell--num">{own(e, e.parowanie || '')}</td>
            <td className="zlom-cell zlom-cell--num">{own(e, e.cena)}</td>
            <td className="zlom-cell zlom-cell--num">{own(e, e.waga)}</td>
            {ownCells('bronie', e, false)}
        </tr>
        );
    };

    const renderShield = (e: ViewShield, i: number) => (
        <tr key={`${e.fromCrowd ? 'w:' : ''}${e.opis || `${e.short}-${i}`}`} className={rowClass(e, i)}>
            <td className="zlom-cell zlom-cell--short" style={!e.magik && e.color ? { color: e.color } : undefined}>
                {e.short}
                {!e.fromCrowd && renderAltWarning(e)}
                {renderCrowdTag(e)}
                {e.magik ? <span className="zlom-tag zlom-tag--magic" title="magia">M</span> : null}
            </td>
            <td className="zlom-cell">{e.oslona}</td>
            <td className="zlom-cell">{own(e, protectionText(e.klute, e.obuch, e.ciete))}</td>
            <td className="zlom-cell zlom-cell--num">{own(e, e.parowanie || '')}</td>
            <td className="zlom-cell zlom-cell--num">{own(e, e.cena)}</td>
            <td className="zlom-cell zlom-cell--num">{own(e, e.waga)}</td>
            {ownCells('tarcze', e, true)}
        </tr>
    );

    const renderArmor = (e: ViewArmour, i: number) => (
        <tr key={`${e.fromCrowd ? 'w:' : ''}${e.opis || `${e.short}-${i}`}`} className={rowClass(e, i)}>
            <td className="zlom-cell zlom-cell--short" style={!e.magik && e.color ? { color: e.color } : undefined}>
                {e.short}
                {!e.fromCrowd && renderAltWarning(e)}
                {renderCrowdTag(e)}
                {e.magik ? <span className="zlom-tag zlom-tag--magic" title="magia">M</span> : null}
            </td>
            <td className="zlom-cell">{e.typ}</td>
            <td className="zlom-cell">{e.oslona}</td>
            <td className="zlom-cell">{own(e, protectionText(e.klute, e.obuch, e.ciete))}</td>
            <td className="zlom-cell zlom-cell--num">{own(e, e.cena)}</td>
            <td className="zlom-cell zlom-cell--num">{own(e, e.waga)}</td>
            {ownCells('zbroje', e, true)}
        </tr>
    );

    const renderWearable = (kind: 'ubrania' | 'dodatki', e: ViewWearable, i: number) => (
        <tr key={`${e.fromCrowd ? 'w:' : ''}${e.opis || `${e.short}-${i}`}`} className={rowClass(e, i)}>
            <td className="zlom-cell zlom-cell--short" style={e.color ? { color: e.color } : undefined}>
                {e.short}
                {!e.fromCrowd && renderAltWarning(e)}
                {renderCrowdTag(e)}
            </td>
            <td className="zlom-cell">{e.material}</td>
            <td className="zlom-cell zlom-cell--num">{own(e, e.cena)}</td>
            <td className="zlom-cell zlom-cell--num">{own(e, e.waga)}</td>
            {ownCells(kind, e, true)}
        </tr>
    );

    const tableHead = activeTab === 'ubrania' || activeTab === 'dodatki' ? (
        <tr>
            <th>Short</th><th>Materiał</th><th>Cena</th><th>Waga</th><th title="Jak opisuje go i, gdy nie z nazwy">W i</th><th>Kolor</th><th>Notatka</th>
        </tr>
    ) : activeTab === 'bronie' ? (
        <tr>
            <th>Short</th><th>Typ</th><th>K/O/C</th><th>Wyw.</th><th>Par.</th><th>Cena</th><th>Waga</th><th>Kolor</th><th>Notatka</th>
        </tr>
    ) : activeTab === 'tarcze' ? (
        <tr>
            <th>Short</th><th>Osłona</th><th>K/O/C</th><th>Par.</th><th>Cena</th><th>Waga</th><th title="Jak opisuje go i, gdy nie z nazwy">W i</th><th>Kolor</th><th>Notatka</th>
        </tr>
    ) : (
        <tr>
            <th>Short</th><th>Typ</th><th>Osłona</th><th>K/O/C</th><th>Cena</th><th>Waga</th><th title="Jak opisuje go i, gdy nie z nazwy">W i</th><th>Kolor</th><th>Notatka</th>
        </tr>
    );

    const headerActions = (
        <>
            {crowd && (
                <HeaderButton
                    active={showCrowd}
                    onClick={() => setShowCrowd(!showCrowd)}
                    title="Pokaż też przedmioty i dane innych graczy ze wspólnego spisu"
                >
                    Wspólny
                </HeaderButton>
            )}
            <HeaderButton
                onClick={handleExport}
                title="Zapisz bazę do pliku JSON"
                disabled={importState.phase === 'loading'}
            >
                Export
            </HeaderButton>
            <HeaderButton
                onClick={handleJsonImportClick}
                title="Wczytaj bazę z pliku JSON"
                disabled={importState.phase === 'loading'}
            >
                Import
            </HeaderButton>
            <HeaderButton
                onClick={() => openSettingsPage('data-import', 'import-zlom')}
                title="Import bazy z Mudleta (Ustawienia → Import z innych klientów)"
            >
                Import z Mudleta
            </HeaderButton>
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
            title="Złom"
            minWidth={480}
            minHeight={280}
            initialWidth={792}
            initialHeight={520}
            className="zlom-popup postepy2-popup"
            bodyClassName="zlom-popup-body popup-body"
            headerActions={headerActions}
        >
            <div className="postepy2-header">
                <div className="zlom-header-actions">
                    <label className="zlom-toggle" title="Kolor dla broni ze srebrem (x aby wyłączyć)">
                        <span>Srebro</span>
                        <span className="zlom-silver-swatch">
                            <ColorInput
                                className="zlom-color-input"
                                value={silver.color}
                                onMouseDown={() => {
                                    if (silver.off) updateSilver({ off: false });
                                }}
                                onChange={v => updateSilver({ color: v, off: false })}
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
                            <option value="replace">Nadpisz istniejące</option>
                            <option value="keep">Zachowaj istniejące, dodaj nowe</option>
                            <option value="unique-short">Dodaj tylko nowe shorty</option>
                        </select>
                    </div>
                    <div className="postepy2-import-panel__info">
                        {importState.parsed.bronie.length} broni, {importState.parsed.tarcze.length} tarcz, {importState.parsed.zbroje.length} zbroi
                        {importState.parsed.ubrania?.length ? `, ${importState.parsed.ubrania.length} ubrań` : ''}
                        {importState.parsed.dodatki?.length ? `, ${importState.parsed.dodatki.length} dodatków` : ''}
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
                {TABS.map(({ tab, label }) => (
                    <button
                        key={tab}
                        type="button"
                        className={`popup-tab ${activeTab === tab ? 'popup-tab--active' : ''}`}
                        onClick={() => setActiveTab(tab)}
                    >
                        {label} ({view[tab].length})
                    </button>
                ))}
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
                            {(activeTab === 'ubrania' || activeTab === 'dodatki')
                                && pagedEntries.map((e, i) => renderWearable(activeTab, e as ViewWearable, i))}
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
                        title="Następna strona"
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
