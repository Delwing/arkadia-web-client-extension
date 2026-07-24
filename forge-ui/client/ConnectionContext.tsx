import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import type { ConnectionEngine, ConnectionPhase } from '@web/connection/ConnectionEngine';
import { useConnection } from '../hooks/useConnection';

interface ConnectionContextValue {
    phase: ConnectionPhase;
    notice: string | null;
    engine: ConnectionEngine;
    /** The gate is offline but pushed aside so the log stays readable. */
    dismissed: boolean;
    dismiss: () => void;
    restore: () => void;
}

const ConnectionContext = createContext<ConnectionContextValue | null>(null);

/**
 * Owns the single connection engine for the HUD, plus the one piece of state the
 * engine has no opinion about: whether the user has pushed the login screen
 * aside to read their log.
 *
 * It lives in a provider because two components need the same instance — the
 * <LoginGate> and the footer's reconnect chip are two views of one connection,
 * and a second `useConnection()` would mean a second engine with its own
 * duplicate socket listeners.
 */
export function ConnectionProvider({ children }: { children: ReactNode }) {
    const { phase, notice, engine } = useConnection();
    const [dismissed, setDismissed] = useState(false);

    useEffect(() => {
        if (phase !== 'online') return;
        // Getting in resets the gate: the next drop should show it again rather
        // than silently leaving the user on a dead session.
        setDismissed(false);
    }, [phase]);

    return (
        <ConnectionContext.Provider value={{
            phase, notice, engine,
            dismissed,
            dismiss: () => setDismissed(true),
            restore: () => setDismissed(false),
        }}>
            {children}
        </ConnectionContext.Provider>
    );
}

export function useConnectionState(): ConnectionContextValue {
    const value = useContext(ConnectionContext);
    if (!value) throw new Error('useConnectionState must be used inside <ConnectionProvider>');
    return value;
}
