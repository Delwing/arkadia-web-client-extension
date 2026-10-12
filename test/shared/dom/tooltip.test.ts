import { attachTooltip, hideTooltip, TOOLTIP_DELAY_MS } from '@shared/dom/tooltip';

describe('attachTooltip', () => {
    let tooltip: HTMLElement;
    let target: HTMLElement;

    /** Rests the mouse on the element long enough for the tooltip to show. */
    const hover = (el: Element = target) => {
        el.dispatchEvent(new MouseEvent('pointerenter'));
        vi.advanceTimersByTime(TOOLTIP_DELAY_MS);
    };
    const leave = () => target.dispatchEvent(new MouseEvent('pointerleave'));
    const press = (el: Element) => el.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true }));
    const shown = () => tooltip.classList.contains('show');

    beforeAll(() => {
        tooltip = document.createElement('div');
        tooltip.id = 'hover-tooltip';
        document.body.appendChild(tooltip);
    });

    beforeEach(() => {
        vi.useFakeTimers();
        hideTooltip();
        target = document.createElement('span');
        document.body.appendChild(target);
    });

    afterEach(() => {
        target.remove();
        vi.useRealTimers();
    });

    test('waits for the mouse to rest, and leaving first cancels it', () => {
        attachTooltip(target, 'raz');
        target.dispatchEvent(new MouseEvent('pointerenter'));
        vi.advanceTimersByTime(TOOLTIP_DELAY_MS - 1);
        expect(shown()).toBe(false);
        target.dispatchEvent(new MouseEvent('pointerleave'));
        vi.advanceTimersByTime(TOOLTIP_DELAY_MS);
        expect(shown()).toBe(false);

        target.dispatchEvent(new MouseEvent('pointerenter'));
        vi.advanceTimersByTime(TOOLTIP_DELAY_MS);
        expect(shown()).toBe(true);
    });

    test('moving on to the next element waits its own delay', () => {
        const next = document.createElement('span');
        document.body.appendChild(next);
        attachTooltip(target, 'raz');
        attachTooltip(next, 'dwa');
        hover();
        leave();
        next.dispatchEvent(new MouseEvent('pointerenter'));
        expect(shown()).toBe(false);
        vi.advanceTimersByTime(TOOLTIP_DELAY_MS);
        expect(tooltip.textContent).toBe('dwa');
        next.remove();
    });

    test('shows the card while hovered: header, rows, then the hints', () => {
        attachTooltip(target, { header: 'Licznik', rows: [{ label: 'Pozostało', content: '0:42' }], click: 'zresetuj' });
        expect(shown()).toBe(false);

        hover();
        expect(shown()).toBe(true);
        expect(tooltip.querySelector('.hover-tooltip__header')!.textContent).toBe('Licznik');
        const rows = [...tooltip.querySelectorAll('.hover-tooltip__entry')];
        expect(rows.map((row) => row.textContent)).toEqual(['Pozostało0:42', 'kliknijzresetuj']);
        expect(rows[1].classList.contains('hover-tooltip__entry--hint')).toBe(true);

        leave();
        expect(shown()).toBe(false);
    });

    test('update redraws a shown card; null takes it away', () => {
        const handle = attachTooltip(target, 'raz');
        hover();
        handle.update('dwa');
        expect(tooltip.textContent).toBe('dwa');
        handle.update(null);
        expect(shown()).toBe(false);
    });

    test('a press on the element keeps it up, a press elsewhere hides it', () => {
        attachTooltip(target, 'raz');
        hover();
        press(target);
        expect(shown()).toBe(true);
        press(document.body);
        expect(shown()).toBe(false);
    });

    test('remove detaches it', () => {
        const handle = attachTooltip(target, 'raz');
        hover();
        handle.remove();
        expect(shown()).toBe(false);
        hover();
        expect(shown()).toBe(false);
    });
});
