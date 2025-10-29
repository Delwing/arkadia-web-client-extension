import {expect, test} from '@playwright/test';
import type {Page} from '@playwright/test';
import {
    ensureGameSocket,
    getEmbeddedCalls,
    installEmbeddedMock,
    installMockWebSocket,
    mockMagicKeysDownload,
    mockMagicsDownload,
    mockPeopleDownload,
    mockNpcDownload,
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
    await expect(modal).toBeVisible();
    return modal;
}

test.beforeEach(async ({context}) => {
    await mockMagicsDownload(context);
    await mockMagicKeysDownload(context);
    await mockNpcDownload(context);
    await mockPeopleDownload(context);
    await installMockWebSocket(context);
    await installEmbeddedMock(context);
});

test.describe('UI settings', () => {
    test('apply changes across all controls', async ({page}) => {
        await page.goto('/');
        await waitForClientReady(page);
        await ensureGameSocket(page);
        await resetEmbeddedCalls(page);

        await page.evaluate(() => {
            (window as any).__lastUiSettingsEvent = null;
            const target: EventTarget | undefined = (window as any).clientExtension?.eventTarget;
            target?.addEventListener('uiSettings', (event: CustomEvent) => {
                (window as any).__lastUiSettingsEvent = event.detail;
            });
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
        await expect(modal).not.toBeVisible();

        await page.waitForFunction(() => (window as any).__lastUiSettingsEvent !== null);

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

        expect(styles.contentFontSize).toBe('24px');
        expect(styles.charStateFontSize).toBe('24px');
        expect(styles.objectsFontSize).toBe('20px');
        expect(styles.objectsFontFamily).toBe('"Cascadia Mono", monospace');
        expect(styles.contentBackground).toBe('rgb(18, 52, 86)');
        expect(styles.splitBackground).toBe('rgb(18, 52, 86)');
        expect(styles.footerMode).toBe('2');
        expect(styles.combatTimerDisplay).toBe('none');
        expect(styles.combatTimerEnabled).toBe('0');
        expect(styles.bodyMapPosition).toBe('bottom');
        expect(styles.contentMapPosition).toBe('bottom');
        expect(styles.mapSize).toBe('40vh');
        expect(styles.mobileButtonWidth).toBe('54px');
        expect(styles.mobileButtonHeight).toBe('54px');
        expect(styles.mobileButtonFont).toBe('21px');

        const embeddedCalls = await getEmbeddedCalls(page);
        expect(embeddedCalls).toEqual(
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

        const uiSettingsEvent = await page.evaluate(() => (window as any).__lastUiSettingsEvent);
        expect(uiSettingsEvent).toEqual(
            expect.objectContaining({
                mobileDirectionButtons: false,
                hapticFeedback: false,
                emojiLabels: true,
                xtermPalette: 'proper',
                footerMode: 2,
                fightTitleIcon: false,
                clearInputOnSend: true,
                showTransportLabel: false,
                showCombatTimer: false,
            }),
        );
    });
});
