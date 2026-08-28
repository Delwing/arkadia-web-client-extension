import {useState} from 'react';
import {Button, Modal} from 'react-bootstrap';

const SETUP_GUIDE_URL =
    'https://github.com/Delwing/arkadia-web-client-extension/blob/master/proxy/deploy/SETUP.md';

/** The commands that do the actual work, once the machine and the domain exist. */
const INSTALL_COMMANDS = `# na swoim komputerze, w katalogu proxy/ z repozytorium
GOOS=linux GOARCH=amd64 go build -trimpath -o session-proxy .
scp session-proxy deploy/session-proxy.service uzytkownik@twoj-serwer:/tmp/

# na serwerze
sudo useradd --system --no-create-home --shell /usr/sbin/nologin sessionproxy
sudo mkdir -p /opt/session-proxy
sudo install -o sessionproxy -g sessionproxy -m 0755 \\
    /tmp/session-proxy /opt/session-proxy/session-proxy
sudo install -m 0644 /tmp/session-proxy.service /etc/systemd/system/
sudo systemctl daemon-reload && sudo systemctl enable --now session-proxy

# Caddy zajmuje sie certyfikatem; w /etc/caddy/Caddyfile:
#   twoja-domena.pl {
#       reverse_proxy 127.0.0.1:8080
#   }
sudo systemctl reload caddy`;

export interface HostProxyModalProps {
    show: boolean;
    onClose: () => void;
    /** Called with the chosen wss:// proxy URL once the user sets their own up. */
    onUseProxy: (wssUrl: string) => void;
}

/**
 * "Host your own proxy" instructions.
 *
 * This used to deploy a Cloudflare Worker from the browser with a pasted API token.
 * That proxy is stateless — it ties the game connection to the browser's WebSocket, so
 * a phone that freezes its backgrounded tab still loses the character, which is the
 * problem the session proxy exists to solve. Sending people to deploy one would be
 * sending them to the thing that does not work.
 *
 * Its replacement cannot be a wizard. A VPS needs SSH, a domain and a certificate, none
 * of which a web page can arrange, so this is a guide: the shape of the job here, the
 * commands that do the work, and a link to the full procedure. Anyone who already runs
 * their own Worker keeps working — an existing proxy URL is still accepted, it just is
 * not what we recommend setting up.
 */
export function HostProxyModal({show, onClose, onUseProxy}: HostProxyModalProps) {
    const [copied, setCopied] = useState(false);
    const [url, setUrl] = useState('');

    const handleCopy = () => {
        navigator.clipboard.writeText(INSTALL_COMMANDS).then(() => {
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        }).catch(() => { /* clipboard unavailable */ });
    };

    const trimmed = url.trim();

    return (
        <Modal show={show} onHide={onClose} size="lg" scrollable centered>
            <Modal.Header closeButton>
                <Modal.Title>Uruchom własne proxy</Modal.Title>
            </Modal.Header>
            <Modal.Body>
                <p>
                    Proxy trzyma połączenie z Arkadią u siebie, dzięki czemu zamrożona
                    przez telefon karta przeglądarki nie zrywa sesji. Domyślne proxy
                    działa od ręki i nie trzeba nic konfigurować — własne ma sens, jeśli
                    wolisz, żeby ruch szedł przez twój serwer.
                </p>
                <p className="text-muted">
                    To nie jest kreator: potrzebny jest serwer, domena i dostęp przez SSH.
                    Liczone w minutach — raczej pół godziny niż pięć.
                </p>

                <ol>
                    <li>
                        Załóż darmowe konto w{' '}
                        <a href="https://www.oracle.com/cloud/free/" target="_blank" rel="noreferrer">
                            Oracle Cloud Always Free
                        </a>{' '}
                        i utwórz instancję z Ubuntu. Darmowy limit spokojnie wystarcza.
                    </li>
                    <li>
                        Otwórz porty <strong>80</strong> i <strong>443</strong>. Uwaga: są
                        dwie zapory — lista bezpieczeństwa w panelu Oracle <em>oraz</em>{' '}
                        <code>iptables</code> na samej maszynie.
                    </li>
                    <li>
                        Zdobądź nazwę domeny. Let&apos;s Encrypt nie wystawi certyfikatu dla
                        samego adresu IP; wystarczy darmowe <code>sslip.io</code> albo
                        DuckDNS. Zarezerwuj też publiczny adres IP, bo domyślny potrafi się
                        zmienić.
                    </li>
                    <li>
                        Zainstaluj <a href="https://caddyserver.com/" target="_blank" rel="noreferrer">Caddy</a>{' '}
                        — sam załatwia certyfikat i odnawia go w tle.
                    </li>
                    <li>Zbuduj proxy i uruchom je jako usługę (komendy poniżej).</li>
                    <li>
                        Wklej adres <code>wss://twoja-domena.pl/attach</code> w ustawieniach
                        proxy.
                    </li>
                </ol>

                <p className="small text-muted">
                    Do zbudowania potrzebny jest <a href="https://go.dev/dl/" target="_blank" rel="noreferrer">Go</a>{' '}
                    i kod z repozytorium. Pełna instrukcja, razem z pułapkami Oracle:{' '}
                    <a href={SETUP_GUIDE_URL} target="_blank" rel="noreferrer">SETUP.md</a>.
                </p>

                <div className="rounded overflow-hidden" style={{border: '1px solid rgba(255, 255, 255, 0.15)'}}>
                    <div
                        className="d-flex align-items-center justify-content-between px-2 py-1"
                        style={{backgroundColor: '#2b2b2b'}}
                    >
                        <span className="small font-monospace" style={{color: '#bbb'}}>instalacja</span>
                        <Button variant="outline-light" size="sm" onClick={handleCopy}>
                            {copied ? 'Skopiowano!' : 'Skopiuj'}
                        </Button>
                    </div>
                    <pre
                        className="m-0 p-2"
                        style={{backgroundColor: '#1e1e1e', color: '#e0e0e0', maxHeight: '14rem', overflow: 'auto'}}
                    >
                        <code>{INSTALL_COMMANDS}</code>
                    </pre>
                </div>

                <hr/>

                <label className="form-label" htmlFor="host-proxy-url">
                    Masz już uruchomione proxy? Wklej jego adres:
                </label>
                <div className="d-flex gap-2">
                    <input
                        id="host-proxy-url"
                        type="text"
                        className="form-control"
                        value={url}
                        onChange={e => setUrl(e.target.value)}
                        placeholder="wss://twoja-domena.pl/attach"
                        spellCheck={false}
                        autoComplete="off"
                    />
                    <Button
                        variant="primary"
                        disabled={!trimmed}
                        onClick={() => onUseProxy(trimmed)}
                    >
                        Użyj
                    </Button>
                </div>
            </Modal.Body>
        </Modal>
    );
}
