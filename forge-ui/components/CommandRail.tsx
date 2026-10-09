import { useRef } from 'react';
import { useCommandLine } from '../hooks/useCommandLine';
import FooterLayout from '@web-ui/footer/layout/FooterLayout';
import { useFooterLayout } from '@web-ui/footer/layout/useFooterLayout';
import DesktopButtons from '@web-ui/buttons/DesktopButtons';
import MobileCommandRadial from '@web-ui/buttons/MobileCommandRadial';
import MobileDirectionButtons from '@web-ui/buttons/MobileDirectionButtons';
import MobileJoysticks from '@web-ui/buttons/MobileJoysticks';
import Menu from './Menu';
import { forgeFooterPreviewHost, forgeFooterSkin } from './forgeFooterSkin';
import { setFooterPreviewHost } from '@web-ui/footer/layout/previewHost';

// The layout editor (in the shared settings) draws its preview on the plate.
setFooterPreviewHost(forgeFooterPreviewHost);
import { useClient } from '../client/ClientContext';

/**
 * The bottom HUD plate: one forged panel stacking, top to bottom, the footer
 * bands (location binds, status chips, vital gems) and the command trough — each
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
    const footerLayout = useFooterLayout();

    return (
        <div className="rail">
            {/* Shared with stock (src/ui/web/buttons) — each portals its own
                document.body-level overlay, so they're inert here beyond mounting. */}
            <DesktopButtons client={client} />
            <MobileCommandRadial client={client} />
            <MobileDirectionButtons client={client} messageInputId="alt-input" />
            <MobileJoysticks client={client} />
            <div className="hud-panel">
                {/* The footer bands - binds with the reconnect chip, the status
                    chips, the vital gems - as the footer layout arranges them.
                    The bind strip is always mounted (it self-empties to its
                    placeholder), so the plate keeps a stable height. */}
                <FooterLayout layout={footerLayout} skin={forgeFooterSkin} />
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
