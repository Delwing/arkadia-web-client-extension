/**
 * EXPERIMENT — the game output rendered by xterm.js, to measure against the
 * imperative and React outputs. Opt in with `?output=xterm` (xterm's DOM
 * renderer) or `?output=xterm-webgl` (its WebGL renderer) on the stock page.
 * Loaded on demand, so it costs the normal page nothing. See
 * e2e/output-flood.bench.ts.
 *
 * Each message is serialised back to ANSI (the client hands the output
 * `AnsiAwareBuffer`s that triggers may have recoloured) and written to the
 * terminal. The palette is the client's own xterm table, so colours match.
 *
 * Not in the prototype, and the real work of a switch: clickable/hover links
 * (would be OSC 8 + a link handler), timestamps and message types, the
 * buffer's onRender hooks (they expect a DOM container), message flair, split
 * view, and anything that reads the output DOM (copy as image, completions,
 * the context menu). The cap is xterm's scrollback, which counts terminal
 * rows, where the other outputs count messages.
 */
import '@xterm/xterm/css/xterm.css';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { AnsiAwareBuffer, type FormatColor, type FormatStateSnapshot } from '@client/ansi/FormatState.ts';
import { colorCodes } from '@modules/core/Colors.ts';
import { decodeOutputEntities } from '@shared/dom/outputText.ts';
import type { OutputMessageHandler } from '@shared/dom/outputMessageHandler.ts';

export type XtermOutputMode = 'xterm' | 'xterm-webgl';

type Message = string | AnsiAwareBuffer;

type MessageClient = {
    on(event: 'message', listener: (message?: Message, type?: string, timestamp?: number) => void): void;
    off(event: 'message', listener: (message?: Message, type?: string, timestamp?: number) => void): void;
};

const ESC = '\x1b[';

function colorParams(color: FormatColor, base: 38 | 48): string {
    if (color.space === 'indexed') return `${base};5;${color.index}`;
    if (color.space === 'rgb') return `${base};2;${color.r};${color.g};${color.b}`;
    const hex = color.color.replace('#', '');
    const full = hex.length === 3 ? hex.split('').map((c) => c + c).join('') : hex;
    const n = parseInt(full.slice(0, 6), 16);
    return `${base};2;${(n >> 16) & 255};${(n >> 8) & 255};${n & 255}`;
}

function sgr(state: FormatStateSnapshot): string {
    const params: string[] = [];
    if (state.bold) params.push('1');
    if (state.italic) params.push('3');
    if (state.underline || state.hyperlink) params.push('4');
    if (state.inverse) params.push('7');
    if (state.strikethrough) params.push('9');
    if (state.foreground) params.push(colorParams(state.foreground, 38));
    if (state.background) params.push(colorParams(state.background, 48));
    return params.length ? `${ESC}${params.join(';')}m` : '';
}

/** A message as terminal input: ANSI-coloured, CRLF line ends. */
export function toAnsi(message: Message): string {
    let text = '';
    if (typeof message === 'string') {
        // String messages are HTML in the other outputs; here only their text.
        text = decodeOutputEntities(message.replace(/<[^>]*>/g, ''));
    } else {
        for (const segment of message.getSegments()) {
            const open = segment.state ? sgr(segment.state) : '';
            text += open ? `${open}${segment.text}${ESC}0m` : segment.text;
        }
    }
    return text.replace(/\r?\n/g, '\r\n') + '\r\n';
}

function theme() {
    const x = colorCodes.xterm as string[];
    return {
        background: '#00000000',
        black: x[0], red: x[1], green: x[2], yellow: x[3], blue: x[4], magenta: x[5], cyan: x[6], white: x[7],
        brightBlack: x[8], brightRed: x[9], brightGreen: x[10], brightYellow: x[11],
        brightBlue: x[12], brightMagenta: x[13], brightCyan: x[14], brightWhite: x[15],
        extendedAnsi: x.slice(16),
    };
}

/**
 * Mount xterm.js over `outputWrapper` (which stops scrolling itself: the
 * terminal has its own viewport). Returns the same handle the imperative
 * output does.
 */
export async function mountXtermOutput(
    client: MessageClient,
    { outputWrapper, mode, maxElements }: {
        outputWrapper: HTMLElement;
        mode: XtermOutputMode;
        maxElements: () => number;
    },
): Promise<OutputMessageHandler> {
    const computed = getComputedStyle(outputWrapper);
    outputWrapper.style.overflow = 'hidden';
    const host = document.createElement('div');
    host.className = 'xterm-output-host';
    host.style.cssText = 'position:absolute;inset:0 8px;';
    outputWrapper.prepend(host);

    const term = new Terminal({
        scrollback: maxElements(),
        fontFamily: computed.fontFamily,
        fontSize: parseFloat(computed.fontSize) || 12,
        lineHeight: 1.2,
        convertEol: false,
        disableStdin: true,
        cursorStyle: 'bar',
        cursorInactiveStyle: 'none',
        allowTransparency: true,
        theme: theme(),
    });
    const fit = new FitAddon();
    term.loadAddon(fit);
    term.open(host);

    if (mode === 'xterm-webgl') {
        try {
            const { WebglAddon } = await import('@xterm/addon-webgl');
            term.loadAddon(new WebglAddon());
        } catch (err) {
            console.warn('[xterm output] WebGL renderer unavailable, staying on the DOM renderer', err);
        }
    }

    fit.fit();
    const resize = new ResizeObserver(() => fit.fit());
    resize.observe(host);

    const onMessage = (message?: Message) => {
        if (message === undefined || message === null) return;
        term.write(toAnsi(message));
    };
    client.on('message', onMessage);

    // For the bench: resolves once everything written so far is parsed, and
    // the rows the terminal holds (it has no DOM line per message to count).
    const hooks = window as unknown as { __outputFlushed?: () => Promise<void>; __outputLineCount?: () => number };
    hooks.__outputFlushed = () => new Promise((resolve) => term.write('', resolve));
    hooks.__outputLineCount = () => term.buffer.active.length;

    return {
        destroy() {
            client.off('message', onMessage);
            resize.disconnect();
            term.dispose();
            host.remove();
        },
        isSplitView: () => false,
        suppressSplitView: () => undefined,
        appendNode(node: HTMLElement) {
            term.write(toAnsi(node.textContent ?? ''));
        },
    };
}
