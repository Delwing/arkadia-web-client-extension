import { defaultFooterComponents, validateFooterComponents } from '@web/uiSettingsCore.ts';

/*
 * The connection readout ships hidden: ping and proxy drift are diagnostics, and the
 * footer is scarce space during a fight. Anyone who wants it turns it on in the footer
 * settings, so what matters here is that neither a fresh install nor an existing one
 * has it appear on its own.
 */
describe('connection-status footer default', () => {
    it('is registered but hidden out of the box', () => {
        const entry = defaultFooterComponents.find(c => c.id === 'connection-status');

        expect(entry).toBeDefined();
        expect(entry!.visible).toBe(false);
    });

    it('arrives hidden for a player whose saved config predates it', () => {
        const saved = defaultFooterComponents
            .filter(c => c.id !== 'connection-status')
            .map((c, order) => ({ id: c.id, visible: true, order }));

        const merged = validateFooterComponents(saved);

        expect(merged.find(c => c.id === 'connection-status')?.visible).toBe(false);
        // And nothing the player had chosen is disturbed by the back-fill.
        expect(merged.filter(c => c.id !== 'connection-status').every(c => c.visible)).toBe(true);
    });

    it('keeps it on once the player turns it on', () => {
        const saved = defaultFooterComponents.map((c, order) => ({
            id: c.id,
            visible: c.id === 'connection-status' ? true : c.visible,
            order,
        }));

        expect(validateFooterComponents(saved).find(c => c.id === 'connection-status')?.visible).toBe(true);
    });
});
