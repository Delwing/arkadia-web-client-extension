import { beforeEach, describe, expect, it } from 'vitest';
import { closeOptionWindows, closeWindow, openWindow } from '@web/modals/pageWindows';
import { AppModal } from '@web/modals/appModal';

const ids = ['settings-modal', 'binds-modal', 'places-modal', 'character-management-modal', 'helper-modal'];

describe('pageWindows', () => {
    beforeEach(() => {
        for (const id of ids) AppModal.byId(id)?.hide();
        document.body.innerHTML = ids.map((id) => `<div id="${id}" class="app-modal" hidden><div class="app-modal__dialog" tabindex="-1"></div></div>`).join('');
    });

    const isOpen = (id: string) => AppModal.byId(id)!.isOpen;

    it('opens and closes a window by name', () => {
        openWindow('binds');
        expect(isOpen('binds-modal')).toBe(true);
        closeWindow('binds');
        expect(isOpen('binds-modal')).toBe(false);
    });

    it('does nothing for a window the page does not have', () => {
        expect(() => openWindow('logs')).not.toThrow();
    });

    it('closing the option windows leaves the others open', () => {
        openWindow('settings');
        openWindow('places');
        openWindow('characters');
        openWindow('helper');
        closeOptionWindows();
        expect(isOpen('settings-modal')).toBe(false);
        expect(isOpen('places-modal')).toBe(false);
        expect(isOpen('character-management-modal')).toBe(true);
        expect(isOpen('helper-modal')).toBe(true);
    });
});
