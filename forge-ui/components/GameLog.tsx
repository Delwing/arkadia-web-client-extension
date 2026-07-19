import { useEffect, useRef } from 'react';
import { AnsiAwareBuffer } from '@client/ansi/FormatState';
import eventBus from '@modules/core/eventBus';
import mudClient from '@web/MudClient';
import { setupOutputContextMenu } from '@web/outputContextMenu';
import { setupOutputMessageHandler } from '@shared/dom/outputMessageHandler';
import { buildCharPlaque } from './charPlaque';

// How many trailing lines the split-view sticky area mirrors while scrolled up.
const STICKY_LINES = 50;

const textOf = (message: string | AnsiAwareBuffer): string =>
    message instanceof AnsiAwareBuffer ? message.text : message;

// The client emits string output (e.g. command echoes) HTML-encoded — resolveObjectIds
// and echoCommand produce `&lt;desc&gt;` for the stock UI's innerHTML renderer. We render
// via textContent, so decode those entities back to literal characters first.
// (Decode &amp; last so an escaped entity like `&amp;lt;` survives as `&lt;`.)
const decodeEntities = (text: string): string =>
    text
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/&amp;/g, '&');

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
const buildMessageLine = (message: string | AnsiAwareBuffer, type?: string): HTMLElement => {
    const line = document.createElement('p');
    if (type) line.className = `t-${type.replace(/[^a-z0-9]+/gi, '-')}`;
    if (message instanceof AnsiAwareBuffer) {
        line.appendChild(message.toDom());
        message.notifyRender(line);
    } else {
        line.textContent = decodeEntities(message);
    }
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
            buildMessageNode: (message, type) => {
                if (message === undefined || message === null) return null;

                // room.short renders inline in the log flow with the forged location style.
                if (type === 'room.short') {
                    const name = textOf(message).trim();
                    if (!name) return null;
                    return buildLocale(name);
                }

                return buildMessageLine(message, type);
            },
        });

        // Right-click menu on the output (popup launchers + plugin entries). The
        // shared setup routes through the same contextMenuStore the forged
        // <ContextMenu> renders. We render plain forged lines, not the shared
        // `.output_msg` wrappers, so opt out of the timestamp/type toggles and
        // copy-as-image / save-as-HTML entries — they operate on that structure
        // and would no-op here.
        const teardownContextMenu = setupOutputContextMenu(output, { messageWrappersSupported: false });

        // When the transport is down there is no persistent connect button — the
        // action lives inline in the log: a "Polacz" prompt is printed while
        // disconnected and removed the moment the socket opens. We keep a handle
        // to the current prompt so a flurry of disconnects can't stack duplicates.
        let connectPrompt: HTMLElement | null = null;
        const removeConnectPrompt = () => {
            connectPrompt?.remove();
            connectPrompt = null;
        };
        const showConnectPrompt = () => {
            if (connectPrompt) return;
            const el = document.createElement('p');
            el.className = 'connect-prompt';
            const button = document.createElement('button');
            button.type = 'button';
            button.className = 'connect-link';
            button.textContent = 'Polacz z Arkadia';
            button.addEventListener('click', () => mudClient.connect());
            el.appendChild(button);
            connectPrompt = el;
            // Transient chrome — not mirrored into the sticky footer.
            handler.appendNode(el);
        };
        const offConnect = eventBus.on('client.connect', removeConnectPrompt);
        const offDisconnect = eventBus.on('client.disconnect', showConnectPrompt);
        if (!mudClient.isSocketOpen()) showConnectPrompt();

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
            offConnect();
            offDisconnect();
            offPlaque();
            handler.destroy();
        };
    }, []);

    return (
        <div id="main_text_output_msg_wrapper" ref={outputRef}>
            <div id="split-bottom" className="split-hidden" ref={splitBottomRef}>
                <div id="split-handle" ref={splitHandleRef} />
                <div id="sticky-area" ref={stickyAreaRef} />
            </div>
        </div>
    );
}
