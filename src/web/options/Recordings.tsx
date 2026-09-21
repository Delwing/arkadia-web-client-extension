import {ChangeEvent, DragEvent, useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {Circle, Download, HardDriveDownload, Play, Search, Square, Upload} from 'lucide-react';
import {Button, DeleteButton, Input, InputGroup, MenuButton, Notice} from '@web-ui/primitives/index.ts';
import {deleteRecording, getRecordingSummaries, saveRecording, type RecordedEvent, type RecordingSummary} from '@web/recordingStorage.ts';
import eventBus from "@modules/core/eventBus";
import recordingManager from "../RecordingManager";

const BLACK_BOX_RECENT_MS = 3 * 60 * 1000;

type Progress = { name: string; startedAt: number; events: number };

const pad = (n: number) => String(n).padStart(2, '0');

/** 12:34, or 1:02:03 past an hour. */
export function formatClock(ms: number) {
    const total = Math.max(0, Math.floor(ms / 1000));
    const h = Math.floor(total / 3600);
    const m = Math.floor((total % 3600) / 60);
    const s = total % 60;
    return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
}

/** "14 min", "1 h 12 min", "<1 min". */
function formatLength(ms: number) {
    const minutes = Math.round(ms / 60000);
    if (minutes < 1) return '<1 min';
    const h = Math.floor(minutes / 60);
    return h > 0 ? `${h} h ${minutes % 60} min` : `${minutes} min`;
}

function eventsLabel(n: number) {
    const last = n % 10;
    const lastTwo = n % 100;
    const word = n === 1 ? 'zdarzenie'
        : last >= 2 && last <= 4 && (lastTwo < 12 || lastTwo > 14) ? 'zdarzenia'
        : 'zdarzeń';
    return `${n.toLocaleString('pl-PL')} ${word}`;
}

function summaryMeta(r: RecordingSummary) {
    if (r.start === null || r.end === null) return eventsLabel(r.events);
    const d = new Date(r.start);
    return [
        `${pad(d.getDate())}.${pad(d.getMonth() + 1)}`,
        `${pad(d.getHours())}:${pad(d.getMinutes())}`,
        formatLength(r.end - r.start),
        eventsLabel(r.events),
    ].join(' · ');
}

function defaultRecordingName() {
    const d = new Date();
    return `${pad(d.getDate())}.${pad(d.getMonth() + 1)} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** Activity over the recording's length: taller bars where more happened. */
function Sparkline({activity}: { activity: number[] }) {
    if (activity.length === 0) return <span className="recordings-spark" />;
    const max = Math.max(1, ...activity);
    const w = 3;
    return (
        <svg className="recordings-spark" viewBox={`0 0 ${activity.length * w} 20`} preserveAspectRatio="none">
            {activity.map((v, i) => {
                const h = v === 0 ? 0 : Math.max(2, (v / max) * 20);
                return <rect key={i} x={i * w} y={20 - h} width={w - 1} height={h} rx={0.5} />;
            })}
        </svg>
    );
}

function createDownload(json: string, filename: string) {
    const blob = new Blob([json], {type: 'application/json'});
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
}

function safeFileName(name: string) {
    return name.replace(/[^a-z0-9-_]+/gi, '_') || 'recording';
}

async function fetchRecordingEvents(name: string, options?: { recentMs?: number }): Promise<RecordedEvent[] | null> {
    return recordingManager.getRecordingSnapshot(name, options);
}

function closeDialog() {
    window.dispatchEvent(new Event('close-options'));
}

function Recordings() {
    const [recordings, setRecordings] = useState<RecordingSummary[]>([]);
    const [newName, setNewName] = useState('');
    const [query, setQuery] = useState('');
    const [message, setMessage] = useState<{ text: string; error?: boolean } | null>(null);
    const [active, setActive] = useState<Progress | null>(() => recordingManager.getActiveRecordingInfo());
    const [blackBox, setBlackBox] = useState<Progress | null>(() => recordingManager.getAutoRecordingInfo());
    const [playing, setPlaying] = useState<string | null>(() => recordingManager.getPlaybackName());
    const [canPlay, setCanPlay] = useState(() => recordingManager.canPlayback());
    const [now, setNow] = useState(() => Date.now());
    const [dragOver, setDragOver] = useState(false);
    const fileInput = useRef<HTMLInputElement>(null);

    const load = useCallback(() => {
        getRecordingSummaries().then(setRecordings).catch(() => setRecordings([]));
    }, []);

    // Mounted once at start-up, so re-read the list every time the dialog opens.
    useEffect(() => {
        load();
        const modal = document.getElementById('recordings-modal');
        modal?.addEventListener('show.bs.modal', load);
        return () => modal?.removeEventListener('show.bs.modal', load);
    }, [load]);

    // The recording card and the black box tick once a second.
    useEffect(() => {
        const refresh = () => {
            setActive(recordingManager.getActiveRecordingInfo());
            setBlackBox(recordingManager.getAutoRecordingInfo());
            setCanPlay(recordingManager.canPlayback());
            setNow(Date.now());
        };
        const timer = window.setInterval(refresh, 1000);
        const offs = [
            eventBus.on('recording.start', refresh),
            eventBus.on('recording.stop', (save?: boolean) => {
                refresh();
                if (save) load();
            }),
            eventBus.on('recording.auto.start', refresh),
            eventBus.on('recording.auto.stop', refresh),
            eventBus.on('client.connect', refresh),
            eventBus.on('client.disconnect', refresh),
            eventBus.on('recording.loaded', () => setPlaying(recordingManager.getPlaybackName())),
            eventBus.on('playback.start', () => setPlaying(recordingManager.getPlaybackName())),
            eventBus.on('playback.stop', () => setPlaying(null)),
        ];
        return () => {
            window.clearInterval(timer);
            offs.forEach(off => off?.());
        };
    }, [load]);

    const visible = useMemo(() => {
        const q = query.trim().toLowerCase();
        const sorted = [...recordings].sort((a, b) => (b.start ?? 0) - (a.start ?? 0));
        return q ? sorted.filter(r => r.name.toLowerCase().includes(q)) : sorted;
    }, [recordings, query]);

    function start() {
        const name = newName.trim() || defaultRecordingName();
        closeDialog();
        recordingManager.startRecording(name);
        setNewName('');
    }

    async function stop(save: boolean) {
        await recordingManager.stopRecording(save);
        setActive(null);
        if (save) load();
    }

    async function play(name: string, mode: 'timed' | 'step' | 'all') {
        if (!recordingManager.canPlayback()) return;
        closeDialog();
        await recordingManager.loadRecording(name);
        if (mode === 'timed') recordingManager.replayRecordedMessagesTimed();
        if (mode === 'all') recordingManager.replayRecordedMessages();
    }

    async function remove(name: string) {
        await deleteRecording(name);
        load();
    }

    async function download(name: string, options?: { recentMs?: number; fileName?: string }) {
        const events = await fetchRecordingEvents(name, options);
        if (!events) return;
        const fileName = options?.fileName ?? name;
        createDownload(JSON.stringify({[fileName]: events}, null, 2), `arkadia-recording-${safeFileName(fileName)}.json`);
    }

    function downloadBlackBox(recentMs?: number) {
        if (!blackBox) return;
        const stamp = new Date().toISOString().replace(/[:.]/g, '-');
        void download(blackBox.name, {recentMs, fileName: `czarna-skrzynka-${recentMs ? 'ostatnie-3-min' : 'sesja'}-${stamp}`});
    }

    async function exportAll() {
        const all: Record<string, RecordedEvent[]> = {};
        const names = new Set(recordings.map(r => r.name));
        if (active) names.add(active.name);
        if (blackBox) names.add(blackBox.name);
        for (const name of names) {
            const events = await fetchRecordingEvents(name);
            if (events) all[name] = events;
        }
        createDownload(JSON.stringify(all, null, 2), 'arkadia-recordings.json');
    }

    async function importFile(file: File) {
        try {
            const data = JSON.parse(await file.text());
            if (typeof data !== 'object' || data === null) throw new Error('Invalid JSON structure');
            let count = 0;
            for (const [name, events] of Object.entries<unknown>(data)) {
                if (Array.isArray(events)) {
                    await saveRecording(name, events as RecordedEvent[]);
                    count++;
                }
            }
            if (count === 0) throw new Error('No recordings in file');
            setMessage({text: count === 1 ? 'Wczytano 1 nagranie.' : `Wczytano nagrania: ${count}.`});
            load();
        } catch (e) {
            console.error('Error uploading recordings:', e);
            setMessage({text: 'Ten plik nie zawiera nagrań.', error: true});
        }
    }

    function onFileChange(event: ChangeEvent<HTMLInputElement>) {
        const file = event.target.files?.[0];
        if (file) void importFile(file);
        event.target.value = '';
    }

    function onDrop(event: DragEvent) {
        event.preventDefault();
        setDragOver(false);
        const file = event.dataTransfer.files?.[0];
        if (file) void importFile(file);
    }

    return (
        <div
            className={`recordings${dragOver ? ' is-drag-over' : ''}`}
            onDragOver={e => { if (e.dataTransfer.types.includes('Files')) { e.preventDefault(); setDragOver(true); } }}
            onDragLeave={e => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragOver(false); }}
            onDrop={onDrop}
        >
            {active ? (
                <section className="recordings-live">
                    <span className="recordings-live__dot"><Circle size={12} fill="currentColor" strokeWidth={0} /></span>
                    <div className="recordings-live__main">
                        <span className="recordings-live__title">
                            <span className="recordings-live__label">Nagrywanie</span>
                            <strong>{active.name}</strong>
                        </span>
                        <span className="recordings-live__meta">
                            {formatClock(now - active.startedAt)} · {eventsLabel(active.events)}
                        </span>
                    </div>
                    <div className="recordings-live__actions">
                        <Button variant="ghost" size="sm" onClick={() => download(active.name)}>
                            <Download size={15} strokeWidth={1.75} />Pobierz teraz
                        </Button>
                        <Button variant="danger" size="sm" onClick={() => stop(false)}>Odrzuć</Button>
                        <Button variant="solid" size="sm" onClick={() => stop(true)}>
                            <Square size={11} fill="currentColor" strokeWidth={0} />Zakończ i zapisz
                        </Button>
                    </div>
                </section>
            ) : (
                <section className="recordings-new">
                    <Input
                        className="recording-name-input"
                        value={newName}
                        placeholder={`Nazwa, np. ${defaultRecordingName()}`}
                        onChange={e => setNewName(e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter') start(); }}
                    />
                    <Button className="recordings-rec" onClick={start}>
                        <Circle size={11} fill="currentColor" strokeWidth={0} />Nagrywaj
                    </Button>
                </section>
            )}

            <section className="recordings-blackbox">
                <HardDriveDownload size={18} strokeWidth={1.75} className="recordings-blackbox__icon" />
                <div className="recordings-blackbox__main">
                    <strong>Czarna skrzynka</strong>
                    <span className="popup-field__hint">
                        {blackBox
                            ? `Zapisuje całą sesję od zalogowania (${formatLength(now - blackBox.startedAt)}). Przydaje się do zgłoszenia błędu.`
                            : 'Włącza się sama po zalogowaniu do gry i zapisuje całą sesję.'}
                    </span>
                </div>
                <Button size="sm" disabled={!blackBox} onClick={() => downloadBlackBox(BLACK_BOX_RECENT_MS)}>
                    <Download size={15} strokeWidth={1.75} />Ostatnie 3 min
                </Button>
                <Button variant="ghost" size="sm" disabled={!blackBox} onClick={() => downloadBlackBox()}>Cała sesja</Button>
            </section>

            <div className="recordings-toolbar">
                <span className="recordings-toolbar__title">Zapisane</span>
                <span className="popup-chip">{recordings.length}</span>
                <span className="recordings-toolbar__spacer" />
                {recordings.length > 5 && (
                    <InputGroup before={<Search size={14} strokeWidth={1.75} />}>
                        <Input value={query} placeholder="Szukaj nagrania" onChange={e => setQuery(e.target.value)} />
                    </InputGroup>
                )}
                <Button variant="ghost" size="sm" onClick={() => fileInput.current?.click()}>
                    <Upload size={15} strokeWidth={1.75} />Importuj
                </Button>
                <Button variant="ghost" size="sm" onClick={exportAll} title="Pobierz wszystkie nagrania w jednym pliku" disabled={recordings.length === 0 && !active && !blackBox}>
                    <Download size={15} strokeWidth={1.75} />Eksportuj
                </Button>
                <input ref={fileInput} type="file" accept="application/json,.json" hidden onChange={onFileChange} />
            </div>

            {message && (
                <Notice variant={message.error ? 'danger' : 'success'} onClose={() => setMessage(null)}>{message.text}</Notice>
            )}

            {!canPlay && recordings.length > 0 && (
                <p className="popup-field__hint recordings-offline-hint">
                    Odtwarzanie działa tylko po rozłączeniu z grą — nagranie wysłałoby swoje komendy na serwer.
                </p>
            )}

            {visible.length > 0 ? (
                <div className="dialog-list recordings-list">
                    {visible.map(r => (
                        <div key={r.name} className={`dialog-list__row recordings-item${playing === r.name ? ' is-playing' : ''}`}>
                            <MenuButton
                                label={<><Play size={11} fill="currentColor" strokeWidth={0} /><span className="recordings-play-label">Odtwórz</span></>}
                                onClick={() => play(r.name, 'timed')}
                                disabled={!!active || !canPlay}
                                title={!canPlay ? 'Rozłącz się z grą, żeby odtworzyć nagranie' : active ? 'Zakończ nagrywanie, żeby odtworzyć' : 'Sposób odtwarzania'}
                                menuWidth={260}
                                items={[
                                    {label: 'W czasie rzeczywistym', hint: 'tak, jak było; z paskiem odtwarzania', onSelect: () => play(r.name, 'timed')},
                                    {label: 'Krok po kroku', hint: 'zdarzenie po zdarzeniu, strzałkami', onSelect: () => play(r.name, 'step')},
                                    {label: 'Wszystko naraz', hint: 'wypisz całe nagranie od razu', onSelect: () => play(r.name, 'all')},
                                ]}
                            />
                            <div className="dialog-list__main">
                                <span className="recordings-item-name">{r.name}</span>
                                <span className="recordings-item-meta">{summaryMeta(r)}</span>
                            </div>
                            <Sparkline activity={r.activity} />
                            <Button variant="ghost" size="sm" className="popup-btn--icon" title="Pobierz" onClick={() => download(r.name)}>
                                <Download size={15} strokeWidth={1.75} />
                            </Button>
                            <DeleteButton onClick={() => remove(r.name)} />
                        </div>
                    ))}
                </div>
            ) : (
                <p className="recordings-empty">
                    {recordings.length === 0 ? 'Nie masz jeszcze zapisanych nagrań.' : 'Żadne nagranie nie pasuje do wyszukiwania.'}
                </p>
            )}

            <button type="button" className="recordings-drop" onClick={() => fileInput.current?.click()}>
                <Upload size={15} strokeWidth={1.75} />Upuść tu plik .json, żeby zaimportować nagrania
            </button>
        </div>
    );
}

export default Recordings;
