import { useRef } from 'react';
import { useCommandLine } from '../hooks/useCommandLine';
import VitalGems from './VitalGems';

/** Vital gems above the command trough, with decorative knots framing it. */
export default function CommandRail() {
    const inputRef = useRef<HTMLTextAreaElement>(null);
    const passwordRef = useRef<HTMLInputElement>(null);

    // History, completion, multiline, password mode and sticky focus all come
    // from the shared command-line engine — see useCommandLine.
    const { passwordMode } = useCommandLine({ inputRef, passwordRef });

    return (
        <div className="rail">
            {/* Vital row and command row share one forged plate, parted by a seam. */}
            <div className="hud-panel hud-panel--seam">
                <VitalGems />

                <div className="command">
                    <span className="knot">
                        <svg viewBox="0 0 26 26"><use href="#knot" stroke="currentColor" /></svg>
                    </span>
                    <label className="trough">
                        <span className="prompt">&gt;</span>
                        <textarea
                            className="cmd-input"
                            id="alt-input"
                            data-command-input=""
                            rows={1}
                            placeholder="Wpisz polecenie..."
                            autoComplete="off"
                            spellCheck={false}
                            ref={inputRef}
                            style={passwordMode ? { display: 'none' } : undefined}
                        />
                        <input
                            className="cmd-input"
                            id="alt-input-password"
                            type="password"
                            autoComplete="off"
                            spellCheck={false}
                            ref={passwordRef}
                            style={passwordMode ? undefined : { display: 'none' }}
                        />
                    </label>
                    <span className="knot">
                        <svg viewBox="0 0 26 26" style={{ transform: 'scaleX(-1)' }}>
                            <use href="#knot" stroke="currentColor" />
                        </svg>
                    </span>
                </div>
            </div>
        </div>
    );
}
