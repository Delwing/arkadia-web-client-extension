import { useCallback, useEffect, useState } from "react";
import { Button, Form, Table } from "react-bootstrap";
import type { HelperConnection } from "@modules/helper/HelperConnection";
import type { HelperState } from "@modules/helper/HelperConnection";
import type { BindAction, BindMode, HelperStatus } from "@modules/helper/helperProtocol";
import { getHelperBinds } from "@modules/helper/helperBindRegistry";
import { type StoredBind, loadBinds, saveBinds, toHelperBind } from "@modules/helper/helperBinds";

const HELPER_BASE_PATH = `${import.meta.env.BASE_URL}helper/arkadia-helper`;

type HelperOs = 'win' | 'mac' | 'linux';

function getDownloadUrl(): { url: string; label: string; os: HelperOs } | null {
    const ua = navigator.userAgent.toLowerCase();
    const isArm = /arm|aarch64/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    if (ua.includes('win')) {
        const arch = isArm ? 'arm64' : 'amd64';
        return { url: `${HELPER_BASE_PATH}-windows-${arch}.exe`, label: `Windows (${arch})`, os: 'win' };
    }
    if (ua.includes('mac')) {
        const arch = isArm ? 'arm64' : 'amd64';
        return { url: `${HELPER_BASE_PATH}-darwin-${arch}`, label: `macOS (${arch})`, os: 'mac' };
    }
    if (ua.includes('linux')) {
        const arch = isArm ? 'arm64' : 'amd64';
        return { url: `${HELPER_BASE_PATH}-linux-${arch}`, label: `Linux (${arch})`, os: 'linux' };
    }
    return null;
}

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

    const stateBadge = {
        disconnected: 'bg-secondary',
        connecting: 'bg-warning',
        connected: 'bg-success',
    }[state];

    return (
        <div className="p-3">
            <div className="d-flex align-items-center justify-content-between mb-3">
                <div>
                    <h6 className="mb-1">Arkadia Helper</h6>
                    <small className="text-muted">
                        Opcjonalna aplikacja umożliwiająca globalne skróty klawiszowe
                    </small>
                </div>
                <span className={`badge ${stateBadge}`}>{stateLabel}</span>
            </div>

            {status && state === 'connected' && (
                <div className="mb-3 small text-muted">
                    Wersja: {status.version} | Platforma: {status.platform}
                    {status.version !== 'dev' && status.version !== __COMMIT_SHA__.substring(0, status.version.length) && (
                        <span className="ms-2 badge bg-warning text-dark">Aktualizacja w toku...</span>
                    )}
                </div>
            )}

            <div className="d-flex gap-2 mb-3">
                {state === 'disconnected' && (
                    <>
                        <Button size="sm" variant="primary" onClick={() => helperConnection.launch()}>
                            Uruchom Helper
                        </Button>
                        {status && (
                            <Button size="sm" variant="outline-primary" onClick={() => helperConnection.connect()}>
                                Połącz
                            </Button>
                        )}
                    </>
                )}
                {state === 'connecting' && (
                    <Button size="sm" variant="secondary" disabled>
                        Łączenie...
                    </Button>
                )}
                {state === 'connected' && (
                    <Button size="sm" variant="outline-danger" onClick={() => helperConnection.disconnect()}>
                        Rozłącz
                    </Button>
                )}
            </div>

            <Form.Check
                type="switch"
                id="helper-auto-launch"
                label="Automatycznie łącz z Helper przy starcie"
                checked={autoLaunch}
                onChange={(e) => handleAutoLaunchChange(e.target.checked)}
                className="mb-4"
            />

            <hr />

            <h6 className="mb-3">Globalne skróty klawiszowe</h6>

            {binds.length > 0 && (
                <Table size="sm" className="mb-3">
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
                            <tr key={b.id} className={editingId === b.id ? 'table-active' : ''}>
                                <td><code>{b.key}</code></td>
                                <td><code>{actionLabel(b)}</code></td>
                                <td><small>{modeLabels[b.mode] ?? b.mode}</small></td>
                                <td className="d-flex gap-1">
                                    <Button
                                        size="sm"
                                        variant="outline-secondary"
                                        onClick={() => handleEditBind(b)}
                                    >
                                        ✎
                                    </Button>
                                    <Button
                                        size="sm"
                                        variant="outline-danger"
                                        onClick={() => handleRemoveBind(b.id)}
                                    >
                                        ✕
                                    </Button>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </Table>
            )}

            <div className="d-flex gap-2 align-items-end flex-wrap">
                <Form.Group style={{ minWidth: 150 }}>
                    <Form.Label className="small mb-1">Skrót {state === 'connected' ? '(kliknij aby przechwycić)' : ''}</Form.Label>
                    <Form.Control
                        size="sm"
                        placeholder={state === 'connected' ? 'Kliknij...' : 'np. ctrl+w'}
                        value={capturing ? 'Naciśnij klawisz... (Esc anuluje)' : newKey}
                        onClick={handleStartCapture}
                        onChange={(e) => setNewKey(e.target.value)}
                        readOnly={capturing || state === 'connected'}
                        style={capturing ? { borderColor: '#ffc107' } : undefined}
                    />
                </Form.Group>
                <Form.Group style={{ minWidth: 110 }}>
                    <Form.Label className="small mb-1">Typ</Form.Label>
                    <Form.Select
                        size="sm"
                        value={newAction}
                        onChange={(e) => setNewAction(e.target.value as BindAction)}
                    >
                        <option value="command">Komenda</option>
                        <option value="bind">Bind</option>
                    </Form.Select>
                </Form.Group>
                {newAction === 'command' ? (
                    <Form.Group style={{ minWidth: 150, flex: 1 }}>
                        <Form.Label className="small mb-1">Komenda</Form.Label>
                        <Form.Control
                            size="sm"
                            placeholder="np. zabij ob_123"
                            value={newCommand}
                            onChange={(e) => setNewCommand(e.target.value)}
                        />
                    </Form.Group>
                ) : (
                    <Form.Group style={{ minWidth: 140 }}>
                        <Form.Label className="small mb-1">Bind</Form.Label>
                        <Form.Select
                            size="sm"
                            value={newTargetBind}
                            onChange={(e) => setNewTargetBind(e.target.value)}
                        >
                            {getHelperBinds().map(b => (
                                <option key={b.id} value={b.id}>
                                    {b.category ? `${b.category}: ` : ''}{b.label}
                                </option>
                            ))}
                        </Form.Select>
                    </Form.Group>
                )}
                <Form.Group style={{ minWidth: 140 }}>
                    <Form.Label className="small mb-1">Tryb</Form.Label>
                    <Form.Select
                        size="sm"
                        value={newMode}
                        onChange={(e) => setNewMode(e.target.value as BindMode)}
                    >
                        <option value="global">Globalny</option>
                        <option value="browser_only">Tylko przeglądarka</option>
                    </Form.Select>
                </Form.Group>
                <Button size="sm" variant="primary" onClick={handleSaveBind} disabled={!canAdd}>
                    {editingId ? 'Zapisz' : 'Dodaj'}
                </Button>
                {editingId && (
                    <Button size="sm" variant="outline-secondary" onClick={resetForm}>
                        Anuluj
                    </Button>
                )}
            </div>

            <div className="mt-2 small text-muted">
                <strong>Komenda</strong> — wyślij komendę do gry.{' '}
                <strong>Bind</strong> — wyzwól istniejący bind (atak, wesprzyj itp.).{' '}
                <strong>Globalny</strong> — działa niezależnie od aktywnego okna.{' '}
                <strong>Tylko przeglądarka</strong> — przechwytuje skróty zablokowane przez przeglądarkę (np. Ctrl+W).
            </div>

            {state === 'disconnected' && !status && (() => {
                const dl = getDownloadUrl();
                const fileName = dl ? dl.url.substring(dl.url.lastIndexOf('/') + 1) : '';
                return (
                    <div className="mt-3 small text-muted">
                        Helper nie jest uruchomiony. Skróty zostaną zarejestrowane po połączeniu.
                        {dl && (
                            <div className="mt-2">
                                <a href={dl.url} download className="btn btn-outline-secondary btn-sm">
                                    Pobierz Helper — {dl.label}
                                </a>
                                {dl.os === 'mac' ? (
                                    <div className="mt-2 p-2 border rounded">
                                        <div>
                                            Pobrany plik to zwykły program (nie <code>.app</code>), więc macOS go
                                            zablokuje (komunikat: „Apple nie może sprawdzić, czy plik nie zawiera
                                            złośliwego oprogramowania"). Otwórz Terminal i wykonaj:
                                        </div>
                                        <pre
                                            className="mt-2 mb-2 p-2 bg-dark text-light rounded small"
                                            style={{ whiteSpace: 'pre-wrap' }}
                                        >
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
                                        <div className="mt-2">
                                            Aby działały <strong>globalne skróty</strong>, przyznaj aplikacji{' '}
                                            <code>ArkadiaHelper</code> uprawnienia w: <em>Ustawienia systemowe →
                                            Prywatność i bezpieczeństwo → Dostępność</em>, a następnie uruchom Helper
                                            ponownie.
                                        </div>
                                    </div>
                                ) : (
                                    <div className="mt-2 p-2 border rounded">
                                        Po pobraniu uruchom plik raz — zarejestruje on obsługę linków{' '}
                                        <code>arkadia://</code>, dzięki czemu klient będzie mógł automatycznie
                                        uruchamiać Helper.
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                );
            })()}
        </div>
    );
}

export default HelperSettings;
