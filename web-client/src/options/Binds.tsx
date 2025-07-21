import { useEffect, useState } from "react";
import {Form, Button} from 'react-bootstrap';
import storage from "./storage";

interface Bind {
    key: string;
    ctrl?: boolean;
    alt?: boolean;
    shift?: boolean;
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
    directions: DirectionBinds;
}

const defaultBinds: BindSettings = {
    main: { key: 'BracketRight' },
    lamp: { key: 'Digit4', ctrl: true },
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
        storage.getItem('settings').then(res => {
            setBinds({
                ...defaultBinds,
                main: res.settings?.binds?.main || defaultBinds.main,
                lamp: res.settings?.binds?.lamp || defaultBinds.lamp,
                directions: {
                    ...defaultBinds.directions,
                    ...res.settings?.binds?.directions,
                },
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

    function save() {
            storage.getItem('settings').then(res => {
                const settings = { ...(res.settings || {}), binds: { main: binds.main, lamp: binds.lamp, directions: binds.directions } };
                storage.setItem('settings', settings).then(() => {
                    window.dispatchEvent(new Event('close-options'));
            });
        });
    }

    return (
        <div className="m-2 d-flex flex-column gap-3">
            <Form.Group className="d-flex align-items-center gap-2">
                <Form.Label className="w-32 mb-0">Domyślny</Form.Label>
                <Form.Control
                    type="text"
                    readOnly
                    size="sm"
                    className="w-40"
                    value={label(binds.main)}
                    onKeyDown={ev => handleCapture('main', ev)}
                />
            </Form.Group>
            <Form.Group className="d-flex align-items-center gap-2">
                <Form.Label className="w-32 mb-0">Napełnij lampę</Form.Label>
                <Form.Control
                    type="text"
                    readOnly
                    size="sm"
                    className="w-40"
                    value={label(binds.lamp)}
                    onKeyDown={ev => handleCapture('lamp', ev)}
                />
            </Form.Group>
            <Form.Group className="d-flex align-items-center gap-2">
                <Form.Label className="w-32 mb-0">N</Form.Label>
                <Form.Control
                    type="text"
                    readOnly
                    size="sm"
                    className="w-40"
                    value={label(binds.directions.n)}
                    onKeyDown={ev => handleCaptureDir('n', ev)}
                />
            </Form.Group>
            <Form.Group className="d-flex align-items-center gap-2">
                <Form.Label className="w-32 mb-0">S</Form.Label>
                <Form.Control
                    type="text"
                    readOnly
                    size="sm"
                    className="w-40"
                    value={label(binds.directions.s)}
                    onKeyDown={ev => handleCaptureDir('s', ev)}
                />
            </Form.Group>
            <Form.Group className="d-flex align-items-center gap-2">
                <Form.Label className="w-32 mb-0">W</Form.Label>
                <Form.Control
                    type="text"
                    readOnly
                    size="sm"
                    className="w-40"
                    value={label(binds.directions.w)}
                    onKeyDown={ev => handleCaptureDir('w', ev)}
                />
            </Form.Group>
            <Form.Group className="d-flex align-items-center gap-2">
                <Form.Label className="w-32 mb-0">E</Form.Label>
                <Form.Control
                    type="text"
                    readOnly
                    size="sm"
                    className="w-40"
                    value={label(binds.directions.e)}
                    onKeyDown={ev => handleCaptureDir('e', ev)}
                />
            </Form.Group>
            <Form.Group className="d-flex align-items-center gap-2">
                <Form.Label className="w-32 mb-0">NW</Form.Label>
                <Form.Control
                    type="text"
                    readOnly
                    size="sm"
                    className="w-40"
                    value={label(binds.directions.nw)}
                    onKeyDown={ev => handleCaptureDir('nw', ev)}
                />
            </Form.Group>
            <Form.Group className="d-flex align-items-center gap-2">
                <Form.Label className="w-32 mb-0">NE</Form.Label>
                <Form.Control
                    type="text"
                    readOnly
                    size="sm"
                    className="w-40"
                    value={label(binds.directions.ne)}
                    onKeyDown={ev => handleCaptureDir('ne', ev)}
                />
            </Form.Group>
            <Form.Group className="d-flex align-items-center gap-2">
                <Form.Label className="w-32 mb-0">SW</Form.Label>
                <Form.Control
                    type="text"
                    readOnly
                    size="sm"
                    className="w-40"
                    value={label(binds.directions.sw)}
                    onKeyDown={ev => handleCaptureDir('sw', ev)}
                />
            </Form.Group>
            <Form.Group className="d-flex align-items-center gap-2">
                <Form.Label className="w-32 mb-0">SE</Form.Label>
                <Form.Control
                    type="text"
                    readOnly
                    size="sm"
                    className="w-40"
                    value={label(binds.directions.se)}
                    onKeyDown={ev => handleCaptureDir('se', ev)}
                />
            </Form.Group>
            <Form.Group className="d-flex align-items-center gap-2">
                <Form.Label className="w-32 mb-0">U</Form.Label>
                <Form.Control
                    type="text"
                    readOnly
                    size="sm"
                    className="w-40"
                    value={label(binds.directions.u)}
                    onKeyDown={ev => handleCaptureDir('u', ev)}
                />
            </Form.Group>
            <Form.Group className="d-flex align-items-center gap-2">
                <Form.Label className="w-32 mb-0">D</Form.Label>
                <Form.Control
                    type="text"
                    readOnly
                    size="sm"
                    className="w-40"
                    value={label(binds.directions.d)}
                    onKeyDown={ev => handleCaptureDir('d', ev)}
                />
            </Form.Group>
            <Form.Group className="d-flex align-items-center gap-2">
                <Form.Label className="w-32 mb-0">Specjalne</Form.Label>
                <Form.Control
                    type="text"
                    readOnly
                    size="sm"
                    className="w-40"
                    value={label(binds.directions.special)}
                    onKeyDown={ev => handleCaptureDir('special', ev)}
                />
            </Form.Group>
            <Button className="mt-2 w-auto" onClick={save}>Zapisz</Button>
        </div>
    );
}

export default Binds;
