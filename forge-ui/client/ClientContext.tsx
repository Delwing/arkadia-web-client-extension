import { createContext, useContext } from 'react';
import type Client from '@client/Client';

const ClientContext = createContext<Client | null>(null);

export const ClientProvider = ClientContext.Provider;

/** Access the singleton game client provided at the app root. */
export function useClient(): Client {
    const client = useContext(ClientContext);
    if (!client) {
        throw new Error('useClient must be used within <ClientProvider>');
    }
    return client;
}
