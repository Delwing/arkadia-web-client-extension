import { useEffect, useRef, type KeyboardEvent } from 'react';
import { useClient } from '../client/ClientContext';
import { useConnection } from '../hooks/useConnection';
import VitalGems from './VitalGems';

/** Vital gems above the command trough, with the connect knots framing it. */
export default function CommandRail() {
    const client = useClient();
    const { connected, connect } = useConnection();
    const inputRef = useRef<HTMLInputElement>(null);

    useEffect(() => { inputRef.current?.focus(); }, []);

    const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
        if (event.key !== 'Enter') return;
        const input = event.currentTarget;
        const command = input.value;
        input.value = '';
        void client.sendCommand(command, true, undefined, false, true);
    };

    return (
        <div className="rail">
            <VitalGems />

            <div className="forged command">
                <span
                    className={'knot' + (connected ? ' connected' : '')}
                    id="alt-connect"
                    title={connected ? 'Polaczony' : 'Polacz'}
                    onClick={connect}
                >
                    <svg viewBox="0 0 26 26"><use href="#knot" stroke="currentColor" /></svg>
                </span>
                <label className="trough">
                    <span className="prompt">&gt;</span>
                    <input
                        className="cmd-input"
                        id="alt-input"
                        data-command-input=""
                        type="text"
                        placeholder="Wpisz polecenie..."
                        autoComplete="off"
                        spellCheck={false}
                        ref={inputRef}
                        onKeyDown={onKeyDown}
                    />
                </label>
                <span className="knot">
                    <svg viewBox="0 0 26 26" style={{ transform: 'scaleX(-1)' }}>
                        <use href="#knot" stroke="currentColor" />
                    </svg>
                </span>
            </div>
        </div>
    );
}
