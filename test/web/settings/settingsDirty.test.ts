import { describe, expect, it } from 'vitest';
import { pageSignature } from '@web/settings/settingsDirty.ts';

function page(html: string): HTMLDivElement {
    const el = document.createElement('div');
    el.innerHTML = html;
    return el;
}

describe('pageSignature', () => {
    it('returns to the same value when a control is set back', () => {
        const el = page('<label>Echo</label><input type="checkbox"><select><option value="a">A</option><option value="b">B</option></select><input type="number" value="3">');
        const checkbox = el.querySelector<HTMLInputElement>('input[type=checkbox]')!;
        const select = el.querySelector('select')!;
        const number = el.querySelector<HTMLInputElement>('input[type=number]')!;
        const before = pageSignature(el);

        checkbox.checked = true;
        select.value = 'b';
        number.value = '4';
        expect(pageSignature(el)).not.toBe(before);

        checkbox.checked = false;
        select.value = 'a';
        number.value = '3';
        expect(pageSignature(el)).toBe(before);
    });

    it('sees list edits and reordering through the rendered text', () => {
        const el = page('<ul><li>HP</li><li>Mana</li></ul>');
        const before = pageSignature(el);
        const list = el.querySelector('ul')!;

        list.append(list.firstElementChild!);
        expect(pageSignature(el), 'reordered').not.toBe(before);

        list.append(list.firstElementChild!);
        expect(pageSignature(el), 'back in order').toBe(before);
    });

    it('skips anything marked data-settings-ignore', () => {
        const el = page('<input id="setting" type="text" value="x"><div data-settings-ignore><input id="scratch" type="text"><span>suggestion</span></div>');
        const before = pageSignature(el);

        el.querySelector<HTMLInputElement>('#scratch')!.value = 'typing';
        el.querySelector('span')!.textContent = 'other suggestion';
        expect(pageSignature(el)).toBe(before);

        el.querySelector<HTMLInputElement>('#setting')!.value = 'y';
        expect(pageSignature(el)).not.toBe(before);
    });
});
