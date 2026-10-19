// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { act } from 'react';
import { alertDialog, confirmDialog } from '@web-ui/primitives/confirmDialog.tsx';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function buttons() {
    return [...document.querySelectorAll<HTMLButtonElement>('.popup-confirm-host .popup-dialog__footer button')];
}

function click(label: string) {
    const button = buttons().find(b => b.textContent === label);
    if (!button) throw new Error(`no "${label}" button`);
    act(() => button.click());
}

describe('confirmDialog', () => {
    afterEach(() => {
        document.body.innerHTML = '';
    });

    it('shows the message and resolves true on the confirming button', async () => {
        let result!: Promise<boolean>;
        act(() => {
            result = confirmDialog({ title: 'Usuń', message: 'Na pewno?', confirmLabel: 'Usuń', danger: true });
        });

        expect(document.querySelector('.popup-confirm-message')?.textContent).toBe('Na pewno?');
        expect(buttons().map(b => b.textContent)).toEqual(['Anuluj', 'Usuń']);
        expect(document.activeElement?.textContent).toBe('Usuń');

        click('Usuń');
        await expect(result).resolves.toBe(true);
        expect(document.querySelector('.popup-confirm-host')).toBeNull();
    });

    it('resolves false on cancel', async () => {
        let result!: Promise<boolean>;
        act(() => {
            result = confirmDialog({ message: 'Na pewno?' });
        });
        click('Anuluj');
        await expect(result).resolves.toBe(false);
    });

    it('resolves false on Escape', async () => {
        let result!: Promise<boolean>;
        act(() => {
            result = confirmDialog({ message: 'Na pewno?' });
        });
        act(() => {
            document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
        });
        await expect(result).resolves.toBe(false);
        expect(document.querySelector('.popup-confirm-host')).toBeNull();
    });

    it('gives focus back to what had it', async () => {
        const trigger = document.createElement('button');
        document.body.appendChild(trigger);
        trigger.focus();

        let result!: Promise<boolean>;
        act(() => {
            result = confirmDialog({ message: 'Na pewno?' });
        });
        click('OK');
        await result;
        expect(document.activeElement).toBe(trigger);
    });
});

describe('alertDialog', () => {
    it('resolves once closed', async () => {
        let result!: Promise<void>;
        act(() => {
            result = alertDialog('Nie udało się');
        });
        expect(document.querySelector('.popup-confirm-message')?.textContent).toBe('Nie udało się');
        click('OK');
        await expect(result).resolves.toBeUndefined();
        expect(document.querySelector('.popup-confirm-host')).toBeNull();
    });
});
