import { useEffect, useState, ChangeEvent, useRef } from "react";
import { Button, Form } from "react-bootstrap";
import { TiDelete } from "react-icons/ti";
import storage from "@client/src/storage";

function Scripts() {
    const [scripts, setScripts] = useState<string[]>([]);
    const [input, setInput] = useState("");
    const fileInput = useRef<HTMLInputElement>(null);

    useEffect(() => {
        storage.getItem("scripts").then(res => {
            if (res && Array.isArray(res.scripts)) {
                setScripts(res.scripts);
            }
        });
    }, []);

    function save(list: string[]) {
        setScripts(list);
        storage.setItem("scripts", list);
    }

    function add() {
        const url = input.trim();
        if (!url) return;
        if (!scripts.includes(url)) {
            const updated = [...scripts, url];
            save(updated);
        }
        setInput("");
    }

    function remove(url: string) {
        const updated = scripts.filter(u => u !== url);
        save(updated);
    }

    function exportScripts() {
        const json = JSON.stringify(scripts, null, 2);
        const blob = new Blob([json], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'arkadia-scripts.json';
        a.click();
        URL.revokeObjectURL(url);
    }

    function importScripts(ev: ChangeEvent<HTMLInputElement>) {
        const file = ev.target.files?.[0];
        if (!file) return;
        file.text().then(text => {
            try {
                const data = JSON.parse(text);
                if (Array.isArray(data) && data.every(d => typeof d === 'string')) {
                    save(data);
                } else {
                    alert('Błędny plik');
                }
            } catch {
                alert('Błędny plik');
            } finally {
                if (fileInput.current) fileInput.current.value = '';
            }
        });
    }

    return (
        <div className="m-2 d-flex flex-column gap-2">
            <Form.Group className="d-flex align-items-center gap-2">
                <Form.Control
                    type="text"
                    size="sm"
                    value={input}
                    onChange={(e: ChangeEvent<HTMLInputElement>) => setInput(e.target.value)}
                    onKeyDown={e => {
                        if (e.key === "Enter") {
                            e.preventDefault();
                            add();
                        }
                    }}
                    placeholder="URL skryptu"
                    style={{width: '100%', maxWidth: '16rem'}}
                />
                <Button size="sm" onClick={add}>Dodaj</Button>
            </Form.Group>
            <ul className="list-unstyled ms-3">
                {scripts.map(url => (
                    <li key={url} className="d-flex align-items-center gap-2">
                        <span>{url}</span>
                        <Button size="sm" variant="secondary" onClick={() => remove(url)}>
                            <TiDelete />
                        </Button>
                    </li>
                ))}
            </ul>
            <div className="d-flex gap-2">
                <Button size="sm" variant="secondary" onClick={exportScripts}>Eksport</Button>
                <Button size="sm" variant="secondary" onClick={() => fileInput.current?.click()}>Importuj</Button>
                <input
                    ref={fileInput}
                    type="file"
                    accept="application/json"
                    style={{ display: 'none' }}
                    onChange={importScripts}
                />
            </div>
        </div>
    );
}

export default Scripts;
