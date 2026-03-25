import {ChangeEvent, useEffect, useRef, useState} from 'react';
import {Button, Form} from 'react-bootstrap';
import {getRecordingNames, deleteRecording, getRecording, saveRecording, RecordedEvent} from './recordingStorage';
import eventBus from "@modules/core/eventBus";
import recordingManager from "../RecordingManager";

const AUTO_RECENT_WINDOW_MS = 3 * 60 * 1000;

function Recordings() {
    const [names, setNames] = useState<string[]>([]);
    const [recordingName, setRecordingName] = useState('');
    const [recording, setRecording] = useState(false);
    const [message, setMessage] = useState('');
    const [autoRecordingName, setAutoRecordingName] = useState<string | null>(null);
    const fileInput = useRef<HTMLInputElement>(null);

    const load = () => {
        getRecordingNames().then(setNames).catch(() => setNames([]));
    };

    useEffect(load, []);

    useEffect(() => {
        const startHandler = (name: string) => {
            setRecordingName(name);
            setRecording(true);
        };

        const stopHandler = (save?: boolean) => {
            setRecording(false);
            if (save) load();
        };

        const offStart = eventBus.on('recording.start', startHandler);
        const offStop = eventBus.on('recording.stop', stopHandler);
        return () => {
            offStart?.();
            offStop?.();
        };
    }, []);

    useEffect(() => {
        const updateAutoState = () => {
            setAutoRecordingName(recordingManager.getAutoRecordingName());
        };

        const autoStartHandler = (name: string | null | undefined) => {
            if (typeof name === 'string' && name) {
                setAutoRecordingName(name);
            } else {
                updateAutoState();
            }
        };

        const autoStopHandler = () => {
            updateAutoState();
        };

        updateAutoState();
        const offAutoStart = eventBus.on('recording.auto.start', autoStartHandler);
        const offAutoStop = eventBus.on('recording.auto.stop', autoStopHandler);

        return () => {
            offAutoStart?.();
            offAutoStop?.();
        };
    }, []);


    async function handlePlay(name: string) {
        await recordingManager.loadRecording(name);
        recordingManager.replayRecordedMessages();
    }

    async function handlePlayTimed(name: string) {
        window.dispatchEvent(new Event('close-options'));
        await recordingManager.loadRecording(name);
        recordingManager.replayRecordedMessagesTimed();
    }

    async function handleLoad(name: string) {
        window.dispatchEvent(new Event('close-options'));
        await recordingManager.loadRecording(name);
    }

    async function handleDelete(name: string) {
        await deleteRecording(name);
        load();
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

    function createAutoRecordingName() {
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        return `arkadia-recroding-${timestamp}`;
    }

    async function fetchRecordingEvents(name: string, options?: {recentMs?: number}) {
        if (!name) {
            return null;
        }
        const snapshot = await recordingManager.getRecordingSnapshot(name, options);
        if (snapshot) {
            return snapshot;
        }
        const events = await getRecording(name);
        if (events && options?.recentMs) {
            return filterRecentEvents(events, options.recentMs);
        }
        return events;
    }

    function filterRecentEvents(events: RecordedEvent[], durationMs: number) {
        const cutoff = Date.now() - durationMs;
        return events.filter(event => typeof event.timestamp === 'number' && event.timestamp >= cutoff);
    }

    async function downloadRecordings() {
        const all: Record<string, any[]> = {};
        const namesToExport = new Set(await getRecordingNames());
        const activeManual = recordingManager.getActiveRecordingName();
        if (activeManual) {
            namesToExport.add(activeManual);
        }
        const activeAuto = recordingManager.getAutoRecordingName();
        if (activeAuto) {
            namesToExport.add(activeAuto);
        }

        for (const name of namesToExport) {
            const events = await fetchRecordingEvents(name);
            if (events) {
                all[name] = events;
            }
        }
        const json = JSON.stringify(all, null, 2);
        createDownload(json, 'arkadia-recordings.json');
    }

    async function downloadRecording(
        name: string,
        options?: {recentMs?: number; overrideName?: string},
    ) {
        if (!name) return;
        const events = await fetchRecordingEvents(name, options);
        if (!events) return;

        const jsonName = options?.overrideName ?? name;
        const json = JSON.stringify({[jsonName]: events}, null, 2);
        const safeBaseName = (options?.overrideName ?? name).replace(/[^a-z0-9-_]+/gi, '_') || 'recording';
        const suffix = options?.recentMs && !options?.overrideName
            ? `-ostatnie-${Math.round(options.recentMs / 60000)}-minuty`
            : '';
        const filename = options?.overrideName
            ? `${safeBaseName}.json`
            : `arkadia-recording-${safeBaseName}${suffix}.json`;
        createDownload(json, filename);
    }

    async function downloadAutoRecordingCurrent() {
        if (!autoRecordingName) return;
        const autoName = createAutoRecordingName();
        await downloadRecording(autoRecordingName, {overrideName: autoName});
    }

    async function downloadAutoRecentRecording() {
        if (!autoRecordingName) return;
        const autoName = createAutoRecordingName();
        await downloadRecording(autoRecordingName, {
            recentMs: AUTO_RECENT_WINDOW_MS,
            overrideName: autoName,
        });
    }

    async function uploadRecordings(event: ChangeEvent<HTMLInputElement>) {
        const file = event.target.files?.[0];
        if (!file) return;

        try {
            const text = await file.text();
            const data = JSON.parse(text);
            if (typeof data !== 'object' || data === null) throw new Error('Invalid JSON structure');

            const entries = Object.entries<any[]>(data);
            for (const [name, events] of entries) {
                if (Array.isArray(events)) {
                    await saveRecording(name, events);
                }
            }
            setMessage('Nagrania wczytane');
            load();
        } catch (e) {
            console.error('Error uploading recordings:', e);
            setMessage('Błędny plik');
        } finally {
            if (fileInput.current) {
                fileInput.current.value = '';
            }
        }
    }

    // Function to trigger file input click
    const triggerFileInput = () => {
        fileInput.current?.click();
    };

    function start() {
        const name = recordingName.trim();
        if (!name) return;
        recordingManager.startRecording(name);
        setRecording(true);
    }

    async function stop(save: boolean) {
        await recordingManager.stopRecording(save);
        if (save) load();
        setRecording(false);
    }

    return (
        <div className="recordings-options">
            <Form.Group className="recordings-controls">
                <Form.Control
                    type="text"
                    size="sm"
                    placeholder="Nazwa nagrania"
                    value={recordingName}
                    onChange={e => setRecordingName(e.target.value)}
                    disabled={recording}
                    className="recording-name-input"
                />
                {recording ? (
                    <>
                        <Button size="sm" variant="secondary" className="recordings-action" onClick={() => stop(false)}>
                            Zatrzymaj
                        </Button>
                        <Button size="sm" className="recordings-action" onClick={() => stop(true)}>
                            Zatrzymaj i zapisz
                        </Button>
                        <Button
                            size="sm"
                            variant="outline-primary"
                            className="recordings-action"
                            onClick={() => downloadRecording(recordingName)}
                        >
                            Pobierz (bieżący)
                        </Button>
                    </>
                ) : (
                    <Button
                        size="sm"
                        className="recordings-action"
                        onClick={() => {
                            window.dispatchEvent(new Event('close-options'));
                            start();
                        }}
                    >
                        Rozpocznij
                    </Button>
                )}
            </Form.Group>
            {autoRecordingName && (
                <div className="recordings-auto-info text-muted small">
                    <span>Automatyczne nagrywanie aktywne:</span>
                    <strong className="text-body">{autoRecordingName}</strong>
                    <Button size="sm" className="recordings-action" onClick={downloadAutoRecordingCurrent}>
                        Pobierz aktualny stan
                    </Button>
                    <Button
                        size="sm"
                        variant="primary"
                        className="recordings-action"
                        onClick={downloadAutoRecentRecording}
                    >
                        Pobierz ostatnie 3 minuty
                    </Button>
                </div>
            )}
            <div className="recordings-list">
                {names.map(n => (
                    <div key={n} className="recordings-item">
                        <div className="recordings-item-name">{n}</div>
                        <div className="recordings-row-actions">
                            <Button size="sm" className="recordings-action" onClick={() => handlePlay(n)}>
                                Odtwórz
                            </Button>
                            <Button size="sm" className="recordings-action" onClick={() => handlePlayTimed(n)}>
                                Odtwórz w czasie
                            </Button>
                            <Button size="sm" variant="outline-primary" className="recordings-action" onClick={() => handleLoad(n)}>
                                Wczytaj
                            </Button>
                            <Button size="sm" className="recordings-action" onClick={() => downloadRecording(n)}>
                                Pobierz
                            </Button>
                            <Button size="sm" variant="danger" className="recordings-action" onClick={() => handleDelete(n)}>
                                Usuń
                            </Button>
                        </div>
                    </div>
                ))}
            </div>
            <div className="recordings-footer-actions">
                <Button size="sm" className="recordings-action" onClick={downloadRecordings}>Eksport</Button>
                <Button size="sm" className="recordings-action" onClick={triggerFileInput}>Importuj</Button>
                <input
                    ref={fileInput}
                    type="file"
                    accept="application/json"
                    style={{display: 'none'}}
                    onChange={uploadRecordings}
                />
            </div>
            {message && <div className="recordings-message">{message}</div>}
        </div>
    );
}

export default Recordings;