import { useCallback, useEffect, useState } from "react";
import { Pencil } from "lucide-react";
import { Button, Check, DeleteButton, Field, Input, LinkButton, Select } from "@web-ui/primitives/index.ts";
import type { HelperConnection } from "@modules/helper/HelperConnection";
import type { HelperState } from "@modules/helper/HelperConnection";
import type { BindAction, BindMode, HelperStatus } from "@modules/helper/helperProtocol";
import { getHelperBinds } from "@modules/helper/helperBindRegistry";
import { type StoredBind, loadBinds, saveBinds, toHelperBind } from "@modules/helper/helperBinds";
import { getDownloadUrl } from "@web/helperDownload.ts";

function actionLabel(b: StoredBind): string {
    if (b.action === 'command') return b.command ?? '';
    if (b.action === 'bind') {
        const found = getHelperBinds().find(bb => bb.id === b.targetBind);
        return found ? `→ ${found.label}` : `→ ${b.targetBind}`;
    }
    return '';
}

const modeLabels: Record<string, string> = {
    global: 'Globalny',
    global_focus: 'Globalny + fokus',
    browser_only: 'Tylko przeglądarka',
};

interface HelperSettingsProps {
    helperConnection: HelperConnection;
}

function HelperSettings({ helperConnection }: HelperSettingsProps) {
    const [state, setState] = useState<HelperState>(helperConnection.getState());
    const [status, setStatus] = useState<HelperStatus | null>(null);
    const [autoLaunch, setAutoLaunch] = useState(
        localStorage.getItem('arkadia.helperAutoLaunch') === 'true'
    );
    const [binds, setBinds] = useState<StoredBind[]>(loadBinds);

    // Bind form (used for both add and edit)
    const [editingId, setEditingId] = useState<string | null>(null);
    const [newKey, setNewKey] = useState('');
    const [newAction, setNewAction] = useState<BindAction>('command');
    const [newCommand, setNewCommand] = useState('');
    const [newTargetBind, setNewTargetBind] = useState(() => getHelperBinds()[0]?.id ?? '');
    const [newMode, setNewMode] = useState<BindMode>('global');
    const [capturing, setCapturing] = useState(false);

    const sendBindsToHelper = useCallback((bindsToSend: StoredBind[]) => {
        if (helperConnection.getState() === 'connected') {
            helperConnection.send({
                type: 'register_binds',
                binds: bindsToSend.map(toHelperBind),
            });
        }
    }, [helperConnection]);

    useEffect(() => {
        return helperConnection.onStateChange((newState) => {
            setState(newState);
            if (newState === 'connected') {
                helperConnection.probe().then(setStatus);
                // Binds are (re)registered centrally on connect by
                // setupHelperResync — no need to push them again here.
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

    useEffect(() => {
        return helperConnection.onKeyCaptured((msg) => {
            if (msg.key) {
                setNewKey(msg.key);
            }
            setCapturing(false);
        });
    }, [helperConnection]);

    const handleStartCapture = () => {
        if (state !== 'connected') return;
        setCapturing(true);
        helperConnection.send({ type: 'start_capture' });
    };

    const handleAutoLaunchChange = (checked: boolean) => {
        setAutoLaunch(checked);
        localStorage.setItem('arkadia.helperAutoLaunch', String(checked));
    };

    const handleSaveBind = () => {
        const key = newKey.trim().toLowerCase();
        if (!key) return;
        if (newAction === 'command' && !newCommand.trim()) return;

        const bind: StoredBind = {
            id: editingId ?? `helper_${Date.now()}`,
            key,
            mode: newMode,
            action: newAction,
            command: newAction === 'command' ? newCommand.trim() : undefined,
            targetBind: newAction === 'bind' ? newTargetBind : undefined,
            focusBrowser: newMode === 'global_focus',
        };

        let updated: StoredBind[];
        if (editingId) {
            updated = binds.map(b => b.id === editingId ? bind : b);
        } else {
            updated = [...binds, bind];
        }
        setBinds(updated);
        saveBinds(updated);
        sendBindsToHelper(updated);
        resetForm();
    };

    const handleEditBind = (b: StoredBind) => {
        setEditingId(b.id);
        setNewKey(b.key);
        setNewAction(b.action);
        setNewCommand(b.command ?? '');
        setNewTargetBind(b.targetBind ?? getHelperBinds()[0]?.id ?? '');
        setNewMode(b.mode);
    };

    const resetForm = () => {
        setEditingId(null);
        setNewKey('');
        setNewCommand('');
        setNewAction('command');
        setNewMode('global');
    };

    const handleRemoveBind = (id: string) => {
        const updated = binds.filter(b => b.id !== id);
        setBinds(updated);
        saveBinds(updated);

        if (helperConnection.getState() === 'connected') {
            helperConnection.send({ type: 'unregister_bind', id });
        }
    };

    const canAdd = newKey.trim() && (newAction === 'bind' || newCommand.trim());

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

            <h6 className="helper-settings__title">Globalne skróty klawiszowe</h6>

            {binds.length > 0 && (
                <table className="popup-table">
                    <thead>
                        <tr>
                            <th>Skrót</th>
                            <th>Akcja</th>
                            <th>Tryb</th>
                            <th></th>
                        </tr>
                    </thead>
                    <tbody>
                        {binds.map(b => (
                            <tr key={b.id} className={editingId === b.id ? 'is-editing' : undefined}>
                                <td><code>{b.key}</code></td>
                                <td><code>{actionLabel(b)}</code></td>
                                <td><small>{modeLabels[b.mode] ?? b.mode}</small></td>
                                <td>
                                    <div className="popup-inline">
                                        <Button size="sm" variant="ghost" className="popup-btn--icon" title="Edytuj" onClick={() => handleEditBind(b)}>
                                            <Pencil size={15} strokeWidth={1.75} />
                                        </Button>
                                        <DeleteButton onClick={() => handleRemoveBind(b.id)} />
                                    </div>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            )}

            <div className="helper-settings__form">
                <Field label={`Skrót ${state === 'connected' ? '(kliknij aby przechwycić)' : ''}`} className="helper-settings__key">
                    <Input
                        mono
                        placeholder={state === 'connected' ? 'Kliknij...' : 'np. ctrl+w'}
                        value={capturing ? 'Naciśnij klawisz... (Esc anuluje)' : newKey}
                        onClick={handleStartCapture}
                        onChange={(e) => setNewKey(e.target.value)}
                        readOnly={capturing || state === 'connected'}
                        className={capturing ? 'is-capturing' : undefined}
                    />
                </Field>
                <Field label="Typ" className="helper-settings__type">
                    <Select value={newAction} onChange={(e) => setNewAction(e.target.value as BindAction)}>
                        <option value="command">Komenda</option>
                        <option value="bind">Bind</option>
                    </Select>
                </Field>
                {newAction === 'command' ? (
                    <Field label="Komenda" className="helper-settings__command">
                        <Input
                            mono
                            placeholder="np. zabij ob_123"
                            value={newCommand}
                            onChange={(e) => setNewCommand(e.target.value)}
                        />
                    </Field>
                ) : (
                    <Field label="Bind" className="helper-settings__bind">
                        <Select value={newTargetBind} onChange={(e) => setNewTargetBind(e.target.value)}>
                            {getHelperBinds().map(b => (
                                <option key={b.id} value={b.id}>
                                    {b.category ? `${b.category}: ` : ''}{b.label}
                                </option>
                            ))}
                        </Select>
                    </Field>
                )}
                <Field label="Tryb" className="helper-settings__mode">
                    <Select value={newMode} onChange={(e) => setNewMode(e.target.value as BindMode)}>
                        <option value="global">Globalny</option>
                        <option value="browser_only">Tylko przeglądarka</option>
                    </Select>
                </Field>
                <Button variant="solid" onClick={handleSaveBind} disabled={!canAdd}>
                    {editingId ? 'Zapisz' : 'Dodaj'}
                </Button>
                {editingId && (
                    <Button onClick={resetForm}>
                        Anuluj
                    </Button>
                )}
            </div>

            <div className="popup-field__hint">
                <strong>Komenda</strong> — wyślij komendę do gry.{' '}
                <strong>Bind</strong> — wyzwól istniejący bind (atak, wesprzyj itp.).{' '}
                <strong>Globalny</strong> — działa niezależnie od aktywnego okna.{' '}
                <strong>Tylko przeglądarka</strong> — przechwytuje skróty zablokowane przez przeglądarkę (np. Ctrl+W).
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
