import { useEffect, useState } from "react";
import { Button, Check, LinkButton } from "@web-ui/primitives/index.ts";
import type { HelperConnection } from "@modules/helper/HelperConnection";
import type { HelperState } from "@modules/helper/HelperConnection";
import type { HelperStatus } from "@modules/helper/helperProtocol";
import { getDownloadUrl } from "@web/helperDownload.ts";

interface HelperSettingsProps {
    helperConnection: HelperConnection;
}

/**
 * Installing and running the helper. The shortcuts it carries are edited in the
 * Klawisze window (src/web/keys/Keys.tsx), next to every other key — a helper
 * hotkey is only a bind the helper hears instead of the page.
 */
function HelperSettings({ helperConnection }: HelperSettingsProps) {
    const [state, setState] = useState<HelperState>(helperConnection.getState());
    const [status, setStatus] = useState<HelperStatus | null>(null);
    const [autoLaunch, setAutoLaunch] = useState(
        localStorage.getItem('arkadia.helperAutoLaunch') === 'true'
    );

    useEffect(() => {
        return helperConnection.onStateChange((newState) => {
            setState(newState);
            if (newState === 'connected') {
                helperConnection.probe().then(setStatus);
            } else {
                setStatus(null);
            }
        });
    }, [helperConnection]);

    useEffect(() => {
        if (localStorage.getItem('arkadia.helperAutoLaunch') === 'true') {
            helperConnection.probe().then(setStatus);
        }
    }, [helperConnection]);

    const handleAutoLaunchChange = (checked: boolean) => {
        setAutoLaunch(checked);
        localStorage.setItem('arkadia.helperAutoLaunch', String(checked));
    };

    const stateLabel = {
        disconnected: 'Rozłączony',
        connecting: 'Łączenie...',
        connected: 'Połączony',
    }[state];

    return (
        <div className="popup-stack helper-settings">
            <div className="helper-settings__head">
                <div>
                    <h6 className="helper-settings__title">Arkadia Helper</h6>
                    <div className="popup-field__hint">
                        Opcjonalna aplikacja umożliwiająca globalne skróty klawiszowe
                    </div>
                </div>
                <span className={`popup-badge helper-settings__state helper-settings__state--${state}`}>{stateLabel}</span>
            </div>

            {status && state === 'connected' && (
                <div className="popup-field__hint">
                    Wersja: {status.version} | Platforma: {status.platform}
                    {status.version !== 'dev' && status.version !== __COMMIT_SHA__.substring(0, status.version.length) && (
                        <span className="popup-badge helper-settings__state--connecting helper-settings__updating">Aktualizacja w toku...</span>
                    )}
                </div>
            )}

            <div className="popup-row">
                {state === 'disconnected' && (
                    <>
                        <Button size="sm" variant="solid" onClick={() => helperConnection.launch()}>
                            Uruchom Helper
                        </Button>
                        {status && (
                            <Button size="sm" onClick={() => helperConnection.connect()}>
                                Połącz
                            </Button>
                        )}
                    </>
                )}
                {state === 'connecting' && (
                    <Button size="sm" disabled>
                        Łączenie...
                    </Button>
                )}
                {state === 'connected' && (
                    <Button size="sm" variant="danger" onClick={() => helperConnection.disconnect()}>
                        Rozłącz
                    </Button>
                )}
            </div>

            <Check
                id="helper-auto-launch"
                label="Automatycznie łącz z Helper przy starcie"
                checked={autoLaunch}
                onChange={(e) => handleAutoLaunchChange(e.target.checked)}
            />

            <hr className="helper-settings__rule" />

            <h6 className="helper-settings__title">Skróty klawiszowe</h6>
            <div className="popup-field__hint">
                Skróty, które obsługuje Helper, ustawiasz w oknie <strong>Klawisze</strong>, razem z resztą
                bindów: klawisze zajęte przez przeglądarkę (np. <code>Ctrl+W</code>), skróty działające także
                w innych oknach i drugie, globalne klawisze wbudowanych funkcji.
            </div>
            <div className="popup-row">
                <Button size="sm" onClick={() => window.dispatchEvent(new Event('show-binds'))}>
                    Otwórz Klawisze
                </Button>
            </div>

            {state === 'disconnected' && !status && (() => {
                const dl = getDownloadUrl();
                const fileName = dl ? dl.url.substring(dl.url.lastIndexOf('/') + 1) : '';
                return (
                    <div className="popup-stack popup-field__hint">
                        <div>Helper nie jest uruchomiony. Skróty zostaną zarejestrowane po połączeniu.</div>
                        {dl && (
                            <>
                                <div>
                                    <LinkButton size="sm" href={dl.url} download target={undefined}>
                                        Pobierz Helper — {dl.label}
                                    </LinkButton>
                                </div>
                                {dl.os === 'mac' ? (
                                    <div className="helper-settings__box">
                                        <div>
                                            Pobrany plik to zwykły program (nie <code>.app</code>), więc macOS go
                                            zablokuje (komunikat: „Apple nie może sprawdzić, czy plik nie zawiera
                                            złośliwego oprogramowania"). Otwórz Terminal i wykonaj:
                                        </div>
                                        <pre className="helper-settings__pre">
{`cd ~/Downloads
chmod +x ${fileName}
xattr -d com.apple.quarantine ${fileName}
./${fileName}`}
                                        </pre>
                                        <div>
                                            Program zarejestruje obsługę linków <code>arkadia://</code> i zakończy
                                            działanie — to normalne. Następnie kliknij <strong>„Uruchom Helper"</strong>{' '}
                                            powyżej, aby go wystartować.
                                        </div>
                                        <div>
                                            Aby działały <strong>globalne skróty</strong>, przyznaj aplikacji{' '}
                                            <code>ArkadiaHelper</code> uprawnienia w: <em>Ustawienia systemowe →
                                            Prywatność i bezpieczeństwo → Dostępność</em>, a następnie uruchom Helper
                                            ponownie.
                                        </div>
                                    </div>
                                ) : (
                                    <div className="helper-settings__box">
                                        Po pobraniu uruchom plik raz — zarejestruje on obsługę linków{' '}
                                        <code>arkadia://</code>, dzięki czemu klient będzie mógł automatycznie
                                        uruchamiać Helper.
                                    </div>
                                )}
                            </>
                        )}
                    </div>
                );
            })()}
        </div>
    );
}

export default HelperSettings;
