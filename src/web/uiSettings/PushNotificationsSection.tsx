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
import { Button } from "@design";
import type { UiSettings } from "../uiSettingsCore";
import { CheckboxField, SettingsHint } from "@web/settings/controls.tsx";

interface PushNotificationsSectionProps {
    draft: UiSettings;
    update: (patch: Partial<UiSettings>) => void;
}

/**
 * Push notifications — alerts on a device that is not in front of you.
 *
 * Lives beside the local-notification toggle rather than in its own screen:
 * from the player's side these are one feature ("tell me when something
 * happens"), differing only in which device gets told.
 */
function PushNotificationsSection({ draft, update }: PushNotificationsSectionProps) {
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
                text: "Powiadomienia są zablokowane dla tej strony. Odblokuj je w ustawieniach przeglądarki — sama strona nie może poprosić ponownie.",
            });
        } else if (result.error === "not_granted") {
            // Unlike the pairing path, this one runs from a click, so there was
            // a real prompt and it was dismissed.
            setStatus({
                kind: "error",
                text: "Nie przyznano zgody na powiadomienia.",
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
        // Ignores the "only when hidden" gate: the player is by definition
        // looking at this screen, so honouring it would make the test button
        // silently do nothing exactly when it is pressed.
        const result = await sendPush(
            { title: "Arkadia", body: "Testowe powiadomienie." },
            { bypassCooldown: true, ignoreVisibilityGate: true },
        );
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
            <SettingsHint>
                Ta przeglądarka nie obsługuje powiadomień push. Na iPhone dodaj najpierw stronę
                do ekranu głównego (Udostępnij → Do ekranu początkowego) i otwórz ją z tej ikony
                — Safari udostępnia powiadomienia tylko zainstalowanej aplikacji.
            </SettingsHint>
        );
    }

    return (
        <div className="settings-stack">
            <SettingsHint>
                Nic nie jest wysyłane samo z siebie. Żeby dostać alert na telefon, dodaj makro
                „Powiadomienie na telefon" do triggera lub zdarzenia (Triggery → zdarzenia takie
                jak Niskie zycie, Pelne zycie czy Atak wroga). Wysyłka działa niezależnie od
                tego, czy karta klienta jest aktywna, i jest ograniczona do jednego alertu na
                minutę — chyba że w makrze zaznaczysz „Wysylaj zawsze".
            </SettingsHint>

            <CheckboxField
                id="push-only-when-hidden"
                label="Wysyłaj tylko gdy karta klienta jest ukryta"
                checked={draft.pushOnlyWhenHidden}
                onChange={(v) => update({ pushOnlyWhenHidden: v })}
            />

            {status && (
                <p className={`settings-status settings-status--${status.kind}`}>
                    {status.text}
                </p>
            )}

            <div className="settings-button-row">
                {enabled ? (
                    <Button size="sm" id="push-disable" disabled={busy} onClick={handleDisable}>
                        Wyłącz na tym urządzeniu
                    </Button>
                ) : (
                    /* Soft, not solid: the card's one accent button is the
                       permission prompt above, which only shows when something
                       actually blocks notifications. Two solids on one view and
                       the accent stops meaning anything (DESIGN_SYSTEM.md §6). */
                    <Button size="sm" id="push-enable" disabled={busy} onClick={handleEnable}>
                        Odbieraj na tym urządzeniu
                    </Button>
                )}
                <Button size="sm" id="push-pair" disabled={busy} onClick={handlePair}>
                    Sparuj telefon (kod QR)
                </Button>
                {hasAccount && (
                    <Button size="sm" id="push-test" disabled={busy} onClick={handleTest}>
                        Wyślij test
                    </Button>
                )}
            </div>

            {pairing && (
                <div className="settings-pairing">
                    {/* The white plate is not decoration and is deliberately not
                        a token: a QR code needs a light quiet zone to scan, so
                        it must stay white in all eight themes. */}
                    {qrSvg && (
                        <div className="settings-pairing__qr" dangerouslySetInnerHTML={{ __html: qrSvg }} />
                    )}
                    <SettingsHint>
                        Zeskanuj telefonem. Kod <code>{pairing.code}</code> jest jednorazowy i
                        wygasa po {Math.round(pairing.expiresInSeconds / 60)} min — zdjęcie kodu
                        nie daje trwałego dostępu.
                    </SettingsHint>
                </div>
            )}

            {hasAccount && (
                <Button className="settings-action" size="sm" variant="link" id="push-forget" onClick={handleForget}>
                    Odłącz to urządzenie od konta powiadomień
                </Button>
            )}
        </div>
    );
}

export default PushNotificationsSection;
