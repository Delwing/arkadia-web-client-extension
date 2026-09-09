import { useCallback, useEffect, useState } from "react";
import {
    disablePush,
    enablePush,
    isPushEnabled,
    isPushSupported,
    sendPush,
    startPairing,
    type PairingOffer,
} from "@modules/push/pushClient";
import { clearPushCredentials, loadPushCredentials } from "@modules/push/pushCredentials";

/**
 * Push notifications — alerts on a device that is not in front of you.
 *
 * Lives beside the local-notification toggle rather than in its own screen:
 * from the player's side these are one feature ("tell me when something
 * happens"), differing only in which device gets told.
 */
function PushNotificationsSection() {
    const supported = isPushSupported();
    const [enabled, setEnabled] = useState(false);
    const [hasAccount, setHasAccount] = useState(() => loadPushCredentials() !== null);
    const [busy, setBusy] = useState(false);
    const [status, setStatus] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
    const [pairing, setPairing] = useState<PairingOffer | null>(null);
    const [qrSvg, setQrSvg] = useState<string | null>(null);

    const refresh = useCallback(() => {
        setHasAccount(loadPushCredentials() !== null);
        void isPushEnabled().then(setEnabled);
    }, []);

    useEffect(() => {
        refresh();
    }, [refresh]);

    // Loaded on demand, so the QR encoder never reaches the main bundle.
    useEffect(() => {
        if (!pairing) {
            setQrSvg(null);
            return;
        }
        let cancelled = false;
        void import("qrcode-generator").then(({ default: qrcode }) => {
            if (cancelled) return;
            const qr = qrcode(0, "M");
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
            setStatus({ kind: "ok", text: "Powiadomienia włączone na tym urządzeniu." });
        } else if (result.error === "denied") {
            setStatus({
                kind: "error",
                text: "Przeglądarka zablokowała powiadomienia. Odblokuj je w ustawieniach strony i spróbuj ponownie.",
            });
        } else {
            setStatus({ kind: "error", text: `Nie udało się włączyć: ${result.error}` });
        }
        refresh();
    }, [refresh]);

    const handleDisable = useCallback(async () => {
        setBusy(true);
        await disablePush();
        setBusy(false);
        setStatus({ kind: "ok", text: "To urządzenie nie będzie już dostawać powiadomień." });
        refresh();
    }, [refresh]);

    const handleTest = useCallback(async () => {
        setBusy(true);
        const result = await sendPush({ title: "Arkadia", body: "Testowe powiadomienie." });
        setBusy(false);
        setStatus(
            result.ok
                ? { kind: "ok", text: `Wysłano do ${result.delivered} urządzeń.` }
                : { kind: "error", text: `Nie udało się wysłać: ${result.error}` },
        );
    }, []);

    const handlePair = useCallback(async () => {
        setBusy(true);
        setStatus(null);
        const offer = await startPairing();
        setBusy(false);
        if (!offer) {
            setStatus({ kind: "error", text: "Nie udało się utworzyć kodu parowania." });
            return;
        }
        setPairing(offer);
        refresh();
    }, [refresh]);

    const handleForget = useCallback(() => {
        clearPushCredentials();
        setPairing(null);
        setStatus({ kind: "ok", text: "Konto powiadomień odłączone od tego urządzenia." });
        refresh();
    }, [refresh]);

    if (!supported) {
        return (
            <div className="small text-secondary">
                Ta przeglądarka nie obsługuje powiadomień push. Na iPhone dodaj najpierw stronę
                do ekranu głównego (Udostępnij → Do ekranu początkowego) i otwórz ją z tej ikony
                — Safari udostępnia powiadomienia tylko zainstalowanej aplikacji.
            </div>
        );
    }

    return (
        <div className="d-flex flex-column gap-2">
            <div className="small text-secondary">
                Alerty z gry trafiają na sparowane urządzenia tylko wtedy, gdy karta klienta
                jest ukryta — jeśli patrzysz na grę, nic nie zostanie wysłane. Kolejne alerty
                są ograniczone do jednego na minutę.
            </div>

            {status && (
                <div className={`small ${status.kind === "ok" ? "text-success" : "text-danger"}`}>
                    {status.text}
                </div>
            )}

            <div className="d-flex gap-2 flex-wrap align-self-start">
                {enabled ? (
                    <button
                        type="button"
                        className="btn btn-secondary btn-sm"
                        id="push-disable"
                        disabled={busy}
                        onClick={handleDisable}
                    >
                        Wyłącz na tym urządzeniu
                    </button>
                ) : (
                    <button
                        type="button"
                        className="btn btn-primary btn-sm"
                        id="push-enable"
                        disabled={busy}
                        onClick={handleEnable}
                    >
                        Odbieraj na tym urządzeniu
                    </button>
                )}
                <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    id="push-pair"
                    disabled={busy}
                    onClick={handlePair}
                >
                    Sparuj telefon (kod QR)
                </button>
                {hasAccount && (
                    <button
                        type="button"
                        className="btn btn-secondary btn-sm"
                        id="push-test"
                        disabled={busy}
                        onClick={handleTest}
                    >
                        Wyślij test
                    </button>
                )}
            </div>

            {pairing && (
                <div className="d-flex flex-column align-items-start gap-1 mt-1">
                    {qrSvg && (
                        <div
                            style={{ width: 200, background: "#fff", padding: 10, borderRadius: 4 }}
                            dangerouslySetInnerHTML={{ __html: qrSvg }}
                        />
                    )}
                    <div className="small text-secondary">
                        Zeskanuj telefonem. Kod <code>{pairing.code}</code> jest jednorazowy i
                        wygasa po {Math.round(pairing.expiresInSeconds / 60)} min — zdjęcie kodu
                        nie daje trwałego dostępu.
                    </div>
                </div>
            )}

            {hasAccount && (
                <button
                    type="button"
                    className="btn btn-link btn-sm align-self-start p-0"
                    id="push-forget"
                    onClick={handleForget}
                >
                    Odłącz to urządzenie od konta powiadomień
                </button>
            )}
        </div>
    );
}

export default PushNotificationsSection;
