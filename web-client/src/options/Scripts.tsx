import { useEffect, useState, ChangeEvent } from "react";
import { Button, Form } from "react-bootstrap";
import { TiDelete } from "react-icons/ti";
import storage from "./storage";

function Scripts() {
    const [scripts, setScripts] = useState<string[]>([]);
    const [input, setInput] = useState("");

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
        </div>
    );
}

export default Scripts;
