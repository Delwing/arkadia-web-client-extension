import { useCallback, useEffect, useState } from 'react';
import { Alert, Button, Spinner } from 'react-bootstrap';
import {
    disablePush,
    enablePush,
    isPushEnabled,
    isPushSupported,
    sendPush,
    startPairing,
    type PairingOffer,
} from '@modules/push/pushClient';
import { clearPushCredentials, loadPushCredentials } from '@modules/push/pushCredentials';

/**
 * Push notifications: receive game alerts on a device that is not in front of
 * you. The client sends one only while its own tab is hidden — if you are
 * looking at the game you have already seen the message.
 */
function PushNotificationsTab() {
    const supported = isPushSupported();
    const [enabled, setEnabled] = useState(false);
    const [hasAccount, setHasAccount] = useState(() => loadPushCredentials() !== null);
    const [busy, setBusy] = useState(false);
    const [status, setStatus] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);
    const [pairing, setPairing] = useState<PairingOffer | null>(null);
    const [qrSvg, setQrSvg] = useState<string | null>(null);

    const refresh = useCallback(() => {
        setHasAccount(loadPushCredentials() !== null);
        void isPushEnabled().then(setEnabled);
    }, []);

    useEffect(() => {
        refresh();
    }, [refresh]);

    // Loaded on demand so the QR encoder never reaches the main bundle.
    useEffect(() => {
        if (!pairing) {
            setQrSvg(null);
            return;
        }
        let cancelled = false;
        void import('qrcode-generator').then(({ default: qrcode }) => {
            if (cancelled) return;
            const qr = qrcode(0, 'M');
            qr.addData(pairing.url);
            qr.make();
            setQrSvg(qr.createSvgTag({ cellSize: 5, margin: 2, scalable: true }));
        });
        return () => {
            cancelled = true;
        };
    }, [pairing]);

    const handleEnable = useCallback(async () => {
        setBusy(true);
        setStatus(null);
        const result = await enablePush();
        setBusy(false);
        if (result.ok) {
            setStatus({ kind: 'ok', text: 'Powiadomienia wlaczone na tym urzadzeniu.' });
        } else if (result.error === 'denied') {
            setStatus({
                kind: 'error',
                text: 'Przegladarka zablokowala powiadomienia. Odblokuj je w ustawieniach strony i sprobuj ponownie.',
            });
        } else {
            setStatus({ kind: 'error', text: `Nie udalo sie wlaczyc: ${result.error}` });
        }
        refresh();
    }, [refresh]);

    const handleDisable = useCallback(async () => {
        setBusy(true);
        await disablePush();
        setBusy(false);
        setStatus({ kind: 'ok', text: 'To urzadzenie nie bedzie juz dostawac powiadomien.' });
        refresh();
    }, [refresh]);

    const handleTest = useCallback(async () => {
        setBusy(true);
        const result = await sendPush({
            title: 'Arkadia',
            body: 'Testowe powiadomienie.',
        });
        setBusy(false);
        setStatus(
            result.ok
                ? {
                      kind: 'ok',
                      text: `Wyslano do ${result.delivered} urzadzen. Jesli patrzysz teraz na klienta, powiadomienie i tak dotrze na inne urzadzenia.`,
                  }
                : { kind: 'error', text: `Nie udalo sie wyslac: ${result.error}` },
        );
    }, []);

    const handlePair = useCallback(async () => {
        setBusy(true);
        setStatus(null);
        const offer = await startPairing();
        setBusy(false);
        if (!offer) {
            setStatus({ kind: 'error', text: 'Nie udalo sie utworzyc kodu parowania.' });
            return;
        }
        setPairing(offer);
        refresh();
    }, [refresh]);

    const handleForget = useCallback(() => {
        clearPushCredentials();
        setPairing(null);
        setStatus({ kind: 'ok', text: 'Konto powiadomien odlaczone od tego urzadzenia.' });
        refresh();
    }, [refresh]);

    if (!supported) {
        return (
            <Alert variant="secondary">
                <div className="fw-semibold mb-1">Ta przegladarka nie obsluguje powiadomien push</div>
                <div className="small">
                    Na iPhone dodaj najpierw strone do ekranu glownego (Udostepnij → Do ekranu
                    poczatkowego) i otworz ja z tej ikony — Safari udostepnia powiadomienia
                    tylko zainstalowanej aplikacji.
                </div>
            </Alert>
        );
    }

    return (
        <div className="d-flex flex-column gap-3">
            <div>
                <div className="fw-semibold">Powiadomienia na telefon</div>
                <div className="small text-secondary">
                    Alerty z gry (na przyklad spadajace punkty zycia) trafiaja na sparowane
                    urzadzenia tylko wtedy, gdy karta klienta jest ukryta — jesli patrzysz na
                    gre, nic nie zostanie wyslane. Kolejne alerty sa ograniczone do jednego na
                    minute.
                </div>
            </div>

            {status && (
                <Alert variant={status.kind === 'ok' ? 'success' : 'danger'} className="mb-0 py-2">
                    {status.text}
                </Alert>
            )}

            <div className="d-flex gap-2 flex-wrap align-items-center">
                {enabled ? (
                    <Button size="sm" variant="secondary" disabled={busy} onClick={handleDisable}>
                        Wylacz na tym urzadzeniu
                    </Button>
                ) : (
                    <Button size="sm" variant="primary" disabled={busy} onClick={handleEnable}>
                        Wlacz na tym urzadzeniu
                    </Button>
                )}
                <Button size="sm" variant="secondary" disabled={busy || !hasAccount} onClick={handleTest}>
                    Wyslij test
                </Button>
                {busy && <Spinner animation="border" size="sm" />}
            </div>

            <hr className="my-1" />

            <div>
                <div className="fw-semibold">Sparuj kolejne urzadzenie</div>
                <div className="small text-secondary mb-2">
                    Pokaz kod na tym ekranie i zeskanuj go telefonem. Kod jest jednorazowy i
                    wygasa po kilku minutach — zdjecie kodu nie daje trwalego dostepu.
                </div>
                <Button size="sm" variant="primary" disabled={busy} onClick={handlePair}>
                    Pokaz kod QR
                </Button>
            </div>

            {pairing && (
                <div className="d-flex flex-column align-items-center gap-2">
                    {qrSvg ? (
                        <div
                            style={{ width: 220, background: '#fff', padding: 12, borderRadius: 4 }}
                            dangerouslySetInnerHTML={{ __html: qrSvg }}
                        />
                    ) : (
                        <Spinner animation="border" size="sm" />
                    )}
                    <code className="small">{pairing.code}</code>
                    <div className="small text-secondary">
                        Wazny {Math.round(pairing.expiresInSeconds / 60)} min, jednorazowy.
                    </div>
                </div>
            )}

            {hasAccount && (
                <div className="mt-2">
                    <Button size="sm" variant="outline-secondary" onClick={handleForget}>
                        Odlacz to urzadzenie od konta powiadomien
                    </Button>
                </div>
            )}
        </div>
    );
}

export default PushNotificationsTab;
