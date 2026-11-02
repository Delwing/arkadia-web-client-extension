/**
 * The /pilot window: switch hosting on, then scan the QR with the phone. The
 * QR carries the phone page's address and this PC's pairing code, so the phone
 * connects straight away and nobody without the code can.
 *
 * Its own React root on document.body, so nothing in the app's tree knows
 * about it.
 */

import { useEffect, useState } from "react";
import { Button, Check, Dialog, Notice, Select } from "@web-ui/primitives/index.ts";
import {
    disconnectPhone,
    getPairingCode,
    getRemoteHostId,
    getRemoteHostStatus,
    onRemoteHostStatus,
    rotatePairingCode,
    setRemoteHostEnabled,
    type RemoteHostStatus,
} from "./remoteHost";
import "./remoteControl.css";

interface PhoneAddress {
    /** Origins the phone can open, best first. */
    origins: string[];
    /** Why the phone may not reach it, if there is a reason to think so. */
    warning: string | null;
}

/**
 * Under the dev server a PC tab usually sits on localhost, which means nothing
 * to the phone: the server says which network addresses it has. A deployed
 * page is already at an address the phone can open.
 */
async function phoneAddress(): Promise<PhoneAddress> {
    const local = ['localhost', '127.0.0.1', '[::1]'].includes(location.hostname);
    if (!import.meta.env.DEV) return { origins: [location.origin], warning: null };
    try {
        const response = await fetch('/__remote/info', { cache: 'no-store' });
        const info = await response.json() as { exposed?: boolean; origins?: string[] };
        const lan = (info.origins ?? []).sort((a, b) => Number(b.includes('//192.168.')) - Number(a.includes('//192.168.')));
        const origins = local ? lan : [location.origin, ...lan.filter(origin => origin !== location.origin)];
        const warning = !info.exposed
            ? 'Serwer deweloperski słucha tylko na tym komputerze. Uruchom go jako „yarn dev --host”, żeby telefon mógł się połączyć.'
            : origins.length === 0 ? 'Nie widzę adresu tego komputera w sieci lokalnej.' : null;
        return { origins, warning };
    } catch {
        return { origins: local ? [] : [location.origin], warning: 'Nie udało się ustalić adresu tego komputera w sieci.' };
    }
}

function phoneUrl(origin: string, code: string): string {
    const base = import.meta.env.BASE_URL.endsWith('/') ? import.meta.env.BASE_URL : `${import.meta.env.BASE_URL}/`;
    return `${origin}${base}remote/#pair=${code}&host=${getRemoteHostId()}`;
}

export function RemoteControlModal({ onClose }: { onClose: () => void }) {
    const [status, setStatus] = useState<RemoteHostStatus>(getRemoteHostStatus);
    const [address, setAddress] = useState<PhoneAddress | null>(null);
    const [origin, setOrigin] = useState('');
    const [code, setCode] = useState(getPairingCode);
    const [qrSvg, setQrSvg] = useState<string | null>(null);

    useEffect(() => onRemoteHostStatus(setStatus), []);

    // The job is done once the phone is on: show it for a moment, then get out of the way.
    useEffect(() => {
        if (!status.phoneConnected) return;
        const timer = window.setTimeout(onClose, 1200);
        return () => window.clearTimeout(timer);
    }, [status.phoneConnected, onClose]);

    useEffect(() => {
        void phoneAddress().then(found => {
            setAddress(found);
            setOrigin(found.origins[0] ?? '');
        });
    }, []);

    const url = status.enabled && origin ? phoneUrl(origin, code) : null;

    // Loaded on demand, so the QR encoder never reaches the main bundle.
    useEffect(() => {
        if (!url) {
            setQrSvg(null);
            return;
        }
        let cancelled = false;
        void import("qrcode-generator").then(({ default: qrcode }) => {
            if (cancelled) return;
            const qr = qrcode(0, "M");
            qr.addData(url);
            qr.make();
            setQrSvg(qr.createSvgTag({ cellSize: 5, margin: 2, scalable: true }));
        });
        return () => {
            cancelled = true;
        };
    }, [url]);

    const stateText = !status.enabled
        ? null
        : status.phoneConnected
            ? 'Telefon jest połączony i steruje postacią.'
            : status.listening
                ? 'Czekam na telefon. Zeskanuj kod aparatem telefonu.'
                : 'Łączenie z serwerem pośredniczącym…';

    return (
        <Dialog
            title="Pilot na telefonie"
            onClose={onClose}
            size="sm"
            footer={(
                <>
                    {status.phoneConnected && <Button variant="danger" onClick={disconnectPhone}>Rozłącz telefon</Button>}
                    <Button onClick={onClose}>Zamknij</Button>
                </>
            )}
        >
            <p>Steruj tą sesją z telefonu: wyjście gry, mapa, obiekty i komendy. Połączenie zestawia publiczny serwer PeerJS, potem telefon łączy się z komputerem bezpośrednio.</p>
            <Check
                label="Pozwól sterować z telefonu"
                checked={status.enabled}
                onChange={event => setRemoteHostEnabled(event.currentTarget.checked)}
            />
            {address?.warning && status.enabled && <Notice variant="warning">{address.warning}</Notice>}
            {status.enabled && (
                <div className="remote-pilot">
                    {qrSvg && <div className="remote-pilot__qr" dangerouslySetInnerHTML={{ __html: qrSvg }}/>}
                    {address && address.origins.length > 1 && (
                        <Select value={origin} onChange={event => setOrigin(event.currentTarget.value)}>
                            {address.origins.map(option => <option key={option} value={option}>{option}</option>)}
                        </Select>
                    )}
                    {url && <code className="remote-pilot__url">{url}</code>}
                    {stateText && <p className="remote-pilot__state">{stateText}</p>}
                    <Button size="sm" variant="ghost" onClick={() => setCode(rotatePairingCode())}>
                        Nowy kod (odłącza sparowane telefony)
                    </Button>
                </div>
            )}
        </Dialog>
    );
}
