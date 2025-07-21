import { useEffect, useState, ChangeEvent } from 'react';
import { Button, Form, Modal, Table } from 'react-bootstrap';
import { TiDelete } from 'react-icons/ti';
import storage from './storage';

interface Shortcut {
    name: string;
    loc: number;
}

function Shortcuts() {
    const [shortcuts, setShortcuts] = useState<Shortcut[]>([]);
    const [name, setName] = useState('');
    const [loc, setLoc] = useState('');
    const [show, setShow] = useState(false);

    useEffect(() => {
        storage.getItem('shortcuts').then(res => {
            const list = Array.isArray(res.shortcuts) ? res.shortcuts : [];
            setShortcuts(list);
        });
    }, []);

    function save(list: Shortcut[]) {
        setShortcuts(list);
        storage.setItem('shortcuts', list);
    }

    function add() {
        const n = name.trim();
        const id = parseInt(loc);
        if (!n || isNaN(id)) return;
        const updated = shortcuts.filter(s => s.name !== n);
        updated.push({ name: n, loc: id });
        save(updated);
        setShow(false);
    }

    function remove(s: Shortcut) {
        const updated = shortcuts.filter(x => !(x.name === s.name && x.loc === s.loc));
        save(updated);
    }

    function leadTo(s: Shortcut) {
        if (window.client) {
            window.client.sendEvent('leadTo', s.loc);
        } else {
            chrome.tabs?.query({ active: true, currentWindow: true }, tabs => {
                if (tabs[0]?.id) {
                    chrome.tabs.sendMessage(tabs[0].id!, { type: 'LEAD_TO', loc: s.loc });
                }
            });
        }
    }

    function fillCurrent() {
        if (window.client) {
            const id = window.client.Map.currentRoom?.id;
            if (id) setLoc(String(id));
        } else {
            chrome.tabs?.query({ active: true, currentWindow: true }, tabs => {
                if (tabs[0]?.id) {
                    chrome.tabs.sendMessage(tabs[0].id!, { type: 'GET_LOCATION' }, res => {
                        if (res?.loc) setLoc(String(res.loc));
                    });
                }
            });
        }
    }

    return (
        <div className="m-2">
            <div className="mb-2">
                <Button size="sm" onClick={() => { setName(''); setLoc(''); setShow(true); }}>Dodaj skrót</Button>
            </div>
            <Table bordered size="sm" className="table-zebra">
                <tbody>
                {shortcuts.map(s => (
                    <tr key={s.name}>
                        <td>{s.name}</td>
                        <td>{s.loc}</td>
                        <td className="d-flex gap-2">
                            <Button size="sm" onClick={() => leadTo(s)}>Prowadź</Button>
                            <Button size="sm" variant="danger" onClick={() => remove(s)}><TiDelete /></Button>
                        </td>
                    </tr>
                ))}
                </tbody>
            </Table>
            <Modal show={show} onHide={() => setShow(false)}>
                <Modal.Header closeButton>
                    <Modal.Title>Dodaj skrót</Modal.Title>
                </Modal.Header>
                <Modal.Body>
                    <Form.Group className="d-flex flex-column gap-2">
                        <Form.Control
                            type="text"
                            size="sm"
                            placeholder="Nazwa"
                            value={name}
                            onChange={(e: ChangeEvent<HTMLInputElement>) => setName(e.target.value)}
                        />
                        <div className="d-flex gap-2">
                            <Form.Control
                                type="number"
                                size="sm"
                                placeholder="Lokacja"
                                value={loc}
                                onChange={(e: ChangeEvent<HTMLInputElement>) => setLoc(e.target.value)}
                            />
                            <Button size="sm" variant="secondary" onClick={fillCurrent}>Bieżąca</Button>
                        </div>
                    </Form.Group>
                </Modal.Body>
                <Modal.Footer>
                    <Button size="sm" variant="secondary" onClick={() => setShow(false)}>Anuluj</Button>
                    <Button size="sm" onClick={add}>Dodaj</Button>
                </Modal.Footer>
            </Modal>
        </div>
    );
}

export default Shortcuts;
