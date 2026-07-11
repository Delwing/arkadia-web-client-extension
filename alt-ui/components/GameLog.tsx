import { useEffect, useRef } from 'react';
import { AnsiAwareBuffer } from '@client/ansi/FormatState';
import eventBus from '@modules/core/eventBus';

const MAX_LINES = 500;

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
 */
export default function GameLog() {
    const outputRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const output = outputRef.current;
        if (!output) return;

        const appendLine = (el: HTMLElement) => {
            const atBottom = output.scrollTop + output.clientHeight >= output.scrollHeight - 6;
            output.appendChild(el);
            while (output.childElementCount > MAX_LINES && output.firstElementChild) {
                output.removeChild(output.firstElementChild);
            }
            if (atBottom) output.scrollTop = output.scrollHeight;
        };

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

        return off;
    }, []);

    return <div id="main_text_output_msg_wrapper" ref={outputRef} />;
}
