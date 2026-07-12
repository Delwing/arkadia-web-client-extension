import { expect, test } from './support/fixtures';
import {
    ensureGameSocket,
    pushGmcp,
    GMCP_PATHS,
    waitForCommandInput,
    waitForMapReady,
} from './support/mocks';

const POSLAN_MAP_NAME = 'Miasteczko Poslan';
const TRIP_PLANNER_SELECTOR = '.trip-planner-window';
const CONTEXT_MENU_SELECTOR = '#context-menu';

async function dispatchRoomContextMenu(page: import('@playwright/test').Page, roomId: number): Promise<void> {
    await page.evaluate((id) => {
        const mapEl = document.getElementById('map');
        const event = new CustomEvent('roomcontextmenu', {
            bubbles: true,
            cancelable: true,
            detail: { roomId: id, position: { x: 50, y: 50 } },
        });
        mapEl!.dispatchEvent(event);
    }, roomId);
}

async function addStopViaContextMenu(page: import('@playwright/test').Page, roomId: number): Promise<void> {
    await dispatchRoomContextMenu(page, roomId);
    const menu = page.locator(CONTEXT_MENU_SELECTOR);
    await expect(menu).toHaveClass(/show/);
    const addStopButton = menu.locator('button', { hasText: 'Dodaj przystanek' });
    await addStopButton.click();
}

test.describe('Trip Planner Popup', () => {
    test.beforeEach(async ({ page }) => {
        await page.goto('/');
        await waitForCommandInput(page);
        await ensureGameSocket(page);
        await waitForMapReady(page);
    });

    test('opens when triggered via context menu "Dodaj przystanek"', async ({ page }) => {
        await addStopViaContextMenu(page, 2);
        const popup = page.locator(TRIP_PLANNER_SELECTOR);
        await expect(popup).toBeVisible();
    });

    test('shows empty state message when no stops are added', async ({ page }) => {
        // Open via context menu first, then clear
        await addStopViaContextMenu(page, 2);
        const popup = page.locator(TRIP_PLANNER_SELECTOR);
        await expect(popup).toBeVisible();

        // Clear the stop that was just added
        const removeButton = popup.locator('.trip-planner-stop-remove');
        await removeButton.click();

        await expect(popup).toContainText('Brak przystankow');
    });

    test('adds a stop via context menu and displays it', async ({ page }) => {
        await addStopViaContextMenu(page, 2);
        const popup = page.locator(TRIP_PLANNER_SELECTOR);
        await expect(popup).toBeVisible();

        // Should show room #2
        const stopId = popup.locator('.trip-planner-stop-id');
        await expect(stopId).toHaveText('#2');
    });

    test('shows room name for known rooms', async ({ page }) => {
        await addStopViaContextMenu(page, 2);
        const popup = page.locator(TRIP_PLANNER_SELECTOR);
        await expect(popup).toBeVisible();

        // Room 2 is "Rynek" in mock data
        const stopName = popup.locator('.trip-planner-stop-name');
        await expect(stopName).toHaveText('Rynek');
    });

    test('adds multiple stops and shows correct count in title', async ({ page }) => {
        await addStopViaContextMenu(page, 2);
        const popup = page.locator(TRIP_PLANNER_SELECTOR);
        await expect(popup).toBeVisible();

        // Add another stop via the ID input
        const idInput = popup.locator('.trip-planner-input[type="number"]');
        await idInput.fill('3');
        const addButton = popup.locator('.popup-btn', { hasText: 'Dodaj' });
        await addButton.click();

        // Title should reflect 2 stops
        await expect(popup).toContainText('Planer trasy (2)');

        // Should have 2 stop items
        const stops = popup.locator('.trip-planner-stop');
        await expect(stops).toHaveCount(2);
    });

    test('removes a stop when clicking the remove button', async ({ page }) => {
        await addStopViaContextMenu(page, 2);
        const popup = page.locator(TRIP_PLANNER_SELECTOR);
        await expect(popup).toBeVisible();

        // Add a second stop
        const idInput = popup.locator('.trip-planner-input[type="number"]');
        await idInput.fill('3');
        const addButton = popup.locator('.popup-btn', { hasText: 'Dodaj' });
        await addButton.click();
        await expect(popup.locator('.trip-planner-stop')).toHaveCount(2);

        // Remove the first stop
        const removeButtons = popup.locator('.trip-planner-stop-remove');
        await removeButtons.first().click();

        await expect(popup.locator('.trip-planner-stop')).toHaveCount(1);
        await expect(popup).toContainText('Planer trasy (1)');
    });

    test('adds a stop by entering room ID and pressing Enter', async ({ page }) => {
        await addStopViaContextMenu(page, 2);
        const popup = page.locator(TRIP_PLANNER_SELECTOR);
        await expect(popup).toBeVisible();

        // Clear existing stop first
        await popup.locator('.trip-planner-stop-remove').click();

        const idInput = popup.locator('.trip-planner-input[type="number"]');
        await idInput.fill('4');
        await idInput.press('Enter');

        const stopId = popup.locator('.trip-planner-stop-id');
        await expect(stopId).toHaveText('#4');
    });

    test('clears all stops when clicking Wyczysc button', async ({ page }) => {
        await addStopViaContextMenu(page, 2);
        const popup = page.locator(TRIP_PLANNER_SELECTOR);
        await expect(popup).toBeVisible();

        // Add another stop
        const idInput = popup.locator('.trip-planner-input[type="number"]');
        await idInput.fill('3');
        await popup.locator('.popup-btn', { hasText: 'Dodaj' }).click();
        await expect(popup.locator('.trip-planner-stop')).toHaveCount(2);

        // Click clear button
        const clearButton = popup.locator('.trip-planner-action-btn--danger', { hasText: 'Wyczysc' });
        await clearButton.click();

        await expect(popup).toContainText('Brak przystankow');
        await expect(popup).toContainText('Planer trasy (0)');
    });

    test('Prowadz button is disabled when no stops exist', async ({ page }) => {
        await addStopViaContextMenu(page, 2);
        const popup = page.locator(TRIP_PLANNER_SELECTOR);
        await expect(popup).toBeVisible();

        // Remove the stop
        await popup.locator('.trip-planner-stop-remove').click();

        const prowadzButton = popup.locator('.trip-planner-action-btn', { hasText: 'Prowadz' });
        await expect(prowadzButton).toBeDisabled();
    });

    test('Prowadz button is enabled when stops exist', async ({ page }) => {
        await addStopViaContextMenu(page, 3);
        const popup = page.locator(TRIP_PLANNER_SELECTOR);
        await expect(popup).toBeVisible();

        const prowadzButton = popup.locator('.trip-planner-action-btn', { hasText: 'Prowadz' });
        await expect(prowadzButton).toBeEnabled();
    });

    test('shows segment color indicator for each stop', async ({ page }) => {
        await addStopViaContextMenu(page, 2);
        const popup = page.locator(TRIP_PLANNER_SELECTOR);
        await expect(popup).toBeVisible();

        const colorIndicator = popup.locator('.trip-planner-stop-color');
        await expect(colorIndicator).toBeVisible();
    });

    test('shows distance between stops', async ({ page }) => {
        // Set current location to room 1
        await pushGmcp(page, GMCP_PATHS.ROOM_INFO, {
            num: 1,
            id: 1,
            name: 'Poczta',
            zone: POSLAN_MAP_NAME,
            exits: { east: 2 },
            map: { x: 0, y: 0, name: POSLAN_MAP_NAME },
        });

        // Add room 3 as a stop (distance from room 1: 1->2->3 = 2 steps)
        await addStopViaContextMenu(page, 3);
        const popup = page.locator(TRIP_PLANNER_SELECTOR);
        await expect(popup).toBeVisible();

        const distance = popup.locator('.trip-planner-stop-distance');
        await expect(distance).toBeVisible();
        await expect(distance).toHaveText('2');
    });

    test('shows total distance for multiple stops', async ({ page }) => {
        // Set current location to room 1
        await pushGmcp(page, GMCP_PATHS.ROOM_INFO, {
            num: 1,
            id: 1,
            name: 'Poczta',
            zone: POSLAN_MAP_NAME,
            exits: { east: 2 },
            map: { x: 0, y: 0, name: POSLAN_MAP_NAME },
        });

        await addStopViaContextMenu(page, 3);
        const popup = page.locator(TRIP_PLANNER_SELECTOR);
        await expect(popup).toBeVisible();

        // Add room 4 (north of room 3)
        const idInput = popup.locator('.trip-planner-input[type="number"]');
        await idInput.fill('4');
        await popup.locator('.popup-btn', { hasText: 'Dodaj' }).click();

        // Total distance should be shown (2 + 1 = 3)
        await expect(popup.locator('.trip-planner-total')).toContainText('Laczna odleglosc: 3');
    });

    test('saves and loads a route', async ({ page }) => {
        await addStopViaContextMenu(page, 2);
        const popup = page.locator(TRIP_PLANNER_SELECTOR);
        await expect(popup).toBeVisible();

        // Add another stop
        const idInput = popup.locator('.trip-planner-input[type="number"]');
        await idInput.fill('3');
        await popup.locator('.popup-btn', { hasText: 'Dodaj' }).click();

        // Save route
        const routeNameInput = popup.locator('.trip-planner-input[type="text"]');
        await routeNameInput.fill('Testowa trasa');
        const saveButton = popup.locator('.popup-btn', { hasText: 'Zapisz' });
        await saveButton.click();

        // Clear stops
        const clearButton = popup.locator('.trip-planner-action-btn--danger', { hasText: 'Wyczysc' });
        await clearButton.click();
        await expect(popup).toContainText('Brak przystankow');

        // Load route
        const routeSelect = popup.locator('.trip-planner-select').first();
        await routeSelect.selectOption('Testowa trasa');
        const loadButton = popup.locator('.popup-btn', { hasText: 'Wczytaj' });
        await loadButton.click();

        // Stops should be restored
        await expect(popup.locator('.trip-planner-stop')).toHaveCount(2);
        await expect(popup).toContainText('Planer trasy (2)');
    });

    test('deletes a saved route', async ({ page }) => {
        await addStopViaContextMenu(page, 2);
        const popup = page.locator(TRIP_PLANNER_SELECTOR);
        await expect(popup).toBeVisible();

        // Save route
        const routeNameInput = popup.locator('.trip-planner-input[type="text"]');
        await routeNameInput.fill('Do usuniecia');
        const saveButton = popup.locator('.popup-btn', { hasText: 'Zapisz' });
        await saveButton.click();

        // Select and delete the saved route
        const routeSelect = popup.locator('.trip-planner-select').first();
        await routeSelect.selectOption('Do usuniecia');
        const deleteButton = popup.locator('.trip-planner-btn--danger').first();
        await deleteButton.click();

        // Route select should no longer contain the deleted route
        await expect(popup).not.toContainText('Do usuniecia');
    });

    test('switches between ID and shortcut input modes', async ({ page }) => {
        await addStopViaContextMenu(page, 2);
        const popup = page.locator(TRIP_PLANNER_SELECTOR);
        await expect(popup).toBeVisible();

        // Default mode is "Po ID"
        const idTab = popup.locator('.trip-planner-mode-tab', { hasText: 'Po ID' });
        await expect(idTab).toHaveClass(/trip-planner-mode-tab--active/);

        // Switch to shortcut mode
        const shortcutTab = popup.locator('.trip-planner-mode-tab', { hasText: 'Ze skrotu' });
        await shortcutTab.click();
        await expect(shortcutTab).toHaveClass(/trip-planner-mode-tab--active/);
        await expect(idTab).not.toHaveClass(/trip-planner-mode-tab--active/);

        // Should show the shortcut select
        const shortcutSelect = popup.locator('.trip-planner-select').last();
        await expect(shortcutSelect).toBeVisible();
    });

    test('stop numbering is sequential', async ({ page }) => {
        await addStopViaContextMenu(page, 1);
        const popup = page.locator(TRIP_PLANNER_SELECTOR);
        await expect(popup).toBeVisible();

        const idInput = popup.locator('.trip-planner-input[type="number"]');
        await idInput.fill('2');
        await popup.locator('.popup-btn', { hasText: 'Dodaj' }).click();

        await idInput.fill('3');
        await popup.locator('.popup-btn', { hasText: 'Dodaj' }).click();

        const numbers = popup.locator('.trip-planner-stop-number');
        await expect(numbers.nth(0)).toHaveText('1.');
        await expect(numbers.nth(1)).toHaveText('2.');
        await expect(numbers.nth(2)).toHaveText('3.');
    });

    test('does not add stop with invalid ID (0 or negative)', async ({ page }) => {
        await addStopViaContextMenu(page, 2);
        const popup = page.locator(TRIP_PLANNER_SELECTOR);
        await expect(popup).toBeVisible();

        // Remove existing stop
        await popup.locator('.trip-planner-stop-remove').click();

        // Try to add ID 0
        const idInput = popup.locator('.trip-planner-input[type="number"]');
        await idInput.fill('0');
        await popup.locator('.popup-btn', { hasText: 'Dodaj' }).click();

        // Should still show empty state
        await expect(popup).toContainText('Brak przystankow');
    });

    test('Prowadz button emits tripPlanner.leadTo event', async ({ page }) => {
        await addStopViaContextMenu(page, 3);
        const popup = page.locator(TRIP_PLANNER_SELECTOR);
        await expect(popup).toBeVisible();

        // Click Prowadz - this should update the location label with path arrow
        const prowadzButton = popup.locator('.trip-planner-action-btn', { hasText: 'Prowadz' });
        await prowadzButton.click();

        // The location label should show a path to room 3
        const locationLabel = page.locator('#location-text');
        await expect(locationLabel).toContainText('→ #3');
    });
});
