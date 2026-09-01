import { useEffect, useRef } from 'react';
import { AnsiAwareBuffer } from '@client/ansi/FormatState';
import eventBus from '@modules/core/eventBus';
import mudClient from '@web/MudClient';
import { setupOutputContextMenu } from '@web/outputContextMenu';
import {
    applyFlairClass,
    createMessageTypeElement,
    createTimestampElement,
    setupOutputMessageHandler,
} from '@shared/dom/outputMessageHandler';
import { decodeOutputEntities, plainTextOf as textOf } from '@shared/dom/outputText';
import { buildCharPlaque } from './charPlaque';

// How many trailing lines the split-view sticky area mirrors while scrolled up.
const STICKY_LINES = 50;

// The location line rendered inline for `room.short`.
const buildLocale = (name: string): HTMLElement => {
    const el = document.createElement('div');
    el.className = 'locale';
    el.textContent = name;
    return el;
};

// A single output line. `AnsiAwareBuffer.toDom()` reattaches the per-node
// click/hyperlink listeners each call, so calling this again to build the
// split-view sticky copy yields a fully live (clickable) mirror — unlike
// cloneNode, which would drop those listeners.
//
// Each line leads with a timestamp + message-type span (the shared
// `.output-timestamp` / `.output-message-type` structure). Both are hidden by
// default and revealed by the `output-show-timestamps` / `output-show-message-types`
// classes the shared engine toggles onto the wrapper — see forge style.css and
// the context-menu toggles wired up below.
const buildMessageLine = (
    message: string | AnsiAwareBuffer,
    type: string | undefined,
    timestamp: number,
): HTMLElement => {
    const line = document.createElement('p');
    if (type) line.className = `t-${type.replace(/[^a-z0-9]+/gi, '-')}`;
    applyFlairClass(line, message);
    line.appendChild(createTimestampElement(timestamp));
    line.appendChild(createMessageTypeElement(type));
    // Message text lives in its own content span (mirroring stock's
    // `.output_msg_content`) so line-rewriters that prepend into the rendered
    // container — e.g. tracking's "[Brak sladow]" prefix via `line.onRender` —
    // land before the text rather than before the timestamp/type gutter.
    const content = document.createElement('span');
    content.className = 'output_msg_content';
    if (message instanceof AnsiAwareBuffer) {
        if (message.length === 0) {
            // A blank line: as a flex child an empty span collapses to zero
            // height, so seed a non-breaking space to keep the line box — same
            // as stock's `.output_msg_content` (createMessageWrapper).
            content.appendChild(document.createTextNode(' '));
        } else {
            content.appendChild(message.toDom());
            message.notifyRender(content);
        }
    } else {
        content.appendChild(document.createTextNode(message === '' ? ' ' : decodeOutputEntities(message)));
    }
    line.appendChild(content);
    return line;
};

/**
 * The game log. Output is high-throughput and `AnsiAwareBuffer.toDom()` yields
 * raw DOM nodes, so the log is rendered imperatively into a ref'd container
 * rather than through React state — via the shared output-message engine
 * (`@shared/dom/outputMessageHandler`), which also drives the stock UI's log.
 * That engine owns split-view detection, trimming, and sticky-area mirroring;
 * this component only supplies the forged `<p>`-per-line message shape (via
 * `buildMessageNode`) and a few forge-only inline chrome lines (connect
 * prompt, character plaque, room-short locale) appended through the engine's
 * `appendNode`.
 *
 * Split-scroll: the wrapper carries a sticky `#split-bottom` (mirroring the stock
 * output wrapper — `#split-handle` + `#sticky-area`). Scrolling up into scrollback
 * reveals it, pinning the newest `STICKY_LINES` at the bottom so live output stays
 * visible while you read history; scrolling back to the bottom hides it again.
 */
export default function GameLog() {
    const outputRef = useRef<HTMLDivElement>(null);
    const splitBottomRef = useRef<HTMLDivElement>(null);
    const splitHandleRef = useRef<HTMLDivElement>(null);
    const stickyAreaRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const output = outputRef.current;
        const splitBottom = splitBottomRef.current;
        const splitHandle = splitHandleRef.current;
        const stickyArea = stickyAreaRef.current;
        if (!output || !splitBottom || !splitHandle || !stickyArea) return;

        const handler = setupOutputMessageHandler(mudClient, {
            outputWrapper: output,
            splitBottom,
            splitHandle,
            stickyArea,
            stickyLines: STICKY_LINES,
            maxElements: 500,
            buildMessageNode: (message, type, timestamp) => {
                if (message === undefined || message === null) return null;

                // room.short renders inline in the log flow with the forged location style.
                if (type === 'room.short') {
                    const name = textOf(message).trim();
                    if (!name) return null;
                    return buildLocale(name);
                }

                return buildMessageLine(message, type, timestamp);
            },
        });

        // Right-click menu on the output (popup launchers + plugin entries). The
        // shared setup routes through the same contextMenuStore the forged
        // <ContextMenu> renders. We keep the timestamp/type toggles (our forged
        // lines carry the same `.output-timestamp` / `.output-message-type` spans),
        // but opt out of the copy-as-image / save-as-HTML entries — those operate
        // on the stock `.output_msg` wrapper structure we don't render.
        const teardownContextMenu = setupOutputContextMenu(output, {
            messageWrappersSupported: false,
            messageMetadataToggles: true,
        });

        // NOTE: connecting is not this component's business. The log used to
        // print a "Polacz z Arkadia" button into its own output while the
        // transport was down; that put a control inside the transcript, where it
        // scrolled with the text and got mixed into copied output. The connection
        // now lives entirely in <LoginGate> (over the HUD) and its footer
        // <ReconnectChip> — see forge-ui/components/login.css.

        // char.info drops a heraldic plaque into the log flow. It re-fires on
        // gender/guild changes (same character) and on a fresh login as a
        // different character (new object_num); we show the plaque once per
        // distinct character, so a re-login as someone else shows it again.
        let plaqueCharId: string | undefined;
        const offPlaque = eventBus.on('gmcp.char.info', (info) => {
            if (!info?.name) return;
            const id = info.object_num !== undefined ? String(info.object_num) : info.name.trim().toLowerCase();
            if (id === plaqueCharId) return;
            plaqueCharId = id;
            handler.appendNode(buildCharPlaque(info), () => buildCharPlaque(info));
        });

        return () => {
            teardownContextMenu();
            offPlaque();
            handler.destroy();
        };
    }, []);

    return (
        <div id="main_text_output_msg_wrapper" ref={outputRef}>
            <div id="split-bottom" className="split-hidden" ref={splitBottomRef}>
                {/* Viewport-fixed clone of body's backdrop, clipped to #split-bottom
                    (see style.css) so the sticky footer reads as a seamless
                    continuation of the transparent output rather than a black shelf. */}
                <div id="split-scenery"><div className="split-stone" /></div>
                <div id="split-handle" ref={splitHandleRef} />
                <div id="sticky-area" ref={stickyAreaRef} />
            </div>
        </div>
    );
}
