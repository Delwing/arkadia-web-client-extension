import { useConnectionState } from '../client/ConnectionContext';

/**
 * The way back after pushing the login screen aside.
 *
 * Only rendered when the session is down AND the gate has been dismissed — i.e.
 * exactly the state that used to print a "Polacz z Arkadia" button into the game
 * log. Living in the HUD's chip band instead means the log stays untouched: the
 * client's own chrome reports the connection, the transcript stays a transcript.
 *
 * Clicking it connects straight away rather than reopening the login form: after
 * a drop the fast path is to be back in the game, and the server prints its own
 * name/password prompts into the log for anyone who needs to sign in by hand. It
 * sits at the RIGHT end of the bind band so a dropped session announces itself
 * from the plate's own status edge without shoving the location binds around.
 */
export default function ReconnectChip() {
    const { phase, dismissed, engine } = useConnectionState();
    if (phase === 'online' || !dismissed) return null;

    const connecting = phase === 'connecting';
    return (
        <button
            type="button"
            className="reconnect-chip"
            onClick={() => engine.connect()}
            disabled={connecting}
            title="Połącz z Arkadią"
        >
            <span className="reconnect-chip__dot" />
            <span className="reconnect-chip__lab">Rozłączono</span>
            <span className="reconnect-chip__act">{connecting ? 'Łączenie' : 'Połącz'}</span>
        </button>
    );
}
