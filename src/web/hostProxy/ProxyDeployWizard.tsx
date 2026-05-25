import {useState} from 'react';
import {Alert, Button, Form, Spinner} from 'react-bootstrap';
import WORKER_CODE from './proxyWorker.js?raw';
import {
    buildWorkerWssUrl,
    CloudflareApiError,
    deployWorker,
    enableWorkersDevRoute,
    getWorkersSubdomain,
    listAccounts,
    type CloudflareAccount,
} from './cloudflareDeploy';

interface Props {
    /** Default proxy URL used to tunnel Cloudflare API calls (CORS relay). */
    relayBase: string;
    /** Called with the deployed wss:// URL once the worker is live. */
    onDeployed: (wssUrl: string) => void;
    /** Return to the manual/info view. */
    onBack: () => void;
}

// Pre-filled token page: name + the two permissions the wizard needs.
// account_settings:read lets us auto-fill the Account ID via GET /accounts.
const TOKEN_PERMISSIONS = [
    {key: 'workers_scripts', type: 'edit'},
    {key: 'account_settings', type: 'read'},
];
const TOKEN_PAGE_URL =
    'https://dash.cloudflare.com/profile/api-tokens'
    + '?permissionGroupKeys=' + encodeURIComponent(JSON.stringify(TOKEN_PERMISSIONS))
    + '&accountId=*&zoneId=all'
    + '&name=' + encodeURIComponent('Arkadia Proxy Deploy');

const DEFAULT_WORKER_NAME = 'arkadia-proxy';
const WORKER_NAME_PATTERN = /^[a-z0-9][a-z0-9_-]{0,62}$/;
const ACCOUNT_ID_PATTERN = /^[a-f0-9]{32}$/;

type Stage = 'input' | 'deploying' | 'need-subdomain' | 'success';

const STEPS = ['Przesyłanie skryptu Workera', 'Włączanie trasy workers.dev', 'Wyszukiwanie subdomeny'] as const;
type StepState = 'pending' | 'active' | 'done';

function humanizeError(err: unknown, fallback: string): string {
    if (err instanceof CloudflareApiError) {
        if (err.status === 401 || err.status === 403) {
            return `${err.message} (sprawdź, czy token ma uprawnienie "Workers Scripts: Edit" dla tego konta).`;
        }
        if (err.status === 404) {
            return `${err.message} (sprawdź, czy identyfikator konta jest poprawny).`;
        }
        return err.message;
    }
    if (err instanceof TypeError && /fetch/i.test(err.message)) {
        return 'Żądanie do interfejsu API Cloudflare nie powiodło się. Sprawdź połączenie lub rozszerzenia przeglądarki blokujące CORS.';
    }
    if (err instanceof Error) return err.message || fallback;
    return fallback;
}

export function ProxyDeployWizard({relayBase, onDeployed, onBack}: Props) {
    const [stage, setStage] = useState<Stage>('input');
    const [token, setToken] = useState('');
    const [workerName, setWorkerName] = useState(DEFAULT_WORKER_NAME);
    const [accountId, setAccountId] = useState('');
    const [accounts, setAccounts] = useState<CloudflareAccount[]>([]);
    const [autofillState, setAutofillState] = useState<'idle' | 'loading' | 'failed'>('idle');
    const [error, setError] = useState<string | null>(null);
    const [progress, setProgress] = useState<StepState[]>(STEPS.map(() => 'pending' as StepState));
    const [deployedUrl, setDeployedUrl] = useState('');

    const nameValid = WORKER_NAME_PATTERN.test(workerName);
    const tokenValid = token.trim().length >= 20;
    const accountIdValid = ACCOUNT_ID_PATTERN.test(accountId.trim().toLowerCase());
    const canDeploy = tokenValid && nameValid && accountIdValid;

    const setStepState = (idx: number, state: StepState) =>
        setProgress(prev => prev.map((s, i) => (i === idx ? state : s)));

    const tryAutofillAccount = async () => {
        if (autofillState === 'loading') return;
        setAutofillState('loading');
        try {
            const list = await listAccounts(token.trim(), relayBase);
            setAccounts(list);
            if (list.length === 1) {
                setAccountId(list[0].id);
                setAutofillState('idle');
            } else {
                setAutofillState(list.length === 0 ? 'failed' : 'idle');
            }
        } catch {
            setAutofillState('failed');
        }
    };

    const runDeploy = async (fromStep: number) => {
        setError(null);
        setStage('deploying');
        const trimmedToken = token.trim();
        const trimmedAccountId = accountId.trim().toLowerCase();

        try {
            if (fromStep <= 0) {
                setStepState(0, 'active');
                await deployWorker(trimmedToken, trimmedAccountId, workerName, WORKER_CODE, relayBase);
                setStepState(0, 'done');
            }
            if (fromStep <= 1) {
                setStepState(1, 'active');
                await enableWorkersDevRoute(trimmedToken, trimmedAccountId, workerName, relayBase);
                setStepState(1, 'done');
            }
            setStepState(2, 'active');
            const subdomain = await getWorkersSubdomain(trimmedToken, trimmedAccountId, relayBase);
            if (!subdomain) {
                setStepState(2, 'pending');
                setStage('need-subdomain');
                return;
            }
            setStepState(2, 'done');
            const wssUrl = buildWorkerWssUrl(workerName, subdomain);
            setDeployedUrl(wssUrl);
            setStage('success');
        } catch (e) {
            setStage(fromStep > 1 ? 'need-subdomain' : 'input');
            setError(humanizeError(e, 'Wdrożenie nie powiodło się'));
        }
    };

    if (stage === 'deploying') {
        return (
            <div>
                <p>Wdrażanie Twojego proxy…</p>
                <ul className="list-unstyled">
                    {STEPS.map((label, i) => (
                        <li key={i} className="d-flex align-items-center gap-2 mb-2">
                            <span style={{width: '1.2em', textAlign: 'center'}}>
                                {progress[i] === 'done' ? '✓' : progress[i] === 'active'
                                    ? <Spinner animation="border" size="sm"/> : '○'}
                            </span>
                            <span>{label}</span>
                        </li>
                    ))}
                </ul>
            </div>
        );
    }

    if (stage === 'need-subdomain') {
        return (
            <div>
                <p>
                    <strong>Skrypt Workera został przesłany — jeszcze jeden krok.</strong> Twoje konto
                    nie ma jeszcze subdomeny <code>workers.dev</code>. Cloudflare wymaga wybrania jednej
                    subdomeny na konto.
                </p>
                <ol>
                    <li>Otwórz <a href="https://dash.cloudflare.com/?to=/:account/workers-and-pages" target="_blank" rel="noreferrer">Workers &amp; Pages</a> w pulpicie nawigacyjnym Cloudflare</li>
                    <li>Cloudflare poprosi Cię o wybranie subdomeny (np. <code>twojanazwa.workers.dev</code>)</li>
                    <li>Wróć tutaj i kliknij <strong>Spróbuj ponownie</strong></li>
                </ol>
                {error && <Alert variant="danger">{error}</Alert>}
                <div className="d-flex justify-content-end gap-2">
                    <Button variant="secondary" onClick={onBack}>Wstecz</Button>
                    <Button variant="primary" onClick={() => void runDeploy(2)}>Spróbuj ponownie</Button>
                </div>
            </div>
        );
    }

    if (stage === 'success') {
        return (
            <div>
                <p><strong>Worker został wdrożony.</strong> Twój proxy jest dostępny pod adresem:</p>
                <pre className="p-2 bg-dark text-light rounded"><code>{deployedUrl}</code></pre>
                <p>
                    Kliknij poniżej, aby użyć go do nowych połączeń. Pierwsze żądanie może potrwać
                    kilka sekund, aż Cloudflare rozpropaguje trasę.
                </p>
                <div className="d-flex justify-content-end gap-2">
                    <Button variant="secondary" onClick={onBack}>Wstecz</Button>
                    <Button variant="primary" onClick={() => onDeployed(deployedUrl)}>Użyj tego proxy</Button>
                </div>
            </div>
        );
    }

    // stage === 'input'
    return (
        <div>
            <p>
                Wklej token API Cloudflare i swój identyfikator konta — wdrożymy Workera proxy w Twoim
                koncie. Token jest używany jednorazowo i nigdy nie jest przechowywany.
            </p>
            <Alert variant="warning" className="py-2">
                <strong>Uwaga:</strong> Interfejs API Cloudflare blokuje bezpośrednie żądania
                przeglądarki, więc żądania wdrożenia (w tym Twój token) przechodzą przez domyślny proxy.
                Jeśli tego nie chcesz, użyj ręcznej konfiguracji.
            </Alert>
            <ol>
                <li>Otwórz <a href={TOKEN_PAGE_URL} target="_blank" rel="noreferrer">wypełnioną stronę z tokenem</a> (nazwa + Workers Scripts: Edit), a następnie kliknij <strong>Kontynuuj do podsumowania → Utwórz token</strong></li>
                <li>Skopiuj swój <strong>identyfikator konta</strong> ze strony <a href="https://dash.cloudflare.com/?to=/:account/workers-and-pages" target="_blank" rel="noreferrer">Workers &amp; Pages</a> (prawy panel)</li>
                <li>Wklej oba poniżej i kliknij <strong>Wdróż</strong></li>
            </ol>

            <Form.Group className="mb-3">
                <Form.Label>Token API</Form.Label>
                <Form.Control
                    type="password"
                    value={token}
                    onChange={e => {
                        setToken(e.target.value);
                        if (accounts.length || autofillState !== 'idle') {
                            setAccounts([]);
                            setAutofillState('idle');
                        }
                    }}
                    onBlur={() => {
                        if (tokenValid && !accountId && accounts.length === 0) void tryAutofillAccount();
                    }}
                    placeholder="wklej token tutaj"
                    spellCheck={false}
                    autoComplete="off"
                />
            </Form.Group>

            <Form.Group className="mb-3">
                <Form.Label>
                    Identyfikator konta
                    {autofillState === 'loading' && <span className="text-muted"> — wykrywanie…</span>}
                </Form.Label>
                {accounts.length > 1 ? (
                    <Form.Select value={accountId} onChange={e => setAccountId(e.target.value)}>
                        <option value="">— wybierz konto —</option>
                        {accounts.map(a => (
                            <option key={a.id} value={a.id}>{a.name} ({a.id.slice(0, 8)}…)</option>
                        ))}
                    </Form.Select>
                ) : (
                    <Form.Control
                        value={accountId}
                        onChange={e => setAccountId(e.target.value.trim())}
                        placeholder="32-znakowy ciąg heksadecymalny"
                        spellCheck={false}
                        autoComplete="off"
                        isInvalid={accountId.length > 0 && !accountIdValid}
                    />
                )}
                {accountId.length > 0 && !accountIdValid && (
                    <Form.Text className="text-danger">Identyfikator konta to 32 znaki szesnastkowe.</Form.Text>
                )}
            </Form.Group>

            <Form.Group className="mb-3">
                <Form.Label>Nazwa Workera</Form.Label>
                <Form.Control
                    value={workerName}
                    onChange={e => setWorkerName(e.target.value.toLowerCase())}
                    placeholder={DEFAULT_WORKER_NAME}
                    spellCheck={false}
                    autoComplete="off"
                    isInvalid={workerName.length > 0 && !nameValid}
                />
                {!nameValid && workerName.length > 0 ? (
                    <Form.Text className="text-danger">
                        Małe litery, cyfry, myślniki; musi zaczynać się od litery lub cyfry.
                    </Form.Text>
                ) : nameValid && (
                    <Form.Text className="text-muted">Istniejący Worker o tej nazwie zostanie nadpisany.</Form.Text>
                )}
            </Form.Group>

            {error && <Alert variant="danger">{error}</Alert>}
            <div className="d-flex justify-content-end gap-2">
                <Button variant="secondary" onClick={onBack}>Wstecz</Button>
                <Button variant="primary" disabled={!canDeploy} onClick={() => void runDeploy(0)}>Wdróż</Button>
            </div>
        </div>
    );
}
