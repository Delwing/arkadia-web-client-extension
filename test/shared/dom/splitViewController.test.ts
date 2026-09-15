import { createSplitViewController, type SplitViewController } from '@shared/dom/splitViewController';

function defineGeometry(el: HTMLElement, geometry: { scrollTop?: number; scrollHeight?: number; clientHeight?: number; clientWidth?: number }) {
    for (const [key, value] of Object.entries(geometry)) {
        Object.defineProperty(el, key, { configurable: true, writable: true, value });
    }
}

function setupScroller() {
    document.body.innerHTML = `<div id="scroller"><div id="pane"></div></div>`;
    const scrollEl = document.getElementById('scroller') as HTMLElement;
    const pane = document.getElementById('pane') as HTMLElement;
    // jsdom reports 0 for every layout property and has no scrollTop setter.
    defineGeometry(scrollEl, { scrollTop: 0, scrollHeight: 1000, clientHeight: 100, clientWidth: 200 });
    defineGeometry(pane, { clientHeight: 0 });
    return { scrollEl, pane };
}

const flushFrames = () => new Promise(resolve => setTimeout(resolve, 50));

describe('createSplitViewController', () => {
    let controller: SplitViewController | undefined;
    let opened = 0;
    let closed = 0;

    const create = (overrides: Partial<Parameters<typeof createSplitViewController>[0]> = {}) => {
        const { scrollEl, pane } = setupScroller();
        opened = 0;
        closed = 0;
        controller = createSplitViewController({
            scrollEl,
            getSplitHeight: () => pane.clientHeight,
            onOpen: () => { opened++; },
            onClose: () => { closed++; },
            ...overrides,
        });
        return { scrollEl, pane, controller };
    };

    afterEach(() => {
        controller?.destroy();
        controller = undefined;
    });

    test('opens when the user scrolls away from the bottom and closes on the way back', async () => {
        const { scrollEl, controller } = create();

        expect(controller.isSplitView()).toBe(false);

        scrollEl.dispatchEvent(new Event('scroll'));
        expect(controller.isSplitView()).toBe(true);
        expect(opened).toBe(1);

        // The open transition suppresses re-detection for 150ms.
        await new Promise(resolve => setTimeout(resolve, 160));
        defineGeometry(scrollEl, { scrollTop: 900 });
        scrollEl.dispatchEvent(new Event('scroll'));
        expect(controller.isSplitView()).toBe(false);
        expect(closed).toBe(1);
    });

    test('counts content the sticky pane covers as being at the bottom', () => {
        const { scrollEl, pane, controller } = create();

        // 150px short of the bottom, but the pane covers the last 200px.
        defineGeometry(scrollEl, { scrollTop: 750 });
        defineGeometry(pane, { clientHeight: 200 });
        scrollEl.dispatchEvent(new Event('scroll'));

        expect(controller.isSplitView()).toBe(false);
    });

    test('a resize does not read as a scroll', () => {
        const { scrollEl, controller } = create();

        // The box gets shorter: the scrollback rewraps and the browser emits a
        // scroll event the user never asked for.
        defineGeometry(scrollEl, { clientHeight: 60 });
        scrollEl.dispatchEvent(new Event('scroll'));
        expect(controller.isSplitView()).toBe(false);
    });

    test('suppress blocks detection, and never shortens a longer hold', () => {
        const { scrollEl, controller } = create();

        controller.suppress(10_000);
        controller.suppress(10);
        scrollEl.dispatchEvent(new Event('scroll'));

        expect(controller.isSplitView()).toBe(false);
    });

    test('wheeling up at the bottom opens, wheeling down closes', async () => {
        const { scrollEl, controller } = create();

        defineGeometry(scrollEl, { scrollTop: 900 });
        scrollEl.dispatchEvent(new WheelEvent('wheel', { deltaY: -120 }));
        expect(controller.isSplitView()).toBe(true);

        // The open transition suppresses re-detection for 150ms.
        await new Promise(resolve => setTimeout(resolve, 160));
        scrollEl.dispatchEvent(new WheelEvent('wheel', { deltaY: 120 }));
        expect(controller.isSplitView()).toBe(false);
    });

    test('pinToBottom scrolls to the bottom and is a no-op in split view', async () => {
        const { scrollEl, controller } = create();

        controller.pinToBottom(true);
        expect(scrollEl.scrollTop).toBe(1000);

        defineGeometry(scrollEl, { scrollTop: 0 });
        // Pinning holds detection off for a moment; the test is not waiting it out.
        controller.suppress(0, true);
        scrollEl.dispatchEvent(new Event('scroll'));
        expect(controller.isSplitView()).toBe(true);

        controller.pinToBottom(true);
        await flushFrames();
        expect(scrollEl.scrollTop).toBe(0);
    });

    test('closes the split view when the content no longer fills the view', () => {
        const { scrollEl, controller } = create();

        scrollEl.dispatchEvent(new Event('scroll'));
        expect(controller.isSplitView()).toBe(true);

        // The log is cleared while the user is scrolled up: nothing is left to
        // scroll, so no scroll event could ever close the split view again.
        defineGeometry(scrollEl, { scrollHeight: 40 });
        controller.pinToBottom(true);

        expect(controller.isSplitView()).toBe(false);
        expect(closed).toBe(1);
    });

    test('dragging the handle reports a live height and a measured one at the end', () => {
        const live: number[] = [];
        let committed: number | undefined;
        const { scrollEl, pane, controller } = create({
            onHandleDrag: (px) => { live.push(px); },
            onHandleDragEnd: (px) => { committed = px; },
            minSplitHeight: 60,
        });
        scrollEl.getBoundingClientRect = () => ({ bottom: 500 }) as DOMRect;

        controller.startHandleDrag(new MouseEvent('mousedown'));
        document.dispatchEvent(new MouseEvent('mousemove', { clientY: 380 }));
        // Below the minimum: clamped, not passed through.
        document.dispatchEvent(new MouseEvent('mousemove', { clientY: 490 }));
        // The host has rendered the pane at the dragged height by drag end...
        defineGeometry(pane, { clientHeight: 120 });
        document.dispatchEvent(new MouseEvent('mouseup'));

        expect(live).toEqual([120, 60]);
        // ...so the committed height is the measured one, with CSS clamps applied.
        expect(committed).toBe(120);
    });

    test('a drag holds the split view open, and releases the hold when it ends', () => {
        const { scrollEl, controller } = create();

        defineGeometry(scrollEl, { scrollTop: 0 });
        scrollEl.dispatchEvent(new Event('scroll'));
        expect(controller.isSplitView()).toBe(true);

        controller.startHandleDrag(new MouseEvent('mousedown'));
        // Even at the bottom, nothing closes it mid-drag.
        defineGeometry(scrollEl, { scrollTop: 900 });
        scrollEl.dispatchEvent(new Event('scroll'));
        expect(controller.isSplitView()).toBe(true);

        document.dispatchEvent(new MouseEvent('mouseup'));
        controller.suppress(0, true);
        scrollEl.dispatchEvent(new Event('scroll'));
        expect(controller.isSplitView()).toBe(false);
    });

    test('destroy detaches every listener', () => {
        const { scrollEl, controller } = create();

        controller.destroy();
        scrollEl.dispatchEvent(new Event('scroll'));

        expect(controller.isSplitView()).toBe(false);
        expect(opened).toBe(0);
    });
});
