import { attachScrollback, type ScrollbackHandle } from '@shared/dom/scrollback';

function defineGeometry(el: HTMLElement, geometry: { scrollTop?: number; scrollHeight?: number; clientHeight?: number; clientWidth?: number }) {
    for (const [key, value] of Object.entries(geometry)) {
        Object.defineProperty(el, key, { configurable: true, writable: true, value });
    }
}

function line(text: string): HTMLDivElement {
    const el = document.createElement('div');
    el.textContent = text;
    return el;
}

// MutationObserver callbacks run as microtasks.
const flushMutations = () => new Promise(resolve => setTimeout(resolve, 0));
const waitOutSuppression = () => new Promise(resolve => setTimeout(resolve, 300));

describe('attachScrollback', () => {
    let scrollEl: HTMLElement;
    let scrollback: ScrollbackHandle | undefined;

    beforeEach(() => {
        document.body.innerHTML = '<div id="list"></div>';
        scrollEl = document.getElementById('list') as HTMLElement;
        scrollEl.append(line('a'), line('b'), line('c'));
        // jsdom reports 0 for every layout property and has no scrollTop setter.
        defineGeometry(scrollEl, { scrollTop: 900, scrollHeight: 1000, clientHeight: 100, clientWidth: 200 });
    });

    afterEach(() => {
        scrollback?.remove();
        scrollback = undefined;
    });

    const scrollUp = async () => {
        await waitOutSuppression();
        defineGeometry(scrollEl, { scrollTop: 0 });
        scrollEl.dispatchEvent(new Event('scroll'));
    };

    const pane = () => scrollEl.querySelector('.popup-split-bottom');
    const mirrored = () => Array.from(scrollEl.querySelectorAll('.popup-split-sticky > *')).map(el => el.textContent);

    test('pins to the bottom when attached', () => {
        defineGeometry(scrollEl, { scrollTop: 0 });
        scrollback = attachScrollback(scrollEl);
        expect(scrollEl.scrollTop).toBe(1000);
        expect(scrollback.isSplitView()).toBe(false);
    });

    test('scrolling up shows the newest lines in a pane kept last', async () => {
        const changes: boolean[] = [];
        scrollback = attachScrollback(scrollEl, { splitLines: 2, splitHeight: 90, onSplitViewChange: open => changes.push(open) });
        await scrollUp();

        expect(scrollback.isSplitView()).toBe(true);
        expect(changes).toEqual([true]);
        expect(scrollEl.lastElementChild).toBe(pane());
        expect((pane() as HTMLElement).style.height).toBe('90px');
        expect(mirrored()).toEqual(['b', 'c']);

        scrollEl.append(line('d'));
        await flushMutations();
        expect(scrollEl.lastElementChild).toBe(pane());
        expect(mirrored()).toEqual(['c', 'd']);
        // Reading the scrollback: new lines do not pull the view down.
        expect(scrollEl.scrollTop).toBe(0);
    });

    test('trims the pane to whole lines so its edge never cuts one in half', async () => {
        // 25px lines; the pane's bottom edge at 100, room for 90px
        const rect = HTMLElement.prototype.getBoundingClientRect;
        const height = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'clientHeight');
        jest.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
            if (this.classList.contains('popup-split-sticky')) return { bottom: 100 } as DOMRect;
            if (this.dataset.top) return { top: Number(this.dataset.top) } as DOMRect;
            return rect.call(this);
        });
        Object.defineProperty(HTMLElement.prototype, 'clientHeight', {
            configurable: true,
            get(this: HTMLElement) { return this.classList.contains('popup-split-bottom') ? 90 : 0; },
        });
        try {
            const at = (top: number) => {
                const el = line(`${top}`);
                el.dataset.top = `${top}`;
                return el;
            };
            scrollback = attachScrollback(scrollEl, { splitHeight: 90, renderSplit: () => [25, 50, 75].map(at) });
            await scrollUp();
            expect((pane() as HTMLElement).style.height).toBe('75px');
        } finally {
            jest.restoreAllMocks();
            if (height) Object.defineProperty(HTMLElement.prototype, 'clientHeight', height);
        }
    });

    test('renderSplit builds the pane lines instead of clones', async () => {
        scrollback = attachScrollback(scrollEl, { renderSplit: lines => [line(`last ${lines}`)] });
        await scrollUp();
        expect(mirrored()).toEqual(['last 40']);
    });

    test('a host clearing the list brings the pane back', async () => {
        scrollback = attachScrollback(scrollEl);
        await scrollUp();

        scrollEl.innerHTML = '';
        scrollEl.append(line('x'));
        await flushMutations();
        expect(scrollEl.lastElementChild).toBe(pane());
        expect(mirrored()).toEqual(['x']);
    });

    test('scrollToBottom closes the split view and drops the pane', async () => {
        scrollback = attachScrollback(scrollEl);
        await scrollUp();

        scrollback.scrollToBottom();
        expect(scrollback.isSplitView()).toBe(false);
        expect(pane()).toBeNull();
        expect(scrollEl.scrollTop).toBe(1000);
    });

    test('remove leaves the content and stops following it', async () => {
        scrollback = attachScrollback(scrollEl);
        // On its own layer, like the pane, so text is smoothed the same in both
        expect(scrollEl.style.willChange).toBe('transform');
        await scrollUp();
        scrollback.remove();

        expect(pane()).toBeNull();
        expect(scrollEl.style.willChange).toBe('');
        expect(Array.from(scrollEl.children).map(el => el.textContent)).toEqual(['a', 'b', 'c']);
        defineGeometry(scrollEl, { scrollTop: 0 });
        scrollEl.append(line('d'));
        await flushMutations();
        expect(scrollEl.scrollTop).toBe(0);
    });
});
