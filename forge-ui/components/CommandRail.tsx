import { useRef } from 'react';
import { useCommandLine } from '../hooks/useCommandLine';
import MultiBindStrip from '@web-ui/footer/MultiBindStrip';
import FooterStrip from '@web-ui/footer/FooterStrip';
import DesktopButtons from '@web-ui/buttons/DesktopButtons';
import MobileCommandRadial from '@web-ui/buttons/MobileCommandRadial';
import MobileDirectionButtons from '@web-ui/buttons/MobileDirectionButtons';
import VitalGems from './VitalGems';
import Menu from './Menu';
import ReconnectChip from './ReconnectChip';
import { useClient } from '../client/ClientContext';

/**
 * The bottom HUD plate: one forged panel stacking, top to bottom, the location
 * binds, the footer status chips, the vital gems and the command trough — each
 * band parted from the next by an engraved seam so they read as cut into one
 * piece of steel. The location-bind and footer bands are always mounted (they
 * self-empty rather than unmount), so the plate keeps a stable height and never
 * shifts as rooms change.
 */
export default function CommandRail() {
    const client = useClient();
    const inputRef = useRef<HTMLTextAreaElement>(null);
    const passwordRef = useRef<HTMLInputElement>(null);

    // History, completion, multiline, password mode and sticky focus all come
    // from the shared command-line engine — see useCommandLine.
    const { passwordMode } = useCommandLine({ inputRef, passwordRef });

    return (
        <div className="rail">
            {/* Shared with stock (src/ui/web/buttons) — each portals its own
                document.body-level overlay, so they're inert here beyond mounting. */}
            <DesktopButtons client={client} />
            <MobileCommandRadial client={client} />
            <MobileDirectionButtons client={client} messageInputId="alt-input" />
            <div className="hud-panel">
                {/* Forge wraps the shared bind row in its own always-present band
                    (alwaysVisible) so the plate keeps a stable height. */}
                {/* The bind band doubles as the home for the reconnect chip: it
                    is always mounted (so nothing shifts when the chip appears)
                    and it is the top edge of the plate, where a dropped session
                    should announce itself. The chip is last in the DOM and
                    margin-left:auto'd to the right end, so the location binds keep
                    the left and the status control keeps the plate's status edge. */}
                <div className="multibind-strip">
                    <MultiBindStrip alwaysVisible />
                    <ReconnectChip />
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
