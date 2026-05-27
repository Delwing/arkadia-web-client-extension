import {useState} from 'react';
import {Button, ButtonGroup, ToggleButton} from 'react-bootstrap';
import {Cog} from 'lucide-react';
import type {ProxyMode} from '../MudClient';
import {HostProxyModal} from './HostProxyModal';
import {ProxySettingsModal} from './ProxySettingsModal';

const MODES: {value: ProxyMode; label: string}[] = [
    {value: 'direct', label: 'Bezpośrednio'},
    {value: 'helper', label: 'Pomocnik'},
    {value: 'proxy', label: 'Proxy'},
];

interface Props {
    /** Default proxy URL (with query); also the wizard's CORS relay. */
    relayBase: string;
    /** Currently persisted connection mode. */
    initialMode: ProxyMode;
    /** Current user-defined proxy URL, or '' for the default. */
    initialUrl: string;
    /** Persist a changed connection mode. */
    onModeChange: (mode: ProxyMode) => void;
    /** Persist a changed proxy URL ('' clears it back to the default). */
    onUrlChange: (url: string) => void;
    /** A proxy was deployed via the wizard — persist it and switch to proxy mode. */
    onUseProxy: (url: string) => void;
}

/**
 * Connection-screen control for how to reach the game: a segmented toggle for
 * the mode (direct / helper / remote proxy) with, in proxy mode, a cog button
 * that opens the proxy URL settings and the host-your-own wizard. Holds the UI
 * state; the persistence callbacks keep it decoupled from the client.
 */
export function ProxyControls({relayBase, initialMode, initialUrl, onModeChange, onUrlChange, onUseProxy}: Props) {
    const [mode, setMode] = useState<ProxyMode>(initialMode);
    const [url, setUrl] = useState(initialUrl);
    const [settingsOpen, setSettingsOpen] = useState(false);
    const [hostOpen, setHostOpen] = useState(false);

    const changeMode = (next: ProxyMode) => {
        setMode(next);
        onModeChange(next);
    };

    return (
        <div className="proxy-controls d-flex justify-content-center">
            <ButtonGroup size="sm">
                {MODES.map(({value, label}) => (
                    <ToggleButton
                        key={value}
                        id={`proxy-mode-${value}`}
                        type="radio"
                        name="proxy-mode"
                        value={value}
                        checked={mode === value}
                        onChange={() => changeMode(value)}
                        variant="outline-light"
                    >
                        {label}
                    </ToggleButton>
                ))}
                <Button
                    variant="outline-light"
                    className="d-inline-flex align-items-center"
                    onClick={() => setSettingsOpen(true)}
                    title="Konfiguruj połączenie"
                >
                    <Cog size={16}/>
                </Button>
            </ButtonGroup>

            <ProxySettingsModal
                show={settingsOpen}
                onClose={() => setSettingsOpen(false)}
                url={url}
                onUrlChange={next => {
                    setUrl(next);
                    onUrlChange(next);
                }}
                defaultProxy={relayBase.split('?')[0]}
                onHostYourOwn={() => {
                    setSettingsOpen(false);
                    setHostOpen(true);
                }}
            />
            <HostProxyModal
                show={hostOpen}
                onClose={() => setHostOpen(false)}
                relayBase={relayBase}
                onUseProxy={deployed => {
                    setUrl(deployed);
                    changeMode('proxy');
                    onUseProxy(deployed);
                    setHostOpen(false);
                }}
            />
        </div>
    );
}
