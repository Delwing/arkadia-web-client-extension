import { useEffect, useState } from "react";
import {Form, Button, Table} from 'react-bootstrap';
import storage from "@client/src/storage";

interface Bind {
    key: string;
    ctrl?: boolean;
    alt?: boolean;
    shift?: boolean;
}

interface CustomBind extends Bind {
    command: string;
}

interface DirectionBinds {
    n: Bind;
    s: Bind;
    w: Bind;
    e: Bind;
    nw: Bind;
    ne: Bind;
    sw: Bind;
    se: Bind;
    u: Bind;
    d: Bind;
    special: Bind;
}

interface BindSettings {
    main: Bind;
    lamp: Bind;
    attack: Bind;
    support: Bind;
    directions: DirectionBinds;
    custom: CustomBind[];
}

const defaultBinds: BindSettings = {
    main: { key: 'BracketRight' },
    lamp: { key: 'Digit4', ctrl: true },
    attack: { key: 'Digit1', ctrl: true },
    support: { key: 'KeyQ', ctrl: true },
    directions: {
        n: { key: 'Numpad8' },
        s: { key: 'Numpad2' },
        w: { key: 'Numpad4' },
        e: { key: 'Numpad6' },
        nw: { key: 'Numpad7' },
        ne: { key: 'Numpad9' },
        sw: { key: 'Numpad1' },
        se: { key: 'Numpad3' },
        u: { key: 'NumpadMultiply' },
        d: { key: 'NumpadSubtract' },
        special: { key: 'Numpad0' },
    },
    custom: [],
};

function label(bind: Bind) {
    let key = bind.key;
    if (key.startsWith('Digit')) key = key.substring(5);
    else if (key.startsWith('Key')) key = key.substring(3);
    else if (key === 'BracketRight') key = ']';
    else if (key === 'BracketLeft') key = '[';
    const parts: string[] = [];
    if (bind.ctrl) parts.push('CTRL');
    if (bind.alt) parts.push('ALT');
    if (bind.shift) parts.push('SHIFT');
    parts.push(key);
    return parts.join('+');
}

function Binds() {
    const [binds, setBinds] = useState<BindSettings>(defaultBinds);

    useEffect(() => {
        storage.getItem('binds').then(res => {
            setBinds({
                ...defaultBinds,
                main: res?.binds?.main || defaultBinds.main,
                lamp: res?.binds?.lamp || defaultBinds.lamp,
                attack: res?.binds?.attack || defaultBinds.attack,
                support: res?.binds?.support || defaultBinds.support,
                directions: {
                    ...defaultBinds.directions,
                    ...res?.binds?.directions,
                },
                custom: res?.binds?.custom || [],
            });
        });
    }, []);

    function handleCapture(name: keyof BindSettings, ev: React.KeyboardEvent) {
        ev.preventDefault();
        const { code, ctrlKey, altKey, shiftKey } = ev;
        setBinds(prev => ({ ...prev, [name]: { key: code, ctrl: ctrlKey, alt: altKey, shift: shiftKey } }));
    }

    function handleCaptureDir(dir: keyof DirectionBinds, ev: React.KeyboardEvent) {
        ev.preventDefault();
        const { code, ctrlKey, altKey, shiftKey } = ev;
        setBinds(prev => ({
            ...prev,
            directions: { ...prev.directions, [dir]: { key: code, ctrl: ctrlKey, alt: altKey, shift: shiftKey } },
        }));
    }

    function handleCaptureCustom(idx: number, ev: React.KeyboardEvent) {
        ev.preventDefault();
        const { code, ctrlKey, altKey, shiftKey } = ev;
        setBinds(prev => ({
            ...prev,
            custom: prev.custom.map((b, i) => i === idx ? { ...b, key: code, ctrl: ctrlKey, alt: altKey, shift: shiftKey } : b),
        }));
    }

    function handleCommandChange(idx: number, command: string) {
        setBinds(prev => ({
            ...prev,
            custom: prev.custom.map((b, i) => i === idx ? { ...b, command } : b),
        }));
    }

    function addCustomBind() {
        setBinds(prev => ({ ...prev, custom: [...prev.custom, { key: '', command: '' }] }));
    }

    function removeCustomBind(idx: number) {
        setBinds(prev => ({
            ...prev,
            custom: prev.custom.filter((_, i) => i !== idx),
        }));
    }

    function save() {
        storage.setItem('binds', binds).then(() => {
            window.dispatchEvent(new Event('close-options'));
        });
    }

    return (
        <div className="m-2 d-flex flex-column gap-2">
            <fieldset className="p-0 border-0 m-0">
                <Table bordered size="sm" className="table-zebra mb-2">
                    <tbody className="align-middle">
                        <tr>
                            <td className="w-32">Domyślny</td>
                            <td>
                                <Form.Control
                                    type="text"
                                    readOnly
                                    size="sm"
                                    value={label(binds.main)}
                                    onKeyDown={ev => handleCapture('main', ev)}
                                />
                            </td>
                        </tr>
                        <tr>
                            <td className="w-32">Napełnij lampę</td>
                            <td>
                                <Form.Control
                                    type="text"
                                    readOnly
                                    size="sm"
                                    value={label(binds.lamp)}
                                    onKeyDown={ev => handleCapture('lamp', ev)}
                                />
                            </td>
                        </tr>
                        <tr>
                            <td className="w-32">Atakuj</td>
                            <td>
                                <Form.Control
                                    type="text"
                                    readOnly
                                    size="sm"
                                    value={label(binds.attack)}
                                    onKeyDown={ev => handleCapture('attack', ev)}
                                />
                            </td>
                        </tr>
                        <tr>
                            <td className="w-32">Wesprzyj</td>
                            <td>
                                <Form.Control
                                    type="text"
                                    readOnly
                                    size="sm"
                                    value={label(binds.support)}
                                    onKeyDown={ev => handleCapture('support', ev)}
                                />
                            </td>
                        </tr>
                        <tr>
                            <td className="w-32">N</td>
                            <td>
                                <Form.Control
                                    type="text"
                                    readOnly
                                    size="sm"
                                    value={label(binds.directions.n)}
                                    onKeyDown={ev => handleCaptureDir('n', ev)}
                                />
                            </td>
                        </tr>
                        <tr>
                            <td className="w-32">S</td>
                            <td>
                                <Form.Control
                                    type="text"
                                    readOnly
                                    size="sm"
                                    value={label(binds.directions.s)}
                                    onKeyDown={ev => handleCaptureDir('s', ev)}
                                />
                            </td>
                        </tr>
                        <tr>
                            <td className="w-32">W</td>
                            <td>
                                <Form.Control
                                    type="text"
                                    readOnly
                                    size="sm"
                                    value={label(binds.directions.w)}
                                    onKeyDown={ev => handleCaptureDir('w', ev)}
                                />
                            </td>
                        </tr>
                        <tr>
                            <td className="w-32">E</td>
                            <td>
                                <Form.Control
                                    type="text"
                                    readOnly
                                    size="sm"
                                    value={label(binds.directions.e)}
                                    onKeyDown={ev => handleCaptureDir('e', ev)}
                                />
                            </td>
                        </tr>
                        <tr>
                            <td className="w-32">NW</td>
                            <td>
                                <Form.Control
                                    type="text"
                                    readOnly
                                    size="sm"
                                    value={label(binds.directions.nw)}
                                    onKeyDown={ev => handleCaptureDir('nw', ev)}
                                />
                            </td>
                        </tr>
                        <tr>
                            <td className="w-32">NE</td>
                            <td>
                                <Form.Control
                                    type="text"
                                    readOnly
                                    size="sm"
                                    value={label(binds.directions.ne)}
                                    onKeyDown={ev => handleCaptureDir('ne', ev)}
                                />
                            </td>
                        </tr>
                        <tr>
                            <td className="w-32">SW</td>
                            <td>
                                <Form.Control
                                    type="text"
                                    readOnly
                                    size="sm"
                                    value={label(binds.directions.sw)}
                                    onKeyDown={ev => handleCaptureDir('sw', ev)}
                                />
                            </td>
                        </tr>
                        <tr>
                            <td className="w-32">SE</td>
                            <td>
                                <Form.Control
                                    type="text"
                                    readOnly
                                    size="sm"
                                    value={label(binds.directions.se)}
                                    onKeyDown={ev => handleCaptureDir('se', ev)}
                                />
                            </td>
                        </tr>
                        <tr>
                            <td className="w-32">U</td>
                            <td>
                                <Form.Control
                                    type="text"
                                    readOnly
                                    size="sm"
                                    value={label(binds.directions.u)}
                                    onKeyDown={ev => handleCaptureDir('u', ev)}
                                />
                            </td>
                        </tr>
                        <tr>
                            <td className="w-32">D</td>
                            <td>
                                <Form.Control
                                    type="text"
                                    readOnly
                                    size="sm"
                                    value={label(binds.directions.d)}
                                    onKeyDown={ev => handleCaptureDir('d', ev)}
                                />
                            </td>
                        </tr>
                        <tr>
                            <td className="w-32">Specjalne</td>
                            <td>
                                <Form.Control
                                    type="text"
                                    readOnly
                                    size="sm"
                                    value={label(binds.directions.special)}
                                    onKeyDown={ev => handleCaptureDir('special', ev)}
                                />
                            </td>
                        </tr>
                        {binds.custom.map((b, idx) => (
                            <tr key={idx}>
                                <td>
                                    <Form.Control
                                        type="text"
                                        size="sm"
                                        value={b.command}
                                        onChange={ev => handleCommandChange(idx, ev.target.value)}
                                    />
                                </td>
                                <td>
                                    <div className="d-flex gap-2">
                                        <Form.Control
                                            type="text"
                                            readOnly
                                            size="sm"
                                            value={label(b)}
                                            onKeyDown={ev => handleCaptureCustom(idx, ev)}
                                        />
                                        <Button variant="danger" size="sm" onClick={() => removeCustomBind(idx)}>Usuń</Button>
                                    </div>
                                </td>
                            </tr>
                        ))}
                        <tr>
                            <td colSpan={2}>
                                <Button size="sm" onClick={addCustomBind}>Dodaj skrót</Button>
                            </td>
                        </tr>
                    </tbody>
                </Table>
                <Button className="mt-2 w-auto" onClick={save}>Zapisz</Button>
            </fieldset>
        </div>
    );
}

export default Binds;
