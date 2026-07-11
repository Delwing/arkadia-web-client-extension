import {expect, test} from './support/fixtures';
import type {Page} from '@playwright/test';
import {
    ensureGameSocket,
    getEmbeddedCalls,
    installEmbeddedMock,
    resetEmbeddedCalls,
    waitForCommandInput,
} from './support/mocks';

const MENU_BUTTON = '#menu-button';
const UI_SETTINGS_BUTTON = '#ui-settings-button';
const UI_MODAL = '#ui-settings-modal';

async function openUiSettings(page: Page) {
    await page.click(MENU_BUTTON);
    // Wait for any in-progress hide animation to complete before opening
    await page.waitForFunction(() => {
        const el = document.getElementById('ui-settings-modal');
        return !el || window.getComputedStyle(el).display === 'none';
    });
    await page.click(UI_SETTINGS_BUTTON);
    const modal = page.locator(UI_MODAL);
    await expect(modal, 'should open UI settings modal').toBeVisible();
    // Wait for Bootstrap show animation to complete so modal.hide() won't be silently ignored
    await page.waitForFunction(() => {
        const d = document.querySelector('#ui-settings-modal .modal-dialog') as HTMLElement | null;
        if (!d) return false;
        const t = window.getComputedStyle(d).transform;
        return t === 'none' || t === 'matrix(1, 0, 0, 1, 0, 0)';
    });
    return modal;
}

async function selectTab(modal: ReturnType<Page['locator']>, name: string) {
    await modal.getByRole('button', {name, exact: true}).click();
}

test.beforeEach(async ({context}) => {
    await installEmbeddedMock(context);
});

test.describe('UI settings', () => {
    test('apply changes across all controls', async ({page}) => {
        test.setTimeout(30000);
        await page.goto('/');
        await waitForCommandInput(page);
        await ensureGameSocket(page);
        await resetEmbeddedCalls(page);

        const modal = await openUiSettings(page);

        async function ensureChecked(selector: string) {
            const checkbox = modal.locator(selector);
            if (!(await checkbox.isChecked())) {
                await checkbox.check();
            }
        }

        async function ensureUnchecked(selector: string) {
            const checkbox = modal.locator(selector);
            if (await checkbox.isChecked()) {
                await checkbox.uncheck();
            }
        }

        // Mapa tab
        await selectTab(modal, 'Mapa');
        await ensureUnchecked('#ui-transparent-labels');
        await modal.locator('#ui-label-render-mode').selectOption('image');
        await modal.locator('#ui-map-scale').fill('0.5');
        await modal.locator('#ui-map-height').fill('40');
        await modal.locator('#ui-map-position').selectOption('bottom');
        await ensureChecked('#ui-exploration-mode');
        await ensureUnchecked('#ui-instant-move');
        await ensureUnchecked('#ui-highlight-current-room');

        // Ogólne tab
        await selectTab(modal, 'Ogólne');
        await modal.locator('#ui-content-font').fill('1.5');
        await modal.locator('#ui-objects-font').fill('1.25');
        await modal.locator('#ui-output-background').fill('#123456');
        await modal.locator('#ui-xterm-palette').selectOption('proper');
        await modal.locator('#ui-font-family').selectOption('cascadia-mono');
        await ensureUnchecked('#ui-show-buttons');
        await ensureUnchecked('#ui-haptic-feedback');

        // fight-title icon and clear-input now live on the Ogólne tab
        await ensureUnchecked('#ui-fight-title-icon');
        await ensureChecked('#ui-clear-input');

        // Stopka tab
        await selectTab(modal, 'Stopka');
        await modal.locator('#ui-footer-mode').selectOption('2');
        await ensureChecked('#ui-emoji-labels');

        // Toggle footer component visibility (transport-timer and combat-timer)
        // Wait for the footer components React component to render
        await modal.locator('#ui-footer-components-settings').waitFor({state: 'visible'});
        const transportSwitch = modal.locator('#fc-transport-timer');
        const combatSwitch = modal.locator('#fc-combat-timer');
        if (await transportSwitch.isChecked()) {
            await transportSwitch.uncheck();
        }
        if (await combatSwitch.isChecked()) {
            await combatSwitch.uncheck();
        }

        await modal.locator('#ui-settings-save').click();
        await expect(modal, 'should close UI settings modal after saving').not.toBeVisible();

        await page.waitForFunction(() => {
            try {
                // mapPosition is stock chrome (uiSettings); outputBackground is a
                // render setting (renderSettings) after the settings split.
                const ui = localStorage.getItem('uiSettings');
                const render = localStorage.getItem('renderSettings');
                if (!ui || !render) {
                    return false;
                }
                const uiParsed = JSON.parse(ui);
                const renderParsed = JSON.parse(render);
                return uiParsed?.mapPosition === 'bottom' && renderParsed?.outputBackground === '#123456';
            } catch {
                return false;
            }
        });

        const styles = await page.evaluate(() => {
            const content = document.getElementById('main_text_output_msg_wrapper')!;
            const objects = document.getElementById('objects-list')!;
            const charState = document.getElementById('char-state')!;
            const combatTimer = document.getElementById('combat-timer')!;
            const transportTimer = document.getElementById('transport-timer')!;
            const splitBottom = document.getElementById('split-bottom')!;
            const contentArea = document.getElementById('content-area')!;
            return {
                contentFontSize: getComputedStyle(content).fontSize,
                objectsFontSize: getComputedStyle(objects).fontSize,
                objectsFontFamily: objects.style.fontFamily,
                contentBackground: getComputedStyle(content).backgroundColor,
                splitBackground: getComputedStyle(splitBottom).backgroundColor,
                charStateFontSize: getComputedStyle(charState).fontSize,
                footerMode: charState.getAttribute('data-footer-mode'),
                combatTimerFooterHidden: combatTimer.dataset.footerHidden,
                transportTimerFooterHidden: transportTimer.dataset.footerHidden,
                bodyMapPosition: document.body.dataset.mapPosition,
                contentMapPosition: contentArea.getAttribute('data-map-position'),
                mapSize: contentArea.style.getPropertyValue('--map-size'),
            };
        });

        expect(styles.contentFontSize, 'should apply content font size multiplier').toBe('24px');
        expect(styles.charStateFontSize, 'should apply footer font size multiplier').toBe('24px');
        expect(styles.objectsFontSize, 'should apply objects font size multiplier').toBe('20px');
        expect(styles.objectsFontFamily, 'should apply configured font family').toBe('"Cascadia Mono", monospace');
        expect(styles.contentBackground, 'should apply configured output background color').toBe('rgb(18, 52, 86)');
        expect(styles.splitBackground, 'should sync split background with output background').toBe('rgb(18, 52, 86)');
        expect(styles.footerMode, 'should persist selected footer mode').toBe('2');
        expect(styles.combatTimerFooterHidden, 'should mark combat timer as hidden via footer component').toBe('1');
        expect(styles.transportTimerFooterHidden, 'should mark transport timer as hidden via footer component').toBe('1');
        expect(styles.bodyMapPosition, 'should update body map position data attribute').toBe('bottom');
        expect(styles.contentMapPosition, 'should update content map position attribute').toBe('bottom');
        expect(styles.mapSize, 'should apply configured map height').toBe('40vh');

        const embeddedCalls = await getEmbeddedCalls(page);
        expect(
            embeddedCalls,
            'should invoke embedded client with updated UI configuration'
        ).toEqual(
            expect.arrayContaining([
                { method: 'setZoom', value: 0.5 },
                { method: 'setExplorationMode', value: true },
                { method: 'setTransparentLabels', value: false },
                { method: 'setLabelRenderMode', value: 'image' },
                { method: 'setInstantMove', value: false },
                { method: 'setHighlightCurrentRoom', value: false },
                { method: 'refresh' },
            ]),
        );

        const storedSettings = await page.evaluate(() => {
            // Settings are split across concern-scoped keys; compose them the
            // way the app's load() does before asserting on the unified shape.
            const read = (k: string): Record<string, unknown> => {
                try {
                    const raw = localStorage.getItem(k);
                    return raw ? JSON.parse(raw) : {};
                } catch {
                    return {};
                }
            };
            if (localStorage.getItem('uiSettings') === null) {
                return null;
            }
            return {
                ...read('uiSettings'),
                ...read('shellSettings'),
                ...read('renderSettings'),
                ...read('mapSettings'),
                ...read('behaviorSettings'),
            };
        });

        expect(storedSettings, 'should persist uiSettings entry in storage').toBeTruthy();
        expect(storedSettings).toEqual(
            expect.objectContaining({
                mapScale: 0.5,
                mapHeight: 40,
                mapPosition: 'bottom',
                explorationMode: true,
                instantMove: false,
                highlightCurrentRoom: false,
                contentFontSize: 1.5,
                objectsFontSize: 1.25,
                outputBackground: '#123456',
                footerMode: 2,
                xtermPalette: 'proper',
                fontFamily: 'cascadia-mono',
                showButtons: false,
                hapticFeedback: false,
                emojiLabels: true,
                fightTitleIcon: false,
                clearInputOnSend: true,
            }),
        );
        // Verify footer components visibility
        expect(storedSettings.footerComponents, 'should persist footerComponents array').toBeDefined();
        const transportConfig = storedSettings.footerComponents.find((c: any) => c.id === 'transport-timer');
        const combatConfig = storedSettings.footerComponents.find((c: any) => c.id === 'combat-timer');
        expect(transportConfig?.visible, 'transport-timer should be hidden').toBe(false);
        expect(combatConfig?.visible, 'combat-timer should be hidden').toBe(false);
    });

    test('persist settings after reload', async ({page}) => {
        await page.goto('/');
        await waitForCommandInput(page);
        await ensureGameSocket(page);

        const modal = await openUiSettings(page);
        await selectTab(modal, 'Mapa');
        await modal.locator('#ui-map-position').selectOption('bottom');
        await selectTab(modal, 'Ogólne');
        await modal.locator('#ui-output-background').fill('#123456');
        await modal.locator('#ui-settings-save').click();
        await expect(modal, 'should close UI settings modal after saving').not.toBeVisible();

        await page.waitForFunction(() => document.body.dataset.mapPosition === 'bottom');
        await page.waitForFunction(() => {
            const content = document.getElementById('main_text_output_msg_wrapper');
            return Boolean(content && getComputedStyle(content).backgroundColor === 'rgb(18, 52, 86)');
        });

        await page.reload();

        await waitForCommandInput(page);
        await ensureGameSocket(page);

        await page.waitForFunction(() => document.body.dataset.mapPosition === 'bottom');
        await page.waitForFunction(() => {
            const content = document.getElementById('main_text_output_msg_wrapper');
            return Boolean(content && getComputedStyle(content).backgroundColor === 'rgb(18, 52, 86)');
        });

        const persisted = await page.evaluate(() => {
            const content = document.getElementById('main_text_output_msg_wrapper')!;
            return {
                bodyMapPosition: document.body.dataset.mapPosition,
                contentBackground: getComputedStyle(content).backgroundColor,
            };
        });

        expect(persisted.bodyMapPosition, 'should restore saved map position on reload').toBe('bottom');
        expect(
            persisted.contentBackground,
            'should restore saved output background color on reload',
        ).toBe('rgb(18, 52, 86)');

        const reloadedModal = await openUiSettings(page);
        await selectTab(reloadedModal, 'Mapa');
        await expect(
            reloadedModal.locator('#ui-map-position'),
            'should show persisted map position in UI settings',
        ).toHaveValue('bottom');
        await selectTab(reloadedModal, 'Ogólne');
        await expect(
            reloadedModal.locator('#ui-output-background'),
            'should show persisted output background color in UI settings',
        ).toHaveValue('#123456');
    });

    test('hide mobile buttons persists after reload', async ({page}) => {
        await page.goto('/');
        await waitForCommandInput(page);
        await ensureGameSocket(page);

        // Buttons should be visible by default
        const mobileButtons = page.locator('#mobile-direction-buttons');
        await expect(mobileButtons, 'mobile buttons should be visible by default').toBeVisible();

        // Uncheck "show buttons" and save
        const modal = await openUiSettings(page);
        const showButtonsCheckbox = modal.locator('#ui-show-buttons');
        if (await showButtonsCheckbox.isChecked()) {
            await showButtonsCheckbox.uncheck();
        }
        await modal.locator('#ui-settings-save').click();
        await expect(modal, 'should close UI settings modal after saving').not.toBeVisible();

        // Buttons should be hidden now
        await expect(mobileButtons, 'mobile buttons should be hidden after unchecking').not.toBeVisible();

        // Reload the page
        await page.reload();
        await waitForCommandInput(page);
        await ensureGameSocket(page);

        // Buttons should still be hidden after reload
        await expect(
            mobileButtons,
            'mobile buttons should remain hidden after reload',
        ).not.toBeVisible();

        // The checkbox should still be unchecked
        const reloadedModal = await openUiSettings(page);
        await expect(
            reloadedModal.locator('#ui-show-buttons'),
            'show buttons checkbox should remain unchecked after reload',
        ).not.toBeChecked();
    });
});
