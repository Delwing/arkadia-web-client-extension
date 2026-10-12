import { attachTooltip, hideTooltip } from '@shared/dom/tooltip';

describe('attachTooltip', () => {
    let tooltip: HTMLElement;
    let target: HTMLElement;

    const hover = () => target.dispatchEvent(new MouseEvent('pointerenter'));
    const leave = () => target.dispatchEvent(new MouseEvent('pointerleave'));
    const press = (el: Element) => el.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true }));
    const shown = () => tooltip.classList.contains('show');

    beforeAll(() => {
        tooltip = document.createElement('div');
        tooltip.id = 'hover-tooltip';
        document.body.appendChild(tooltip);
    });

    beforeEach(() => {
        hideTooltip();
        target = document.createElement('span');
        document.body.appendChild(target);
    });

    afterEach(() => target.remove());

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
