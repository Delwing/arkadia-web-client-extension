import { ChangeEvent, useEffect, useRef, useState } from 'react';
import { Button, Table, Form } from 'react-bootstrap';
import { getRecordingNames, getRecording, saveRecording } from './recordingStorage';
import { useUiStore } from '../ui/store';

function Recordings() {
    const [names, setNames] = useState<string[]>([]);
    const [recordingName, setRecordingName] = useState('');
    const [recording, setRecording] = useState(false);
    const [message, setMessage] = useState('');
    const fileInput = useRef<HTMLInputElement>(null);
    const client = useUiStore(state => state.clientBindings.client);

    const load = () => {
        getRecordingNames().then(setNames).catch(() => setNames([]));
    };

    useEffect(load, []);

    useEffect(() => {
        if (!client) return;

        const startHandler = (name: string) => {
            setRecordingName(name);
            setRecording(true);
        };

        const stopHandler = (save?: boolean) => {
            setRecording(false);
            if (save) load();
        };

        client.on('recording.start', startHandler);
        client.on('recording.stop', stopHandler);
        return () => {
            client.off('recording.start', startHandler);
            client.off('recording.stop', stopHandler);
        };
    }, [client]);

    async function handlePlay(name: string) {
        if (client) {
            await client.loadRecording(name);
            client.replayRecordedMessages();
        } else {
            setMessage('Brak aktywnego klienta. Nie można odtworzyć nagrania.');
        }
    }

    async function handlePlayTimed(name: string) {
        if (client) {
            await client.loadRecording(name);
            client.replayRecordedMessagesTimed();
        } else {
            setMessage('Brak aktywnego klienta. Nie można odtworzyć nagrania z opóźnieniem.');
        }
    }

    async function handleDelete(name: string) {
        if (client) {
            await client.deleteRecording(name);
            load();
        }
    }

    function createDownload(json: string, filename: string) {
        const blob = new Blob([json], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        a.click();
        URL.revokeObjectURL(url);
    }

    async function downloadRecordings() {
        const all: Record<string, any[]> = {};
        for (const name of await getRecordingNames()) {
            const events = await getRecording(name);
            if (events) {
                all[name] = events;
            }
        }
        const json = JSON.stringify(all, null, 2);
        createDownload(json, 'arkadia-recordings.json');
    }

    async function downloadRecording(name: string) {
        const events = await getRecording(name);
        if (!events) return;

        const json = JSON.stringify({ [name]: events }, null, 2);
        const safeName = name.replace(/[^a-z0-9-_]+/gi, '_') || 'recording';
        createDownload(json, `arkadia-recording-${safeName}.json`);
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
        if (client) {
            client.startRecording(name);
        } else {
            setMessage('Brak aktywnego klienta. Nie można rozpocząć nagrywania.');
            return;
        }
        setRecording(true);
    }

    async function stop(save: boolean) {
        if (client) {
            await client.stopRecording(save);
            if (save) load();
        } else {
            setMessage('Brak aktywnego klienta. Nie można zatrzymać nagrywania.');
            return;
        }
        setRecording(false);
    }

    return (
        <div className="m-2 d-flex flex-column gap-3">
            <Form.Group className="d-flex gap-2 align-items-center">
                <Form.Control
                    type="text"
                    size="sm"
                    placeholder="Nazwa nagrania"
                    value={recordingName}
                    onChange={e => setRecordingName(e.target.value)}
                    disabled={recording}
                    style={{ maxWidth: '10rem' }}
                />
                {recording ? (
                    <>
                        <Button size="sm" variant="secondary" onClick={() => stop(false)}>Zatrzymaj</Button>
                        <Button size="sm" onClick={() => stop(true)}>Zatrzymaj i zapisz</Button>
                    </>
                ) : (
                    <Button size="sm" onClick={start}>Rozpocznij</Button>
                )}
            </Form.Group>
            <Table bordered size="sm" className="table-zebra">
                <tbody>
                {names.map(n => (
                    <tr key={n}>
                        <td>{n}</td>
                        <td className="d-flex gap-2">
                            <Button size="sm" onClick={() => handlePlay(n)}>Odtwórz</Button>
                            <Button size="sm" onClick={() => handlePlayTimed(n)}>Odtwórz w czasie</Button>
                            <Button size="sm" onClick={() => downloadRecording(n)}>Pobierz</Button>
                            <Button size="sm" variant="danger" onClick={() => handleDelete(n)}>Usuń</Button>
                        </td>
                    </tr>
                ))}
                </tbody>
            </Table>
            <div className="d-flex gap-2">
                <Button size="sm" onClick={downloadRecordings}>Eksport</Button>
                <Button size="sm" onClick={triggerFileInput}>Importuj</Button>
                <input
                    ref={fileInput}
                    type="file"
                    accept="application/json"
                    style={{ display: 'none' }}
                    onChange={uploadRecordings}
                />
            </div>
            {message && <div>{message}</div>}
        </div>
    );
}

export default Recordings;