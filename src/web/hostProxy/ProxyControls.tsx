import {useEffect, useRef, useState} from 'react';
import {ChevronRight, SlidersHorizontal, TriangleAlert, X} from 'lucide-react';
import type {ProxyMode} from '../MudClient';
import type {HelperConnection} from '@modules/helper/HelperConnection';
import {getDownloadUrl} from '@web/helperDownload.ts';
import {HostProxyModal} from './HostProxyModal';

const MODES: {value: ProxyMode; label: string; about: string}[] = [
    {value: 'direct', label: 'Bezpośrednio', about: 'Łączy prosto z serwerem gry.'},
    {value: 'helper', label: 'Pomocnik', about: 'Łączy przez pomocnika uruchomionego na tym komputerze.'},
    {value: 'proxy', label: 'Proxy', about: 'Łączy przez serwer pośredniczący. Pusty adres = domyślny serwer.'},
];

/** How long "Uruchom pomocnika" waits for the helper to answer. */
const LAUNCH_WAIT_MS = 8000;
const LAUNCH_POLL_MS = 500;

/** The helper, as far as the login screen knows: only asked about in helper mode. */
type HelperCheck = 'checking' | 'ok' | 'missing' | 'launching' | 'failed';

interface Props {
    /** The proxy an empty URL field falls back to, shown as its title. */
    defaultProxy: string;
    /** Whether a resumed session is announced in the output. */
    initialResumeNotice: boolean;
    /** Persist a changed resume-notice preference. */
    onResumeNoticeChange: (enabled: boolean) => void;
    /** Currently persisted connection mode. */
    initialMode: ProxyMode;
    /** Current user-defined proxy URL, or '' for the default. */
    initialUrl: string;
    /** Persist a changed connection mode. */
    onModeChange: (mode: ProxyMode) => void;
    /** Persist a changed proxy URL ('' clears it back to the default). */
    onUrlChange: (url: string) => void;
    /** The user supplied their own proxy — persist it and switch to proxy mode. */
    onUseProxy: (url: string) => void;
    /** Whether MCCP compression is on. */
    initialMccp: boolean;
    onMccpChange: (enabled: boolean) => void;
    /** The local helper app, asked whether it runs when the helper mode is picked. */
    helper: Pick<HelperConnection, 'probe' | 'launch' | 'getState' | 'onStateChange'>;
    /** Open the helper's settings, which say how to install it. */
    onHelperHelp: () => void;
    /** True while logging in cannot work: the helper mode without a helper. */
    onBlockedChange: (blocked: boolean) => void;
}

/**
 * The login screen's "Połączenie" footer: how to reach the game (direct /
 * helper / remote proxy), a warning when the picked helper does not answer, and
 * the settings of the mode (proxy URL, MCCP) behind the sliders button. Holds
 * the UI state; the callbacks keep it decoupled from the client.
 */
export function ProxyControls({
    defaultProxy, initialMode, initialUrl, initialResumeNotice, initialMccp,
    onModeChange, onUrlChange, onResumeNoticeChange, onUseProxy, onMccpChange,
    helper, onHelperHelp, onBlockedChange,
}: Props) {
    const [mode, setMode] = useState<ProxyMode>(initialMode);
    const [url, setUrl] = useState(initialUrl);
    const [resumeNotice, setResumeNotice] = useState(initialResumeNotice);
    const [mccp, setMccp] = useState(initialMccp);
    const [settingsOpen, setSettingsOpen] = useState(false);
    const [hostOpen, setHostOpen] = useState(false);
    const [check, setCheck] = useState<HelperCheck>('checking');
    // Bumped on every new question to the helper, so a stale answer is dropped.
    const asked = useRef(0);

    const changeMode = (next: ProxyMode) => {
        setMode(next);
        onModeChange(next);
    };

    const askHelper = () => {
        const id = ++asked.current;
        if (helper.getState() === 'connected') {
            setCheck('ok');
            return;
        }
        setCheck('checking');
        void helper.probe().then((status) => {
            if (asked.current === id) setCheck(status ? 'ok' : 'missing');
        });
    };

    const launchHelper = async () => {
        const id = ++asked.current;
        setCheck('launching');
        helper.launch();
        for (let waited = 0; waited < LAUNCH_WAIT_MS; waited += LAUNCH_POLL_MS) {
            await new Promise((resolve) => setTimeout(resolve, LAUNCH_POLL_MS));
            if (asked.current !== id) return;
            if (helper.getState() === 'connected' || (await helper.probe())) {
                if (asked.current === id) setCheck('ok');
                return;
            }
        }
        if (asked.current === id) setCheck('failed');
    };

    useEffect(() => {
        if (mode !== 'helper') {
            asked.current++;
            return;
        }
        askHelper();
        return helper.onStateChange((state) => {
            if (state === 'connected') {
                asked.current++;
                setCheck('ok');
            }
        });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [mode, helper]);

    const blocked = mode === 'helper' && check !== 'ok' && check !== 'checking';
    useEffect(() => {
        onBlockedChange(blocked);
    }, [blocked, onBlockedChange]);

    const current = MODES.find((m) => m.value === mode) ?? MODES[0];
    const download = getDownloadUrl();

    return (
        <div className="proxy-controls">
            <span className="auth-cap">Połączenie</span>
            <div className="proxy-controls__row">
                <div className="proxy-seg">
                    {MODES.map(({value, label}) => (
                        <button
                            key={value}
                            id={`proxy-mode-${value}`}
                            type="button"
                            className={mode === value ? 'is-on' : undefined}
                            onClick={() => changeMode(value)}
                        >
                            {label}
                        </button>
                    ))}
                </div>
                <button
                    id="proxy-settings-toggle"
                    type="button"
                    className={`auth-ib auth-ib--box${settingsOpen ? ' is-on' : ''}`}
                    title={`Ustawienia połączenia: ${current.label}`}
                    onClick={() => setSettingsOpen((open) => !open)}
                >
                    <SlidersHorizontal size={15}/>
                </button>
            </div>

            {mode === 'helper' && (check === 'missing' || check === 'launching') && (
                <div className="auth-alert auth-alert--warn" id="helper-missing">
                    <TriangleAlert size={13}/>
                    <div className="auth-alert__body">
                        <span><strong>Pomocnik nie odpowiada.</strong> <span className="auth-dim">Może nie jest uruchomiony.</span></span>
                        <div className="auth-alert__actions">
                            <button type="button" className="auth-btn auth-btn--sm auth-btn--solid" disabled={check === 'launching'} onClick={() => void launchHelper()}>
                                {check === 'launching' ? 'Uruchamianie…' : 'Uruchom pomocnika'}
                            </button>
                            <button type="button" className="auth-btn auth-btn--sm auth-btn--ghost" onClick={() => changeMode('direct')}>Wybierz inny tryb</button>
                        </div>
                    </div>
                </div>
            )}
            {mode === 'helper' && check === 'failed' && (
                <div className="auth-alert auth-alert--danger" id="helper-failed">
                    <TriangleAlert size={13}/>
                    <div className="auth-alert__body">
                        <span><strong>Nie udało się uruchomić pomocnika.</strong> <span className="auth-dim">Pewnie nie jest zainstalowany na tym komputerze.</span></span>
                        <div className="auth-alert__actions">
                            {download && (
                                <a className="auth-btn auth-btn--sm auth-btn--solid" href={download.url} download title={`Pomocnik dla: ${download.label}`}>Pobierz</a>
                            )}
                            <button type="button" className="auth-btn auth-btn--sm" onClick={askHelper}>Sprawdź ponownie</button>
                            <button type="button" className="auth-btn auth-btn--sm auth-btn--ghost" onClick={onHelperHelp}>Jak zainstalować</button>
                        </div>
                    </div>
                </div>
            )}

            {settingsOpen && (
                <ConnectionSettings
                    title={current.label}
                    about={current.about}
                    proxy={mode === 'proxy'}
                    url={url}
                    defaultProxy={defaultProxy}
                    onUrlChange={(next) => {
                        setUrl(next);
                        onUrlChange(next);
                    }}
                    mccp={mccp}
                    onMccpChange={(next) => {
                        setMccp(next);
                        onMccpChange(next);
                    }}
                    resumeNotice={resumeNotice}
                    onResumeNoticeChange={(next) => {
                        setResumeNotice(next);
                        onResumeNoticeChange(next);
                    }}
                    onHostYourOwn={() => {
                        setSettingsOpen(false);
                        setHostOpen(true);
                    }}
                    onClose={() => setSettingsOpen(false)}
                />
            )}
            <HostProxyModal
                show={hostOpen}
                onClose={() => setHostOpen(false)}
                onUseProxy={(deployed) => {
                    setUrl(deployed);
                    changeMode('proxy');
                    onUseProxy(deployed);
                    setHostOpen(false);
                }}
            />
        </div>
    );
}

interface SettingsProps {
    title: string;
    about: string;
    /** The proxy's own settings: its address, the resume notice, hosting one. */
    proxy: boolean;
    url: string;
    defaultProxy: string;
    onUrlChange: (url: string) => void;
    mccp: boolean;
    onMccpChange: (enabled: boolean) => void;
    resumeNotice: boolean;
    onResumeNoticeChange: (enabled: boolean) => void;
    onHostYourOwn: () => void;
    onClose: () => void;
}

/** The mode's settings, over the footer. Escape or a click elsewhere closes it. */
function ConnectionSettings({
    title, about, proxy, url, defaultProxy, onUrlChange, mccp, onMccpChange,
    resumeNotice, onResumeNoticeChange, onHostYourOwn, onClose,
}: SettingsProps) {
    const ref = useRef<HTMLElement>(null);

    useEffect(() => {
        // Capturing on window: Escape must not also close the login screen.
        const onKey = (event: KeyboardEvent) => {
            if (event.key !== 'Escape') return;
            event.stopPropagation();
            onClose();
        };
        const onPointer = (event: PointerEvent) => {
            const target = event.target as Element | null;
            if (ref.current?.contains(target) || target?.closest?.('#proxy-settings-toggle')) return;
            onClose();
        };
        window.addEventListener('keydown', onKey, true);
        document.addEventListener('pointerdown', onPointer);
        return () => {
            window.removeEventListener('keydown', onKey, true);
            document.removeEventListener('pointerdown', onPointer);
        };
    }, [onClose]);

    return (
        <section className="auth-settings" id="proxy-settings" ref={ref}>
            <div className="auth-settings__head">
                <span>Ustawienia: {title}</span>
                <button type="button" className="auth-ib auth-ib--sm" title="Zamknij" onClick={onClose}><X size={12}/></button>
            </div>
            <p className="auth-dim">{about}</p>
            {proxy && (
                <label className="auth-field">
                    <span className="auth-label">Adres proxy</span>
                    <input
                        id="proxy-url"
                        className="auth-input auth-input--mono"
                        type="text"
                        value={url}
                        onChange={(e) => onUrlChange(e.target.value)}
                        placeholder="domyślny serwer"
                        title={`Domyślny serwer: ${defaultProxy}`}
                        spellCheck={false}
                        autoComplete="off"
                    />
                </label>
            )}
            <label className="auth-check">
                <input id="mccp-enabled" type="checkbox" checked={mccp} onChange={(e) => onMccpChange(e.target.checked)}/>
                Kompresja MCCP
            </label>
            {proxy && (
                <label className="auth-check">
                    <input id="proxy-resume-notice" type="checkbox" checked={resumeNotice} onChange={(e) => onResumeNoticeChange(e.target.checked)}/>
                    Informuj o wznowieniu połączenia
                </label>
            )}
            {proxy && (
                <button type="button" className="auth-btn auth-btn--link" onClick={onHostYourOwn}>
                    Jak postawić własne proxy<ChevronRight size={13}/>
                </button>
            )}
        </section>
    );
}
