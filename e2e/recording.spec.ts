import {expect, test} from './support/fixtures';
import {ensureGameSocket, pushText, waitForCommandInput, waitForOutputContaining} from './support/mocks';

test.describe('Recording and Playback', () => {
    test('should record messages and save recording', async ({page}) => {
        await page.goto('/');
        await waitForCommandInput(page);
        await ensureGameSocket(page);

        // Start recording using client API
        const recordingName = `test-recording-${Date.now()}`;
        await page.evaluate((name) => {
            window.client.startRecording(name);
        }, recordingName);

        // Verify recording indicator is visible
        await expect(page.locator('#recording-button')).toBeVisible();

        // Send some test messages
        await pushText(page, 'Test message 1');
        await pushText(page, 'Test message 2');
        await pushText(page, 'Test message 3');
        await waitForOutputContaining(page, 'Test message 3');

        // Stop recording
        await page.evaluate(() => {
            window.client.stopRecording(true);
        });

        // Verify recording button is hidden
        await expect(page.locator('#recording-button')).not.toBeVisible();

        // Verify recording was saved by loading it
        const recordingExists = await page.evaluate((name) => {
            return window.client.loadRecording(name).then(() => true).catch(() => false);
        }, recordingName);

        expect(recordingExists).toBe(true);

        // Clean up: delete the recording
        await page.evaluate((name) => {
            return window.client.deleteRecording?.(name);
        }, recordingName);
    });

    test('should show playback controls during timed playback', async ({page}) => {
        await page.goto('/');
        await waitForCommandInput(page);
        await ensureGameSocket(page);

        // Start recording
        const recordingName = `test-timed-${Date.now()}`;
        await page.evaluate((name) => {
            window.client.startRecording(name);
        }, recordingName);

        await expect(page.locator('#recording-button')).toBeVisible();

        // Send messages with real delays — recording captures timestamps between messages
        for (let i = 1; i <= 5; i++) {
            await pushText(page, `Timed message ${i}`);
            await page.waitForTimeout(300);
        }

        // Stop recording
        await page.evaluate(() => {
            window.client.stopRecording(true);
        });

        await expect(page.locator('#recording-button')).not.toBeVisible();

        // Start timed playback
        await page.evaluate((name) => {
            return window.client.loadRecording(name).then(() => {
                window.client.replayRecordedMessagesTimed();
            });
        }, recordingName);

        // Verify playback controls appear
        await expect(page.locator('#playback-controls')).toBeVisible();

        // Verify playback info is visible
        await expect(page.locator('#playback-info')).toBeVisible();

        // Test pause button
        await page.click('#playback-pause');

        // Test resume by clicking pause again
        await page.click('#playback-pause');

        // Test speed control (using slider)
        await page.locator('#playback-speed-slider').fill('0.7');

        // Stop playback
        await page.click('#playback-stop');
        await expect(page.locator('#playback-controls')).not.toBeVisible();

        // Clean up
        await page.evaluate((name) => {
            return window.client.deleteRecording?.(name);
        }, recordingName);
    });

    test('should control playback with step functions', async ({page}) => {
        await page.goto('/');
        await waitForCommandInput(page);
        await ensureGameSocket(page);

        // Start recording
        const recordingName = `test-stepping-${Date.now()}`;
        await page.evaluate((name) => {
            window.client.startRecording(name);
        }, recordingName);

        // Send messages with real delays so recording captures timing data
        await pushText(page, 'Step message 1');
        await page.waitForTimeout(100);
        await pushText(page, 'Step message 2');
        await page.waitForTimeout(100);
        await pushText(page, 'Step message 3');
        await waitForOutputContaining(page, 'Step message 3');

        // Stop recording
        await page.evaluate(() => {
            window.client.stopRecording(true);
        });

        // Start timed playback
        await page.evaluate((name) => {
            return window.client.loadRecording(name).then(() => {
                window.client.replayRecordedMessagesTimed();
            });
        }, recordingName);

        // Wait for playback to start
        await expect(page.locator('#playback-controls')).toBeVisible();

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
        await page.evaluate((name) => {
            return window.client.deleteRecording?.(name);
        }, recordingName);
    });

    test('should start recording from UI and verify button visibility', async ({page}) => {
        await page.goto('/');
        await waitForCommandInput(page);
        await ensureGameSocket(page);

        // Open recordings modal
        await page.click('#menu-button');
        await page.click('#recordings-button');
        await expect(page.locator('#recordings-modal')).toBeVisible();

        // Start recording from UI
        const recordingName = `ui-test-${Date.now()}`;
        await page.fill('.recording-name-input', recordingName);
        await page.click('button:has-text("Rozpocznij")');

        // Verify recording button appears and modal closes
        await expect(page.locator('#recording-button')).toBeVisible();
        await expect(page.locator('#recordings-modal')).not.toBeVisible();

        // Send a test message
        await pushText(page, 'UI test message');
        await waitForOutputContaining(page, 'UI test message');

        // Stop recording by clicking the button
        await page.click('#recording-button');
        await expect(page.locator('#recording-button')).not.toBeVisible();

        // Clean up
        await page.evaluate((name) => {
            return window.client.deleteRecording?.(name);
        }, recordingName);
    });
});
