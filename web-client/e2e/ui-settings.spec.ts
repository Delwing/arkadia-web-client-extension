import {expect, test} from './support/fixtures';
import type {Page} from '@playwright/test';
import {
    ensureGameSocket,
    getEmbeddedCalls,
    installEmbeddedMock,
    resetEmbeddedCalls,
    waitForClientReady,
} from './support/mocks';

const MENU_BUTTON = '#menu-button';
const UI_SETTINGS_BUTTON = '#ui-settings-button';
const UI_MODAL = '#ui-settings-modal';

async function openUiSettings(page: Page) {
    await page.click(MENU_BUTTON);
    await page.click(UI_SETTINGS_BUTTON);
    const modal = page.locator(UI_MODAL);
    await expect(modal, 'should open UI settings modal').toBeVisible();
    return modal;
}

test.beforeEach(async ({context}) => {
    await installEmbeddedMock(context);
});

test.describe('UI settings', () => {
    test('apply changes across all controls', async ({page}) => {
        await page.goto('/');
        await waitForClientReady(page);
        await ensureGameSocket(page);
        await resetEmbeddedCalls(page);

        await page.evaluate(() => {
            if (!document.querySelector('[data-test-mobile-button]')) {
                const button = document.createElement('button');
                button.className = 'mobile-button';
                button.dataset.testMobileButton = '1';
                button.textContent = 'Test';
                document.body.appendChild(button);
            }
        });

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

        await ensureUnchecked('#ui-transparent-labels');
        await modal.locator('#ui-label-render-mode').selectOption('image');
        await modal.locator('#ui-map-scale').fill('0.5');
        await modal.locator('#ui-map-height').fill('40');
        await modal.locator('#ui-map-position').selectOption('bottom');
        await ensureChecked('#ui-exploration-mode');
        await ensureUnchecked('#ui-instant-move');
        await ensureUnchecked('#ui-highlight-current-room');
        await modal.locator('#ui-content-font').fill('1.5');
        await modal.locator('#ui-objects-font').fill('1.25');
        await modal.locator('#ui-button-size').fill('1.5');
        await modal.locator('#ui-output-background').fill('#123456');
        await modal.locator('#ui-footer-mode').selectOption('2');
        await modal.locator('#ui-xterm-palette').selectOption('proper');
        await modal.locator('#ui-font-family').selectOption('cascadia-mono');
        await ensureUnchecked('#ui-show-buttons');
        await ensureUnchecked('#ui-haptic-feedback');
        await ensureChecked('#ui-emoji-labels');
        await ensureUnchecked('#ui-fight-title-icon');
        await ensureChecked('#ui-clear-input');
        await ensureUnchecked('#ui-show-transport-label');
        await ensureUnchecked('#ui-show-combat-timer');

        await modal.locator('#ui-settings-save').click();
        await expect(modal, 'should close UI settings modal after saving').not.toBeVisible();

        await page.waitForFunction(() => {
            const keys = Object.keys(localStorage);
            const key = keys.find((item) => item === 'uiSettings' || item.endsWith(':uiSettings'));
            if (!key) {
                return false;
            }
            try {
                const stored = localStorage.getItem(key);
                if (!stored) {
                    return false;
                }
                const parsed = JSON.parse(stored);
                return parsed?.mapPosition === 'bottom' && parsed?.outputBackground === '#123456';
            } catch {
                return false;
            }
        });

        const styles = await page.evaluate(() => {
            const content = document.getElementById('main_text_output_msg_wrapper')!;
            const objects = document.getElementById('objects-list')!;
            const charState = document.getElementById('char-state')!;
            const combatTimer = document.getElementById('combat-timer')!;
            const splitBottom = document.getElementById('split-bottom')!;
            const contentArea = document.getElementById('content-area')!;
            const mobileButton = document.querySelector('[data-test-mobile-button="1"]') as HTMLElement;
            return {
                contentFontSize: getComputedStyle(content).fontSize,
                objectsFontSize: getComputedStyle(objects).fontSize,
                objectsFontFamily: objects.style.fontFamily,
                contentBackground: getComputedStyle(content).backgroundColor,
                splitBackground: getComputedStyle(splitBottom).backgroundColor,
                charStateFontSize: getComputedStyle(charState).fontSize,
                footerMode: charState.getAttribute('data-footer-mode'),
                combatTimerDisplay: getComputedStyle(combatTimer).display,
                combatTimerEnabled: combatTimer.dataset.enabled,
                bodyMapPosition: document.body.dataset.mapPosition,
                contentMapPosition: contentArea.getAttribute('data-map-position'),
                mapSize: contentArea.style.getPropertyValue('--map-size'),
                mobileButtonWidth: mobileButton?.style.width,
                mobileButtonHeight: mobileButton?.style.height,
                mobileButtonFont: mobileButton?.style.fontSize,
            };
        });

        expect(styles.contentFontSize, 'should apply content font size multiplier').toBe('24px');
        expect(styles.charStateFontSize, 'should apply footer font size multiplier').toBe('24px');
        expect(styles.objectsFontSize, 'should apply objects font size multiplier').toBe('20px');
        expect(styles.objectsFontFamily, 'should apply configured font family').toBe('"Cascadia Mono", monospace');
        expect(styles.contentBackground, 'should apply configured output background color').toBe('rgb(18, 52, 86)');
        expect(styles.splitBackground, 'should sync split background with output background').toBe('rgb(18, 52, 86)');
        expect(styles.footerMode, 'should persist selected footer mode').toBe('2');
        expect(styles.combatTimerDisplay, 'should hide combat timer when disabled').toBe('none');
        expect(styles.combatTimerEnabled, 'should mark combat timer disabled state').toBe('0');
        expect(styles.bodyMapPosition, 'should update body map position data attribute').toBe('bottom');
        expect(styles.contentMapPosition, 'should update content map position attribute').toBe('bottom');
        expect(styles.mapSize, 'should apply configured map height').toBe('40vh');
        expect(styles.mobileButtonWidth, 'should scale mobile button width').toBe('54px');
        expect(styles.mobileButtonHeight, 'should scale mobile button height').toBe('54px');
        expect(styles.mobileButtonFont, 'should scale mobile button font size').toBe('21px');

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
            const keys = Object.keys(localStorage);
            const key = keys.find((item) => item === 'uiSettings' || item.endsWith(':uiSettings'));
            if (!key) {
                return null;
            }
            try {
                const raw = localStorage.getItem(key);
                return raw ? JSON.parse(raw) : null;
            } catch {
                return null;
            }
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
                buttonSize: 1.5,
                outputBackground: '#123456',
                footerMode: 2,
                xtermPalette: 'proper',
                fontFamily: 'cascadia-mono',
                showButtons: false,
                hapticFeedback: false,
                emojiLabels: true,
                fightTitleIcon: false,
                clearInputOnSend: true,
                showTransportLabel: false,
                showCombatTimer: false,
            }),
        );
    });

    test('persist settings after reload', async ({page}) => {
        await page.goto('/');
        await waitForClientReady(page);
        await ensureGameSocket(page);

        const modal = await openUiSettings(page);
        await modal.locator('#ui-map-position').selectOption('bottom');
        await modal.locator('#ui-output-background').fill('#123456');
        await modal.locator('#ui-settings-save').click();
        await expect(modal, 'should close UI settings modal after saving').not.toBeVisible();

        await page.waitForFunction(() => document.body.dataset.mapPosition === 'bottom');
        await page.waitForFunction(() => {
            const content = document.getElementById('main_text_output_msg_wrapper');
            return Boolean(content && getComputedStyle(content).backgroundColor === 'rgb(18, 52, 86)');
        });

        await page.reload();

        await waitForClientReady(page);
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
        await expect(
            reloadedModal.locator('#ui-map-position'),
            'should show persisted map position in UI settings',
        ).toHaveValue('bottom');
        await expect(
            reloadedModal.locator('#ui-output-background'),
            'should show persisted output background color in UI settings',
        ).toHaveValue('#123456');
    });
});
