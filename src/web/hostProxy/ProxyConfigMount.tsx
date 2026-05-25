import {useEffect, useState} from 'react';
import {HostProxyModal} from './HostProxyModal';
import {ProxySettingsModal} from './ProxySettingsModal';

/** Dispatch this window event to open the proxy settings modal. */
export const OPEN_PROXY_SETTINGS_EVENT = 'open-proxy-settings';

interface Props {
    /** Default proxy URL (with query); also the wizard's CORS relay. */
    relayBase: string;
    /** Current user-defined proxy URL, or '' for the default. */
    initialUrl: string;
    /** Persist a changed proxy URL ('' clears it back to the default). */
    onUrlChange: (url: string) => void;
    /** A proxy was deployed via the wizard — persist it and enable proxy mode. */
    onUseProxy: (url: string) => void;
}

/**
 * Mounts the proxy settings modal (opened from the connection screen via
 * OPEN_PROXY_SETTINGS_EVENT) and, beneath it, the host-your-own wizard. Holds the
 * URL state; the two persistence callbacks keep it decoupled from the app/client.
 */
export function ProxyConfigMount({relayBase, initialUrl, onUrlChange, onUseProxy}: Props) {
    const [settingsOpen, setSettingsOpen] = useState(false);
    const [hostOpen, setHostOpen] = useState(false);
    const [url, setUrl] = useState(initialUrl);

    useEffect(() => {
        const open = () => setSettingsOpen(true);
        window.addEventListener(OPEN_PROXY_SETTINGS_EVENT, open);
        return () => window.removeEventListener(OPEN_PROXY_SETTINGS_EVENT, open);
    }, []);

    return (
        <>
            <ProxySettingsModal
                show={settingsOpen}
                onClose={() => setSettingsOpen(false)}
                url={url}
                onUrlChange={(next) => {
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
                onUseProxy={(deployed) => {
                    setUrl(deployed);
                    onUseProxy(deployed);
                    setHostOpen(false);
                }}
            />
        </>
    );
}
