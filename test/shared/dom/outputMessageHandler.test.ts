import { AnsiAwareBuffer } from '@client/ansi/FormatState';
import { setupOutputMessageHandler, type OutputMessageHandler } from '@shared/dom/outputMessageHandler';

type MessageListener = (message?: string | AnsiAwareBuffer, type?: string, timestamp?: number) => void;

function makeFakeClient() {
    const listeners = new Set<MessageListener>();
    return {
        on: (event: 'message', listener: MessageListener) => {
            listeners.add(listener);
        },
        off: (event: 'message', listener: MessageListener) => {
            listeners.delete(listener);
        },
        emit: (message?: string | AnsiAwareBuffer, type?: string, timestamp?: number) => {
            for (const listener of listeners) listener(message, type, timestamp);
        },
    };
}

function defineGeometry(el: HTMLElement, geometry: { scrollTop?: number; scrollHeight?: number; clientHeight?: number }) {
    for (const [key, value] of Object.entries(geometry)) {
        Object.defineProperty(el, key, { configurable: true, writable: true, value });
    }
}

function setupDom() {
    document.body.innerHTML = `
      <div id="main_text_output_msg_wrapper">
        <div id="split-bottom" class="split-hidden">
          <div id="split-handle"></div>
          <div id="sticky-area"></div>
        </div>
      </div>
    `;
    const outputWrapper = document.getElementById('main_text_output_msg_wrapper') as HTMLElement;
    // jsdom's scrollTop has no setter by default; the handler assigns to it
    // (auto-scroll to bottom) regardless of whether a test exercises geometry.
    Object.defineProperty(outputWrapper, 'scrollTop', { configurable: true, writable: true, value: 0 });

    return {
        outputWrapper,
        splitBottom: document.getElementById('split-bottom') as HTMLElement,
        splitHandle: document.getElementById('split-handle') as HTMLElement,
        stickyArea: document.getElementById('sticky-area') as HTMLElement,
    };
}

describe('setupOutputMessageHandler', () => {
    let handler: OutputMessageHandler | undefined;

    afterEach(() => {
        handler?.destroy();
        handler = undefined;
    });

    test('appends the default .output_msg wrapper for a string message', () => {
        const { outputWrapper, splitBottom, splitHandle, stickyArea } = setupDom();
        const client = makeFakeClient();

        handler = setupOutputMessageHandler(client, {
            outputWrapper, splitBottom, splitHandle, stickyArea, stickyLines: 5,
        });

        client.emit('hello world', 'comm');

        const msg = outputWrapper.querySelector('.output_msg');
        expect(msg).not.toBeNull();
        expect(msg?.classList.contains('comm')).toBe(true);
        expect(msg?.querySelector('.output_msg_content')?.textContent).toBe('hello world');
    });

    test('skips undefined/null messages', () => {
        const { outputWrapper, splitBottom, splitHandle, stickyArea } = setupDom();
        const client = makeFakeClient();

        handler = setupOutputMessageHandler(client, {
            outputWrapper, splitBottom, splitHandle, stickyArea, stickyLines: 5,
        });

        client.emit(undefined, 'comm');

        expect(outputWrapper.querySelectorAll('.output_msg').length).toBe(0);
    });

    test('calls AnsiAwareBuffer.notifyRender once the buffer is appended', () => {
        const { outputWrapper, splitBottom, splitHandle, stickyArea } = setupDom();
        const client = makeFakeClient();
        const buffer = new AnsiAwareBuffer('tracked line');
        const onRender = jest.fn();
        buffer.onRender(onRender);

        handler = setupOutputMessageHandler(client, {
            outputWrapper, splitBottom, splitHandle, stickyArea, stickyLines: 5,
        });

        client.emit(buffer, 'comm');

        expect(onRender).toHaveBeenCalledTimes(1);
    });

    test('a custom buildMessageNode can render a different shape and skip messages', () => {
        const { outputWrapper, splitBottom, splitHandle, stickyArea } = setupDom();
        const client = makeFakeClient();

        handler = setupOutputMessageHandler(client, {
            outputWrapper, splitBottom, splitHandle, stickyArea, stickyLines: 5,
            buildMessageNode: (message, type) => {
                if (message === undefined || message === null) return null;
                if (type === 'skip-me') return null;
                const p = document.createElement('p');
                p.textContent = typeof message === 'string' ? message : message.text;
                return p;
            },
        });

        client.emit('kept', 'comm');
        client.emit('dropped', 'skip-me');

        expect(outputWrapper.querySelectorAll('.output_msg').length).toBe(0);
        const lines = outputWrapper.querySelectorAll('p');
        expect(lines.length).toBe(1);
        expect(lines[0].textContent).toBe('kept');
    });

    test('opens split view and mirrors trailing lines into the sticky area when scrolled away from bottom', async () => {
        const { outputWrapper, splitBottom, splitHandle, stickyArea } = setupDom();
        const client = makeFakeClient();

        handler = setupOutputMessageHandler(client, {
            outputWrapper, splitBottom, splitHandle, stickyArea, stickyLines: 3,
        });

        for (let i = 1; i <= 5; i++) client.emit(`line ${i}`, 'comm');
        expect(handler.isSplitView()).toBe(false);
        expect(splitBottom.classList.contains('split-hidden')).toBe(true);

        // Each append suppresses (re)detection for 250ms to avoid flicker while
        // output is streaming in — clear that window before simulating the scroll.
        await new Promise(resolve => setTimeout(resolve, 260));

        // Scroll away from the bottom.
        defineGeometry(outputWrapper, { scrollTop: 0, clientHeight: 100, scrollHeight: 1000 });
        defineGeometry(splitBottom, { clientHeight: 0 });
        outputWrapper.dispatchEvent(new Event('scroll'));

        expect(handler.isSplitView()).toBe(true);
        expect(splitBottom.classList.contains('split-hidden')).toBe(false);
        // Sticky area mirrors at most `stickyLines` of the most recent lines.
        expect(stickyArea.children.length).toBe(3);

        // A new message while in split view mirrors incrementally rather than
        // via a full rebuild.
        client.emit('line 6', 'comm');
        expect(stickyArea.children.length).toBe(3);

        // The open transition itself suppresses (re)detection for 150ms too.
        await new Promise(resolve => setTimeout(resolve, 160));

        // Scrolling back to the bottom closes split view and clears the mirror.
        defineGeometry(outputWrapper, { scrollTop: 900, clientHeight: 100, scrollHeight: 1000 });
        outputWrapper.dispatchEvent(new Event('scroll'));

        expect(handler.isSplitView()).toBe(false);
        expect(splitBottom.classList.contains('split-hidden')).toBe(true);
        expect(stickyArea.children.length).toBe(0);
    });

    test('suppressSplitView blocks split-view (re)detection for the given window', () => {
        const { outputWrapper, splitBottom, splitHandle, stickyArea } = setupDom();
        const client = makeFakeClient();

        handler = setupOutputMessageHandler(client, {
            outputWrapper, splitBottom, splitHandle, stickyArea, stickyLines: 3,
        });

        handler.suppressSplitView(10_000);
        defineGeometry(outputWrapper, { scrollTop: 0, clientHeight: 100, scrollHeight: 1000 });
        defineGeometry(splitBottom, { clientHeight: 0 });
        outputWrapper.dispatchEvent(new Event('scroll'));

        expect(handler.isSplitView()).toBe(false);
        expect(splitBottom.classList.contains('split-hidden')).toBe(true);
    });

    test('trims oldest messages in batches once over maxElements + trimSlack while not in split view', () => {
        const { outputWrapper, splitBottom, splitHandle, stickyArea } = setupDom();
        const client = makeFakeClient();

        handler = setupOutputMessageHandler(client, {
            outputWrapper, splitBottom, splitHandle, stickyArea, stickyLines: 3,
            maxElements: 10, trimSlack: 5,
        });

        for (let i = 1; i <= 15; i++) client.emit(`line ${i}`, 'comm');
        // At maxElements + trimSlack (15) — not yet over the threshold, no trim.
        expect(outputWrapper.querySelectorAll('.output_msg').length).toBe(15);

        client.emit('line 16', 'comm');
        // Crossed the trim threshold — batched back down to maxElements.
        expect(outputWrapper.querySelectorAll('.output_msg').length).toBe(10);
        const remaining = Array.from(outputWrapper.querySelectorAll('.output_msg_content')).map(el => el.textContent);
        expect(remaining[0]).toBe('line 7');
        expect(remaining[remaining.length - 1]).toBe('line 16');
    });

    test('appendNode without a rebuild is not mirrored into the sticky area', () => {
        const { outputWrapper, splitBottom, splitHandle, stickyArea } = setupDom();
        const client = makeFakeClient();

        handler = setupOutputMessageHandler(client, {
            outputWrapper, splitBottom, splitHandle, stickyArea, stickyLines: 3,
        });

        defineGeometry(outputWrapper, { scrollTop: 0, clientHeight: 100, scrollHeight: 1000 });
        defineGeometry(splitBottom, { clientHeight: 0 });
        outputWrapper.dispatchEvent(new Event('scroll'));
        expect(handler.isSplitView()).toBe(true);

        const transient = document.createElement('p');
        transient.textContent = 'connect prompt';
        handler.appendNode(transient);

        expect(outputWrapper.contains(transient)).toBe(true);
        expect(stickyArea.children.length).toBe(0);
    });

    test('destroy detaches listeners so further messages and scroll events are inert', () => {
        const { outputWrapper, splitBottom, splitHandle, stickyArea } = setupDom();
        const client = makeFakeClient();

        const h = setupOutputMessageHandler(client, {
            outputWrapper, splitBottom, splitHandle, stickyArea, stickyLines: 3,
        });
        h.destroy();
        handler = undefined;

        client.emit('after destroy', 'comm');
        expect(outputWrapper.querySelectorAll('.output_msg').length).toBe(0);
    });
});
