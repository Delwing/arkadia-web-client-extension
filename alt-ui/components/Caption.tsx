import { useConnection } from '../hooks/useConnection';

/** Footer line + connection status/action. */
export default function Caption() {
    const { connected, connect } = useConnection();
    return (
        <div className="caption">
            Arkadia &middot; Alt UI &middot;{' '}
            <span
                id="alt-status"
                className={connected ? 'connected' : undefined}
                onClick={connect}
            >
                {connected ? 'Polaczony' : 'Polacz'}
            </span>
        </div>
    );
}
