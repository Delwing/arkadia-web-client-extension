import { useRef } from 'react';
import { useCommandLine } from '../hooks/useCommandLine';
import MultiBindStrip from '@web-ui/footer/MultiBindStrip';
import FooterStrip from '@web-ui/footer/FooterStrip';
import VitalGems from './VitalGems';
import Menu from './Menu';

/**
 * The bottom HUD plate: one forged panel stacking, top to bottom, the location
 * binds, the footer status chips, the vital gems and the command trough — each
 * band parted from the next by an engraved seam so they read as cut into one
 * piece of steel. The location-bind and footer bands are always mounted (they
 * self-empty rather than unmount), so the plate keeps a stable height and never
 * shifts as rooms change.
 */
export default function CommandRail() {
    const inputRef = useRef<HTMLTextAreaElement>(null);
    const passwordRef = useRef<HTMLInputElement>(null);

    // History, completion, multiline, password mode and sticky focus all come
    // from the shared command-line engine — see useCommandLine.
    const { passwordMode } = useCommandLine({ inputRef, passwordRef });

    return (
        <div className="rail">
            <div className="hud-panel">
                {/* Forge wraps the shared bind row in its own always-present band
                    (alwaysVisible) so the plate keeps a stable height. */}
                <div className="multibind-strip">
                    <MultiBindStrip alwaysVisible />
                </div>
                <div className="hud-seam" />
                <FooterStrip />
                <div className="hud-seam" />
                <VitalGems />
                <div className="hud-seam" />

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
                    <Menu />
                </div>
            </div>
        </div>
    );
}
