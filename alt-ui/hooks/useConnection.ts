import { useCallback, useState } from 'react';
import mudClient from '@web/MudClient';
import { useClientEvent } from './useClientEvent';

/** Track the transport connection and expose a connect action. */
export function useConnection(): { connected: boolean; connect: () => void } {
    const [connected, setConnected] = useState(false);
    useClientEvent('client.connect', () => setConnected(true));
    useClientEvent('client.disconnect', () => setConnected(false));
    const connect = useCallback(() => { mudClient.connect(); }, []);
    return { connected, connect };
}
