import { useEffect, useRef } from 'react';
import { AnsiAwareBuffer } from '@client/ansi/FormatState';
import eventBus from '@modules/core/eventBus';
import mudClient from '@web/MudClient';
import { setupOutputContextMenu } from '@web/outputContextMenu';
import { buildCharPlaque } from './charPlaque';

const MAX_LINES = 500;
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

/**
 * The game log. Output is high-throughput and `AnsiAwareBuffer.toDom()` yields
 * raw DOM nodes, so the log is rendered imperatively into a ref'd container
 * (subscribing to the 'message' event) rather than through React state.
 *
 * Split-scroll: the wrapper carries a sticky `#split-bottom` (mirroring the stock
 * output wrapper — `#split-handle` + `#sticky-area`). Scrolling up into scrollback
 * reveals it, pinning the newest `STICKY_LINES` at the bottom so live output stays
 * visible while you read history; scrolling back to the bottom hides it again. New
 * lines are inserted *before* `#split-bottom` so it always stays last.
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

        // Split-view is off (pinned to bottom) until the user scrolls up. While on,
        // trimming and auto-scroll pause so the scrollback the user is reading is stable.
        let isSplitView = false;
        // Debounce window that swallows split-view toggles right after a change or
        // during output bursts, so the split view doesn't flicker.
        let suppressSplitViewUntil = 0;

        // At bottom when the scroll position (plus the sticky footer height) reaches
        // the end. splitBottom is display:none while hidden, so its height is 0 then.
        const isAtBottom = () =>
            output.scrollTop + output.clientHeight + splitBottom.clientHeight >= output.scrollHeight - 1;

        const refreshStickyArea = () => {
            stickyArea.replaceChildren();
            const nodes = Array.from(output.children).filter((n) => n !== splitBottom);
            const start = Math.max(0, nodes.length - STICKY_LINES);
            for (let i = start; i < nodes.length; i++) {
                stickyArea.appendChild(nodes[i].cloneNode(true));
            }
        };

        const appendLine = (el: HTMLElement) => {
            const atBottom = isAtBottom();
            // Keep #split-bottom last: insert output before it, never after.
            output.insertBefore(el, splitBottom);

            // Trim only while pinned to the bottom — removing the oldest nodes while
            // the user reads scrollback would shift what they're looking at. (The
            // count excludes the always-present #split-bottom.)
            if (!isSplitView) {
                while (output.childElementCount - 1 > MAX_LINES) {
                    const first = output.firstElementChild;
                    if (!first || first === splitBottom) break;
                    output.removeChild(first);
                }
            }

            if (isSplitView) {
                // Mirror the new line into the sticky footer and cap its length.
                stickyArea.appendChild(el.cloneNode(true));
                while (stickyArea.childElementCount > STICKY_LINES && stickyArea.firstElementChild) {
                    stickyArea.removeChild(stickyArea.firstElementChild);
                }
            } else if (atBottom) {
                output.scrollTop = output.scrollHeight;
            }
        };

        // ── Split-view toggling ─────────────────────────────────────────────────
        const checkSplitView = () => {
            if (Date.now() < suppressSplitViewUntil) return;
            if (isAtBottom()) {
                if (isSplitView) {
                    isSplitView = false;
                    suppressSplitViewUntil = Date.now() + 150;
                    splitBottom.classList.add('split-hidden');
                    stickyArea.replaceChildren();
                }
            } else if (!isSplitView) {
                isSplitView = true;
                suppressSplitViewUntil = Date.now() + 150;
                splitBottom.classList.remove('split-hidden');
                refreshStickyArea();
            }
        };
        output.addEventListener('scroll', checkSplitView);

        // Preemptively open the split view on scroll-up wheel to avoid a 1-frame
        // jitter: 'wheel' fires before the compositor processes the scroll.
        const onWheel = (e: WheelEvent) => {
            if (
                e.deltaY < 0 &&
                !isSplitView &&
                Date.now() >= suppressSplitViewUntil &&
                output.scrollHeight > output.clientHeight &&
                isAtBottom()
            ) {
                isSplitView = true;
                suppressSplitViewUntil = Date.now() + 150;
                splitBottom.classList.remove('split-hidden');
                refreshStickyArea();
            }
        };
        output.addEventListener('wheel', onWheel, { passive: true });

        // ── Split-handle drag (resize the sticky footer) ────────────────────────
        let isDraggingSplit = false;
        const onSplitDragMove = (e: MouseEvent | TouchEvent) => {
            if (!isDraggingSplit) return;
            e.preventDefault();
            const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;
            const wrapperRect = output.getBoundingClientRect();
            const newHeight = Math.max(60, wrapperRect.bottom - clientY);
            splitBottom.style.height = `${newHeight}px`;
        };
        const onSplitDragEnd = () => {
            if (!isDraggingSplit) return;
            isDraggingSplit = false;
            document.body.style.cursor = '';
            document.body.style.userSelect = '';
            document.removeEventListener('mousemove', onSplitDragMove);
            document.removeEventListener('mouseup', onSplitDragEnd);
            document.removeEventListener('touchmove', onSplitDragMove);
            document.removeEventListener('touchend', onSplitDragEnd);
            suppressSplitViewUntil = Date.now() + 150;
            refreshStickyArea();
        };
        const onSplitDragStart = (e: MouseEvent | TouchEvent) => {
            if (e.type === 'mousedown') e.preventDefault();
            isDraggingSplit = true;
            // Hold the split view open for the whole drag.
            suppressSplitViewUntil = Infinity;
            document.body.style.cursor = 'ns-resize';
            document.body.style.userSelect = 'none';
            document.addEventListener('mousemove', onSplitDragMove);
            document.addEventListener('mouseup', onSplitDragEnd);
            document.addEventListener('touchmove', onSplitDragMove, { passive: false });
            document.addEventListener('touchend', onSplitDragEnd);
        };
        splitHandle.addEventListener('mousedown', onSplitDragStart);
        splitHandle.addEventListener('touchstart', onSplitDragStart, { passive: true });

        // Keep the view pinned to the bottom when the wrapper resizes (map/footer
        // toggling, window resize) — unless the user has scrolled up into split view.
        let previousHeight = output.clientHeight;
        const resizeObserver = new ResizeObserver(() => {
            const newHeight = output.clientHeight;
            if (newHeight === previousHeight) return;
            const wasAtBottom =
                output.scrollTop + previousHeight + splitBottom.clientHeight >= output.scrollHeight - 1;
            previousHeight = newHeight;
            if (!isSplitView && wasAtBottom) {
                requestAnimationFrame(() => {
                    output.scrollTop = output.scrollHeight;
                });
            }
        });
        resizeObserver.observe(output);

        // Right-click menu on the output (timestamps/types toggles, copy-as-image,
        // popup launchers). The shared setup routes through the same contextMenuStore
        // the forged <ContextMenu> renders.
        const teardownContextMenu = setupOutputContextMenu(output);

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
            appendLine(el);
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
            appendLine(buildCharPlaque(info));
        });

        const off = eventBus.on('message', (message?: string | AnsiAwareBuffer, type?: string) => {
            if (message === undefined) return;

            // room.short renders inline in the log flow with the forged location style.
            if (type === 'room.short') {
                const name = textOf(message).trim();
                if (!name) return;
                const el = document.createElement('div');
                el.className = 'locale';
                el.textContent = name;
                appendLine(el);
                return;
            }

            const line = document.createElement('p');
            if (type) line.className = `t-${type.replace(/[^a-z0-9]+/gi, '-')}`;
            if (message instanceof AnsiAwareBuffer) {
                line.appendChild(message.toDom());
            } else {
                line.textContent = decodeEntities(message);
            }
            appendLine(line);
        });

        return () => {
            output.removeEventListener('scroll', checkSplitView);
            output.removeEventListener('wheel', onWheel);
            splitHandle.removeEventListener('mousedown', onSplitDragStart);
            splitHandle.removeEventListener('touchstart', onSplitDragStart);
            document.removeEventListener('mousemove', onSplitDragMove);
            document.removeEventListener('mouseup', onSplitDragEnd);
            document.removeEventListener('touchmove', onSplitDragMove);
            document.removeEventListener('touchend', onSplitDragEnd);
            resizeObserver.disconnect();
            teardownContextMenu();
            offConnect();
            offDisconnect();
            offPlaque();
            off();
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
