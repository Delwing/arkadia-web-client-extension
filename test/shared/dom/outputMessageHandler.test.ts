import { AnsiAwareBuffer } from '@client/ansi/FormatState';
import {
    setOutputMessageTypeVisibility,
    setOutputTimestampVisibility,
    setupOutputMessageHandler,
    type OutputMessageHandler,
} from '@shared/dom/outputMessageHandler';

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

function defineGeometry(el: HTMLElement, geometry: { scrollTop?: number; scrollHeight?: number; clientHeight?: number; offsetHeight?: number }) {
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
    // clientHeight is fixed up front (jsdom reports 0) so that a test changing
    // only scrollTop later reads as a scroll, not as a wrapper resize — the
    // handler ignores split-view detection on the scroll a resize emits.
    Object.defineProperty(outputWrapper, 'scrollTop', { configurable: true, writable: true, value: 0 });
    Object.defineProperty(outputWrapper, 'clientHeight', { configurable: true, writable: true, value: 100 });

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

    test('the pane lies over the last lines, and only the real bottom closes it', async () => {
        const { outputWrapper, splitBottom, splitHandle, stickyArea } = setupDom();
        const client = makeFakeClient();
        handler = setupOutputMessageHandler(client, {
            outputWrapper, splitBottom, splitHandle, stickyArea, stickyLines: 3,
        });
        for (let i = 1; i <= 5; i++) client.emit(`line ${i}`, 'comm');
        await new Promise(resolve => setTimeout(resolve, 260));

        defineGeometry(splitBottom, { offsetHeight: 120, clientHeight: 120 });
        defineGeometry(outputWrapper, { scrollTop: 0, clientHeight: 100, scrollHeight: 1000 });
        outputWrapper.dispatchEvent(new Event('scroll'));
        expect(handler.isSplitView()).toBe(true);
        // No height added below the text: opening and closing never change the scroll height
        expect(splitBottom.style.marginTop).toBe('-120px');

        await new Promise(resolve => setTimeout(resolve, 160));
        // Within the pane's height of the bottom is not the bottom
        defineGeometry(outputWrapper, { scrollTop: 800, clientHeight: 100, scrollHeight: 1000 });
        outputWrapper.dispatchEvent(new Event('scroll'));
        expect(handler.isSplitView()).toBe(true);

        defineGeometry(outputWrapper, { scrollTop: 900, clientHeight: 100, scrollHeight: 1000 });
        outputWrapper.dispatchEvent(new Event('scroll'));
        expect(handler.isSplitView()).toBe(false);
    });

    test('does not open split view on the scroll event a wrapper resize emits', async () => {
        const { outputWrapper, splitBottom, splitHandle, stickyArea } = setupDom();
        const client = makeFakeClient();

        handler = setupOutputMessageHandler(client, {
            outputWrapper, splitBottom, splitHandle, stickyArea, stickyLines: 3,
        });

        for (let i = 1; i <= 5; i++) client.emit(`line ${i}`, 'comm');
        await new Promise(resolve => setTimeout(resolve, 260));

        // The window shrinks: the wrapper gets shorter, the scrollback rewraps
        // and grows, so the view is no longer at the bottom and the browser
        // fires a scroll event for it. The user never scrolled.
        defineGeometry(outputWrapper, { scrollTop: 0, clientHeight: 60, scrollHeight: 1000 });
        defineGeometry(splitBottom, { clientHeight: 0 });
        outputWrapper.dispatchEvent(new Event('scroll'));

        expect(handler.isSplitView()).toBe(false);
        expect(splitBottom.classList.contains('split-hidden')).toBe(true);

        // A genuine scroll at the new size still opens it. (The resize re-pinned
        // the view to the bottom, so scroll back up first.)
        await new Promise(resolve => setTimeout(resolve, 260));
        defineGeometry(outputWrapper, { scrollTop: 0 });
        outputWrapper.dispatchEvent(new Event('scroll'));

        expect(handler.isSplitView()).toBe(true);
    });

    test('keeps split view open across a wrapper resize while the user is scrolled up', async () => {
        const { outputWrapper, splitBottom, splitHandle, stickyArea } = setupDom();
        const client = makeFakeClient();

        handler = setupOutputMessageHandler(client, {
            outputWrapper, splitBottom, splitHandle, stickyArea, stickyLines: 3,
        });

        for (let i = 1; i <= 5; i++) client.emit(`line ${i}`, 'comm');
        await new Promise(resolve => setTimeout(resolve, 260));

        defineGeometry(outputWrapper, { scrollTop: 0, scrollHeight: 1000 });
        defineGeometry(splitBottom, { clientHeight: 0 });
        outputWrapper.dispatchEvent(new Event('scroll'));
        expect(handler.isSplitView()).toBe(true);

        await new Promise(resolve => setTimeout(resolve, 160));

        // Resizing rewraps the scrollback so that the scroll offset now sits at
        // the bottom — that must not close the split view.
        defineGeometry(outputWrapper, { scrollTop: 400, clientHeight: 600, scrollHeight: 1000 });
        outputWrapper.dispatchEvent(new Event('scroll'));

        expect(handler.isSplitView()).toBe(true);
        expect(splitBottom.classList.contains('split-hidden')).toBe(false);
    });

    test('wheeling down at the bottom closes a split view a resize left stranded', async () => {
        const { outputWrapper, splitBottom, splitHandle, stickyArea } = setupDom();
        const client = makeFakeClient();

        handler = setupOutputMessageHandler(client, {
            outputWrapper, splitBottom, splitHandle, stickyArea, stickyLines: 3,
        });

        for (let i = 1; i <= 5; i++) client.emit(`line ${i}`, 'comm');
        await new Promise(resolve => setTimeout(resolve, 260));

        defineGeometry(outputWrapper, { scrollTop: 0, scrollHeight: 1000 });
        defineGeometry(splitBottom, { clientHeight: 0 });
        outputWrapper.dispatchEvent(new Event('scroll'));
        expect(handler.isSplitView()).toBe(true);

        // Growing the wrapper clamps the offset back to the bottom, where the
        // browser emits no further scroll events — wheeling down is the only
        // gesture left, so it has to close the split view.
        defineGeometry(outputWrapper, { scrollTop: 400, clientHeight: 600, scrollHeight: 1000 });
        outputWrapper.dispatchEvent(new Event('scroll'));
        expect(handler.isSplitView()).toBe(true);

        await new Promise(resolve => setTimeout(resolve, 260));
        outputWrapper.dispatchEvent(new WheelEvent('wheel', { deltaY: 120 }));

        expect(handler.isSplitView()).toBe(false);
        expect(splitBottom.classList.contains('split-hidden')).toBe(true);
    });

    test('a resize that makes the whole scrollback fit closes split view', async () => {
        const { outputWrapper, splitBottom, splitHandle, stickyArea } = setupDom();
        const client = makeFakeClient();

        handler = setupOutputMessageHandler(client, {
            outputWrapper, splitBottom, splitHandle, stickyArea, stickyLines: 3,
        });

        for (let i = 1; i <= 5; i++) client.emit(`line ${i}`, 'comm');
        await new Promise(resolve => setTimeout(resolve, 260));

        defineGeometry(outputWrapper, { scrollTop: 0, scrollHeight: 1000 });
        defineGeometry(splitBottom, { clientHeight: 0 });
        outputWrapper.dispatchEvent(new Event('scroll'));
        expect(handler.isSplitView()).toBe(true);

        // Nothing left to scroll: no scroll event could ever close it again.
        defineGeometry(outputWrapper, { scrollTop: 0, clientHeight: 1000, scrollHeight: 1000 });
        outputWrapper.dispatchEvent(new Event('scroll'));

        expect(handler.isSplitView()).toBe(false);
        expect(splitBottom.classList.contains('split-hidden')).toBe(true);
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

    test('trims to maxElements even after lines were removed behind its back', () => {
        const { outputWrapper, splitBottom, splitHandle, stickyArea } = setupDom();
        const client = makeFakeClient();

        handler = setupOutputMessageHandler(client, {
            outputWrapper, splitBottom, splitHandle, stickyArea, stickyLines: 3,
            maxElements: 10, trimSlack: 5,
        });

        for (let i = 1; i <= 14; i++) client.emit(`old ${i}`, 'comm');
        // Something else clears the output (only the split pane stays).
        outputWrapper.querySelectorAll('.output_msg').forEach(el => el.remove());

        for (let i = 1; i <= 15; i++) client.emit(`line ${i}`, 'comm');
        expect(outputWrapper.querySelectorAll('.output_msg').length).toBe(15);

        client.emit('line 16', 'comm');
        const remaining = Array.from(outputWrapper.querySelectorAll('.output_msg_content')).map(el => el.textContent);
        expect(remaining).toHaveLength(10);
        expect(remaining[0]).toBe('line 7');
        expect(outputWrapper.lastElementChild).toBe(splitBottom);
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

    test('turns AnsiAwareBuffer.flair into the msg-flair class pair', () => {
        const { outputWrapper, splitBottom, splitHandle, stickyArea } = setupDom();
        const client = makeFakeClient();

        handler = setupOutputMessageHandler(client, {
            outputWrapper, splitBottom, splitHandle, stickyArea, stickyLines: 3,
        });

        const buffer = new AnsiAwareBuffer('Masz przy sobie lampe.');
        buffer.flair = 'ekwipunek';
        client.emit(buffer, 'text');

        const wrapper = outputWrapper.querySelector('.output_msg') as HTMLElement;
        expect(wrapper.classList.contains('msg-flair')).toBe(true);
        expect(wrapper.classList.contains('msg-flair-ekwipunek')).toBe(true);
    });

    test('leaves unflaired messages untouched', () => {
        const { outputWrapper, splitBottom, splitHandle, stickyArea } = setupDom();
        const client = makeFakeClient();

        handler = setupOutputMessageHandler(client, {
            outputWrapper, splitBottom, splitHandle, stickyArea, stickyLines: 3,
        });

        client.emit(new AnsiAwareBuffer('Jestes lekko zmeczony.'), 'text');

        const wrapper = outputWrapper.querySelector('.output_msg') as HTMLElement;
        expect(wrapper.classList.contains('msg-flair')).toBe(false);
    });

    test('ignores a flair name that is not a safe class token', () => {
        const { outputWrapper, splitBottom, splitHandle, stickyArea } = setupDom();
        const client = makeFakeClient();

        handler = setupOutputMessageHandler(client, {
            outputWrapper, splitBottom, splitHandle, stickyArea, stickyLines: 3,
        });

        // classList.add throws on a token containing whitespace, which would
        // take the whole message down with it.
        const buffer = new AnsiAwareBuffer('Masz przy sobie lampe.');
        buffer.flair = 'ekwipunek zly';
        client.emit(buffer, 'text');

        const wrapper = outputWrapper.querySelector('.output_msg') as HTMLElement;
        expect(wrapper).not.toBeNull();
        expect(wrapper.classList.contains('msg-flair')).toBe(false);
    });

    test('the sticky-view mirror keeps the flair class', async () => {
        const { outputWrapper, splitBottom, splitHandle, stickyArea } = setupDom();
        const client = makeFakeClient();

        handler = setupOutputMessageHandler(client, {
            outputWrapper, splitBottom, splitHandle, stickyArea, stickyLines: 3,
        });

        const buffer = new AnsiAwareBuffer('Zauwazasz przy nim rubin.');
        buffer.flair = 'lup';
        client.emit(buffer, 'text');

        // Each append suppresses split-view detection for 250ms; clear it first.
        await new Promise(resolve => setTimeout(resolve, 260));

        // Scroll up: the mirror is rebuilt by calling buildMessageNode again.
        // This is exactly what onRender cannot survive — it is cleared after it
        // fires once — which is why the marker rides the buffer instead.
        defineGeometry(outputWrapper, { scrollTop: 0, clientHeight: 100, scrollHeight: 1000 });
        defineGeometry(splitBottom, { clientHeight: 0 });
        outputWrapper.dispatchEvent(new Event('scroll'));

        const mirrored = stickyArea.querySelector('.output_msg') as HTMLElement;
        expect(mirrored).not.toBeNull();
        expect(mirrored.classList.contains('msg-flair-lup')).toBe(true);
    });

    describe('timestamp and message-type spans', () => {
        afterEach(() => {
            setOutputTimestampVisibility(false);
            setOutputMessageTypeVisibility(false);
        });

        const chrome = (msg: Element) =>
            [...msg.querySelector('.output_msg_text')!.children].map(el => el.className);

        test('are not built while their toggles are off', () => {
            const { outputWrapper, splitBottom, splitHandle, stickyArea } = setupDom();
            const client = makeFakeClient();
            handler = setupOutputMessageHandler(client, { outputWrapper, splitBottom, splitHandle, stickyArea, stickyLines: 5 });

            client.emit('hello', 'comm', 1000);

            expect(chrome(outputWrapper.querySelector('.output_msg')!)).toEqual(['output_msg_content']);
        });

        test('are added to existing lines in order when a toggle turns on, and built for new ones', () => {
            const { outputWrapper, splitBottom, splitHandle, stickyArea } = setupDom();
            const client = makeFakeClient();
            handler = setupOutputMessageHandler(client, { outputWrapper, splitBottom, splitHandle, stickyArea, stickyLines: 5 });
            const at = new Date(2026, 9, 28, 7, 5, 9, 42).getTime();

            client.emit('typed', 'room.short', at);
            client.emit('untyped', undefined, at);
            setOutputMessageTypeVisibility(true);
            setOutputTimestampVisibility(true);
            client.emit('later', 'comm', at);

            const [typed, untyped, later] = outputWrapper.querySelectorAll('.output_msg');
            for (const msg of [typed, untyped, later]) {
                expect(chrome(msg)).toEqual(['output-timestamp', 'output-message-type', 'output_msg_content']);
                expect(msg.querySelector('.output-timestamp')!.textContent).toBe('07:05:09.042');
            }
            expect(typed.querySelector('.output-message-type')!.textContent).toBe('room.short');
            expect(untyped.querySelector('.output-message-type')!.textContent).toBe('—');
            expect(later.querySelector('.output-message-type')!.textContent).toBe('comm');

            // Turning one on again does not duplicate anything.
            setOutputTimestampVisibility(false);
            setOutputTimestampVisibility(true);
            expect(chrome(typed)).toEqual(['output-timestamp', 'output-message-type', 'output_msg_content']);
        });
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
