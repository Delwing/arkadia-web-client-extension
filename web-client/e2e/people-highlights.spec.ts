import type {Page} from '@playwright/test';
import {expect, test} from './support/test-fixture';
import {ensureGameSocket, primeCharInfo, pushText, waitForClientReady} from './support/mocks';

const PERSON_NAME = 'Aldous';
const PERSON_DESCRIPTION = 'wysoki wojownik';
const PERSON_SUFFIX = '(Aldous CKN)';

async function prepareClient(page: Page): Promise<void> {
    await page.goto('/');
    await waitForClientReady(page);
    await ensureGameSocket(page);
    await page.waitForFunction(() => localStorage.getItem('currentCharacter') === 'Tester');
}

async function openGuildSettings(page: Page) {
    await page.click('#menu-button');
    await page.click('#options-button');

    const optionsModal = page.locator('#options-modal');
    await expect(optionsModal, 'should open options modal from menu').toBeVisible();

    const guildTab = optionsModal.locator('button', {hasText: 'Gildie'});
    await guildTab.click();

    const guildToggle = optionsModal.locator('#guild-CKN');
    await expect(guildToggle, 'should allow enabling guild highlight').toBeEnabled();

    return optionsModal;
}

async function pushAndWaitForHighlight(
    page: Page,
    message: string,
    expected: string,
): Promise<ReturnType<Page['locator']>> {
    for (let attempt = 0; attempt < 10; attempt += 1) {
        await pushText(page, message);
        const entry = page
            .locator('#main_text_output_msg_wrapper .output_msg')
            .filter({hasText: PERSON_DESCRIPTION})
            .last();
        try {
            await expect(entry, 'should display expected guild suffix highlight').toContainText(expected, {timeout: 2000});
            return entry;
        } catch (error) {
            if (attempt === 9) {
                throw error;
            }
            await page.waitForTimeout(500);
        }
    }
    throw new Error('Highlight did not appear');
}

async function pushAndWaitForNoHighlight(
    page: Page,
    message: string,
    unexpected: string,
): Promise<ReturnType<Page['locator']>> {
    for (let attempt = 0; attempt < 10; attempt += 1) {
        await pushText(page, message);
        const entry = page
            .locator('#main_text_output_msg_wrapper .output_msg')
            .filter({hasText: PERSON_DESCRIPTION})
            .last();
        try {
            await expect(entry, 'should display base person description').toContainText(PERSON_DESCRIPTION, {timeout: 2000});
            await expect(entry, 'should not display unexpected highlight suffix').not.toContainText(unexpected, {
                timeout: 2000,
            });
            return entry;
        } catch (error) {
            if (attempt === 9) {
                throw error;
            }
            await page.waitForTimeout(500);
        }
    }
    throw new Error('Highlight was not removed');
}

test.beforeEach(async ({context, page}) => {
    await primeCharInfo(context);
    await page.addInitScript(() => {
        localStorage.setItem('currentCharacter', 'Tester');
    });
});

test.describe('People highlights', () => {
    test('allows configuring guild highlight colors and disabling them', async ({page}) => {
        await prepareClient(page);

        const optionsModal = await openGuildSettings(page);
        await optionsModal.locator('#guild-CKN').check();
        await optionsModal.locator('#guild-color-enabled-CKN').check();
        await optionsModal.locator('#guild-color-CKN').fill('#00ff00');
        await optionsModal.locator('#options-save').click();
        await expect(optionsModal, 'should close options modal after enabling highlights').not.toBeVisible();

        const allyDescription = await pushAndWaitForHighlight(
            page,
            'Widzisz wysoki wojownik tutaj.',
            PERSON_SUFFIX,
        );
        const allySuffix = allyDescription.locator('span', {hasText: PERSON_SUFFIX}).last();
        await expect(allySuffix, 'should color ally suffix using configured highlight').toHaveCSS('color', 'rgb(0, 255, 0)');

        const optionsModalSecond = await openGuildSettings(page);
        await optionsModalSecond.locator('#guild-color-CKN').fill('#0000ff');
        await optionsModalSecond.locator('#options-save').click();
        await expect(optionsModalSecond, 'should close options modal after updating highlight color').not.toBeVisible();

        const updatedDescription = await pushAndWaitForHighlight(
            page,
            'Widzisz wysoki wojownik tutaj.',
            PERSON_SUFFIX,
        );
        const updatedSuffix = updatedDescription.locator('span', {hasText: PERSON_SUFFIX}).last();
        await expect(updatedSuffix, 'should update ally suffix color after reconfiguration').toHaveCSS('color', 'rgb(0, 0, 255)');

        const optionsModalFinal = await openGuildSettings(page);
        const guildToggle = optionsModalFinal.locator('#guild-CKN');
        if (await guildToggle.isChecked()) {
            await guildToggle.uncheck();
        }
        const colorToggle = optionsModalFinal.locator('#guild-color-enabled-CKN');
        if (await colorToggle.isChecked()) {
            await colorToggle.uncheck();
        }
        await optionsModalFinal.locator('#options-save').click();
        await expect(optionsModalFinal, 'should close options modal after disabling highlights').not.toBeVisible();

        const neutralDescription = await pushAndWaitForNoHighlight(
            page,
            'Widzisz wysoki wojownik tutaj.',
            PERSON_NAME,
        );
        await expect(neutralDescription, 'should remove guild suffix once highlight disabled').not.toContainText(PERSON_SUFFIX);
    });

    test('marks enemy guild members in red until disabled', async ({page}) => {
        await prepareClient(page);

        const optionsModal = await openGuildSettings(page);
        await optionsModal.locator('#enemy-guild-CKN').check();
        const guildColorToggle = optionsModal.locator('#guild-color-enabled-CKN');
        await expect(guildColorToggle, 'should prevent manual color selection for enemy highlight').toBeDisabled();
        await optionsModal.locator('#options-save').click();
        await expect(optionsModal, 'should close options modal after configuring enemy highlight').not.toBeVisible();

        const enemyDescription = await pushAndWaitForHighlight(
            page,
            'Widzisz wysoki wojownik tutaj.',
            PERSON_SUFFIX,
        );
        const enemySuffix = enemyDescription.locator('span', {hasText: PERSON_SUFFIX}).last();
        await expect(enemySuffix, 'should color enemy suffix with warning color').toHaveCSS('color', 'rgb(255, 0, 0)');

        const optionsModalSecond = await openGuildSettings(page);
        await optionsModalSecond.locator('#enemy-guild-CKN').uncheck();
        await optionsModalSecond.locator('#options-save').click();
        await expect(optionsModalSecond, 'should close options modal after disabling enemy highlight').not.toBeVisible();

        const neutralDescription = await pushAndWaitForNoHighlight(
            page,
            'Widzisz wysoki wojownik tutaj.',
            PERSON_NAME,
        );
        await expect(neutralDescription, 'should remove enemy suffix once highlight disabled').not.toContainText(PERSON_SUFFIX);
    });
});
