import { useEffect, useMemo, useSyncExternalStore } from 'react';
import eventBus from '@modules/core/eventBus';
import mudClient from '@web/MudClient';
import { ConnectionEngine, type ConnectionState } from '@web/connection/ConnectionEngine';
import { useClient } from '../client/ClientContext';

/**
 * React adapter over the shared {@link ConnectionEngine} — the same thin-adapter
 * shape `useCommandLine` has over `CommandLineEngine`. All the connection and
 * autologin behaviour lives in the engine; this only binds it to forge's
 * transport (mudClient + the event bus) and republishes its state to React.
 *
 * One engine per mount, kept alive for the component's life. `useSyncExternalStore`
 * subscribes straight to the engine, so state changes originating outside React
 * (the socket opening, the server dropping us) re-render without an effect hop.
 */
export function useConnection() {
    const client = useClient();

    const engine = useMemo(() => new ConnectionEngine({
        connect: () => mudClient.connect(),
        disconnect: () => mudClient.disconnect(),
        isSocketOpen: () => mudClient.isSocketOpen(),
        prepareSounds: () => client.prepareSounds(),
        send: (text, echo, options) => client.send(text, echo, options),
        on: (event, handler) => eventBus.on(event as never, handler as never),
    }), [client]);

    useEffect(() => engine.start(), [engine]);

    const state = useSyncExternalStore<ConnectionState>(
        (onChange) => engine.subscribe(onChange),
        () => engine.getState(),
    );

    return { ...state, engine };
}
