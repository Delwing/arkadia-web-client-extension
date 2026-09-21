import {expect, test} from './support/fixtures';
import {ensureGameSocket, pushText, waitForCommandInput, waitForOutputContaining} from './support/mocks';

async function startRecordingViaUI(page: any, name: string) {
    await page.click('#menu-button');
    await page.click('#recordings-button');
    await expect(page.locator('#recordings-modal')).toBeVisible();
    await page.fill('.recording-name-input', name);
    await page.locator('#recordings-modal').getByRole('button', {name: 'Nagrywaj'}).click();
    await expect(page.locator('#recording-button')).toBeVisible();
}

async function stopRecordingViaUI(page: any) {
    await page.click('#recording-button');
    await expect(page.locator('#recording-button')).not.toBeVisible();
}

async function deleteRecordingFromDB(page: any, name: string) {
    await page.evaluate((n: string) => {
        return new Promise<void>((resolve, reject) => {
            const request = indexedDB.open('ArkadiaRecordingsDB', 1);
            request.onsuccess = () => {
                const db = request.result;
                const tx = db.transaction(['recordings'], 'readwrite');
                const store = tx.objectStore('recordings');
                const req = store.delete(n);
                req.onsuccess = () => resolve();
                req.onerror = () => reject(new Error('Failed to delete'));
            };
            request.onerror = () => reject(new Error('Failed to open DB'));
        });
    }, name);
}

/** Playback is refused while connected: the recording would send its commands to the game. */
async function disconnectViaUI(page: any) {
    await page.click('#menu-button');
    await page.click('#disconnect-button');
    // Disconnected, the login overlay comes back; close it to reach the menu.
    await expect(page.locator('#auth-overlay')).toBeVisible();
    await page.click('#auth-close');
    await expect(page.locator('#auth-overlay')).not.toBeVisible();
}

async function playTimedViaUI(page: any, name: string) {
    await page.click('#menu-button');
    await page.click('#recordings-button');
    await expect(page.locator('#recordings-modal')).toBeVisible();
    const row = page.locator('.recordings-item', {has: page.locator(`.recordings-item-name:has-text("${name}")`)});
    // The split button's main half plays in real time.
    await row.locator('.popup-menu-button__main').click();
    await expect(page.locator('#playback-controls')).toBeVisible();
}

test.describe('Recording and Playback', () => {
    test('should record messages and save recording', async ({page}) => {
        await page.goto('/');
        await waitForCommandInput(page);
        await ensureGameSocket(page);

        const recordingName = `test-recording-${Date.now()}`;
        await startRecordingViaUI(page, recordingName);

        // Send some test messages
        await pushText(page, 'Test message 1');
        await pushText(page, 'Test message 2');
        await pushText(page, 'Test message 3');
        await waitForOutputContaining(page, 'Test message 3');

        // Stop recording via UI
        await stopRecordingViaUI(page);

        // Verify recording appears in the list
        await page.click('#menu-button');
        await page.click('#recordings-button');
        await expect(page.locator('#recordings-modal')).toBeVisible();
        await expect(page.locator(`.recordings-item-name:has-text("${recordingName}")`)).toBeVisible();

        // Clean up
        await deleteRecordingFromDB(page, recordingName);
    });

    test('should show playback controls during timed playback', async ({page}) => {
        await page.goto('/');
        await waitForCommandInput(page);
        await ensureGameSocket(page);

        const recordingName = `test-timed-${Date.now()}`;
        await startRecordingViaUI(page, recordingName);

        // Send messages with real delays — recording captures timestamps between messages
        for (let i = 1; i <= 5; i++) {
            await pushText(page, `Timed message ${i}`);
            await page.waitForTimeout(300);
        }

        await stopRecordingViaUI(page);

        await disconnectViaUI(page);
        // Start timed playback via UI
        await playTimedViaUI(page, recordingName);

        // Verify playback info is visible
        await expect(page.locator('#playback-info')).toBeVisible();

        // Test pause button
        await page.click('#playback-pause');

        // Test resume by clicking pause again
        await page.click('#playback-pause');

        // Speed presets
        await page.locator('#playback-controls [data-speed="2"]').click();
        await expect(page.locator('#playback-controls [data-speed="2"]')).toHaveClass(/is-active/);

        // Stop playback
        await page.click('#playback-stop');
        await expect(page.locator('#playback-controls')).not.toBeVisible();

        // Clean up
        await deleteRecordingFromDB(page, recordingName);
    });

    test('should control playback with step functions', async ({page}) => {
        await page.goto('/');
        await waitForCommandInput(page);
        await ensureGameSocket(page);

        const recordingName = `test-stepping-${Date.now()}`;
        await startRecordingViaUI(page, recordingName);

        // Send messages with real delays so recording captures timing data
        await pushText(page, 'Step message 1');
        await page.waitForTimeout(100);
        await pushText(page, 'Step message 2');
        await page.waitForTimeout(100);
        await pushText(page, 'Step message 3');
        await waitForOutputContaining(page, 'Step message 3');

        await stopRecordingViaUI(page);

        await disconnectViaUI(page);
        // Start timed playback via UI
        await playTimedViaUI(page, recordingName);

        // Pause immediately
        await page.click('#playback-pause');

        // Test step forward
        await page.click('#playback-step');

        // Test step back
        await page.click('#playback-step-back');

        // Step forward again
        await page.click('#playback-step');

        // Stop playback
        await page.click('#playback-stop');
        await expect(page.locator('#playback-controls')).not.toBeVisible();

        // Clean up
        await deleteRecordingFromDB(page, recordingName);
    });

    test('should not play back while connected', async ({page}) => {
        await page.goto('/');
        await waitForCommandInput(page);
        await ensureGameSocket(page);

        const recordingName = `test-connected-${Date.now()}`;
        await startRecordingViaUI(page, recordingName);
        await pushText(page, 'Connected message');
        await waitForOutputContaining(page, 'Connected message');
        await stopRecordingViaUI(page);

        await page.click('#menu-button');
        await page.click('#recordings-button');
        const row = page.locator('.recordings-item', {has: page.locator(`.recordings-item-name:has-text("${recordingName}")`)});
        await expect(row.locator('.popup-menu-button__main'), 'play should be disabled while connected').toBeDisabled();
        await expect(page.locator('.recordings-offline-hint')).toBeVisible();

        await deleteRecordingFromDB(page, recordingName);
    });

    test('should start recording from UI and verify button visibility', async ({page}) => {
        await page.goto('/');
        await waitForCommandInput(page);
        await ensureGameSocket(page);

        const recordingName = `ui-test-${Date.now()}`;
        await startRecordingViaUI(page, recordingName);

        // Send a test message
        await pushText(page, 'UI test message');
        await waitForOutputContaining(page, 'UI test message');

        // Stop recording by clicking the button
        await stopRecordingViaUI(page);

        // Clean up
        await deleteRecordingFromDB(page, recordingName);
    });
});
