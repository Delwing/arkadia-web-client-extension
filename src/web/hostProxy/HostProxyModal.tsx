import {useEffect, useState} from 'react';
import {Button, Modal} from 'react-bootstrap';
import WORKER_CODE from './proxyWorker.js?raw';
import {ProxyDeployWizard} from './ProxyDeployWizard';

export interface HostProxyModalProps {
    show: boolean;
    onClose: () => void;
    /** Called with the chosen wss:// proxy URL once the user deploys their own. */
    onUseProxy: (wssUrl: string) => void;
    /** Default proxy URL, used to tunnel the wizard's Cloudflare API calls (CORS). */
    relayBase: string;
}

/**
 * Self-contained "Host your own proxy" modal. Mirrors the mudix feature:
 * a manual path (copy the worker code, deploy on Cloudflare, paste the URL) and
 * a one-click auto-deploy wizard. Communicates only through props — no app store
 * or settings coupling. Persisting/using the returned URL is the caller's job.
 */
export function HostProxyModal({show, onClose, onUseProxy, relayBase}: HostProxyModalProps) {
    const [view, setView] = useState<'info' | 'wizard'>('info');
    const [copied, setCopied] = useState(false);

    // Always reopen on the info view.
    useEffect(() => {
        if (show) setView('info');
    }, [show]);

    const handleCopy = () => {
        navigator.clipboard.writeText(WORKER_CODE).then(() => {
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        }).catch(() => { /* clipboard unavailable */ });
    };

    return (
        <Modal show={show} onHide={onClose} size="lg" scrollable centered>
            <Modal.Header closeButton>
                <Modal.Title>Uruchom własne proxy</Modal.Title>
            </Modal.Header>
            <Modal.Body>
                {view === 'wizard' ? (
                    <ProxyDeployWizard
                        relayBase={relayBase}
                        onBack={() => setView('info')}
                        onDeployed={(url) => {
                            onUseProxy(url);
                            onClose();
                        }}
                    />
                ) : (
                    <>
                        <p>
                            Wdróż darmowego Cloudflare Workera, który przekierowuje połączenia WebSocket
                            do serwera Arkadii.
                            Nie masz konta? <a href="https://dash.cloudflare.com/sign-up" target="_blank" rel="noreferrer">Zarejestruj się za darmo w Cloudflare</a>.
                        </p>

                        <div className="d-flex align-items-center justify-content-between gap-3 p-3 mb-3 border rounded">
                            <div className="d-flex flex-column">
                                <strong>Jednoklikowe wdrożenie</strong>
                                <span className="text-muted">Wklej token API, a my zajmiemy się resztą.</span>
                            </div>
                            <Button variant="primary" onClick={() => setView('wizard')}>Uruchom kreatora</Button>
                        </div>

                        <div className="text-center text-muted my-3">Lub skonfiguruj ręcznie</div>
                        <ol>
                            <li>Przejdź do sekcji <a href="https://dash.cloudflare.com/?to=/:account/workers-and-pages/create/workers/new" target="_blank" rel="noreferrer">Utwórz Workera</a> w pulpicie nawigacyjnym Cloudflare</li>
                            <li>Zastąp zawartość edytora poniższym kodem</li>
                            <li>Kliknij <strong>Wdróż</strong></li>
                            <li>Skopiuj adres URL Workera (np. <code>wss://twoj-worker.twojanazwa.workers.dev</code>) i użyj go jako proxy</li>
                        </ol>

                        <div className="rounded overflow-hidden" style={{border: '1px solid rgba(255, 255, 255, 0.15)'}}>
                            <div
                                className="d-flex align-items-center justify-content-between px-2 py-1"
                                style={{backgroundColor: '#2b2b2b'}}
                            >
                                <span className="small font-monospace" style={{color: '#bbb'}}>index.js</span>
                                <Button variant="outline-light" size="sm" onClick={handleCopy}>
                                    {copied ? 'Skopiowano!' : 'Skopiuj'}
                                </Button>
                            </div>
                            <pre
                                className="m-0 p-2"
                                style={{backgroundColor: '#1e1e1e', color: '#e0e0e0', maxHeight: '14rem', overflow: 'auto'}}
                            >
                                <code>{WORKER_CODE}</code>
                            </pre>
                        </div>
                    </>
                )}
            </Modal.Body>
        </Modal>
    );
}
