import {expect, test} from './support/fixtures';
import type {Page} from '@playwright/test';
import {createRequire} from 'node:module';
import * as esbuild from 'esbuild';
import {ensureGameSocket, getRecentOutput, pushText, submitCommand, waitForCommandInput, waitForOutputContaining} from './support/mocks';
import {bindKey, captureKey, closeKeysWindow, openKeysWindow} from './support/keys';

/**
 * A plugin written in TSX and bundled with the published `arkadiaHostUi()`
 * esbuild plugin renders its popup with the client's React: hooks, the
 * client's components, plugin storage, and waiting for a game line.
 */

const require = createRequire(import.meta.url);
const {arkadiaHostUi} = require('../plugins/types/esbuild.cjs');

const MENU_BUTTON = '#menu-button';
const SCRIPTS_BUTTON = '#scripts-button';
const SCRIPTS_MODAL = '#scripts-modal';
const PLUGIN_URL = 'https://example.com/react-ui-plugin.js';
const PLUGIN_NAME = 'React UI Test';

const PLUGIN_SOURCE = `
import { useState } from 'react';
import { Button, Segmented } from '@arkadia/ui';

let api;

function Counter() {
  const [n, setN] = useState(() => api.storage.character.get('clicks', 0));
  const [mode, setMode] = useState('a');
  const click = () => {
    setN(n + 1);
    api.storage.character.set('clicks', n + 1);
  };
  return (
    <div className="rx-test">
      <Button variant="solid" onClick={click}>Klik {n}</Button>
      <Segmented value={mode} options={[{ value: 'a', label: 'Alfa' }, { value: 'b', label: 'Beta' }]} onChange={setMode} />
      <span className="rx-mode">{mode}</span>
    </div>
  );
}

export async function init(pluginApi) {
  api = pluginApi;
  const popup = await api.ui.registerPersistentPopup({
    id: 'rx',
    title: 'React Test',
    createContent: () => <Counter />,
  });
  api.aliases.register(/^\\/rx$/, () => { popup.open(); });
  api.keys.register({
    id: 'rxtest.ping',
    label: 'Ping testowy',
    defaultKey: { key: 'j', alt: true },
    onPress: () => api.output.print('alt-h pressed'),
  });
  api.aliases.register(/^\\/rx-wait$/, async () => {
    const r = await api.triggers.waitFor(/^Ping (\\w+)$/, { timeout: 5000 });
    api.output.print('pong ' + r.match[1]);
  });
  return { name: '${PLUGIN_NAME}', version: '1.0.0' };
}
export async function destroy() {}
`;

async function buildPlugin(): Promise<string> {
    const result = await esbuild.build({
        stdin: {contents: PLUGIN_SOURCE, loader: 'tsx', resolveDir: '/'},
        bundle: true,
        format: 'esm',
        jsx: 'automatic',
        write: false,
        plugins: [arkadiaHostUi()],
    });
    return result.outputFiles[0].text;
}

async function loadPlugin(page: Page): Promise<void> {
    const body = await buildPlugin();
    await page.route(`${PLUGIN_URL}**`, async (route) => {
        await route.fulfill({status: 200, contentType: 'application/javascript', body});
    });

    await page.click(MENU_BUTTON);
    await page.click(SCRIPTS_BUTTON);
    const modal = page.locator(SCRIPTS_MODAL);
    await expect(modal, 'should show scripts modal').toBeVisible();

    await modal.getByRole('button', {name: 'Dodaj plugin'}).click();
    await page.locator('.plugin-route', {hasText: 'Z adresu URL'}).click();

    const dialog = page.locator('.popup-dialog', {hasText: 'Dodaj skrypt z URL'}).last();
    await dialog.getByPlaceholder('URL skryptu').fill(PLUGIN_URL);
    await dialog.getByRole('button', {name: 'Dodaj', exact: true}).click();
    await expect(modal.getByText(PLUGIN_NAME), 'plugin should load and show its name').toBeVisible();

    await modal.locator('.app-modal__close').first().click();
    await expect(modal).not.toBeVisible();
}

test.describe('Plugin React UI', () => {
    test.beforeEach(async ({page}) => {
        await page.goto('/');
        await waitForCommandInput(page);
        await ensureGameSocket(page);
        await loadPlugin(page);
    });

    test('renders with the client React, keeps hook state and stores values', async ({page}) => {
        await submitCommand(page, '/rx');
        const panel = page.locator('.floating-panel', {has: page.locator('.floating-panel__header', {hasText: 'React Test'})});
        await expect(panel, 'popup should open').toBeVisible();

        const button = panel.getByRole('button', {name: /Klik/});
        await expect(button).toHaveText('Klik 0');
        await expect(button, 'should be the client button').toHaveClass(/popup-btn--solid/);
        await button.click();
        await button.click();
        await expect(button, 'useState should survive re-renders').toHaveText('Klik 2');

        await panel.getByText('Beta').click();
        await expect(panel.locator('.rx-mode')).toHaveText('b');
        await expect(panel.getByRole('radio', {name: 'Beta'})).toBeChecked();

        const stored = await page.evaluate(() => {
            for (let i = 0; i < localStorage.length; i++) {
                const key = localStorage.key(i)!;
                if (key === 'plugin_data' || key.endsWith(':plugin_data')) return JSON.parse(localStorage.getItem(key)!);
            }
            return null;
        });
        const values = Object.values(stored ?? {}) as Record<string, unknown>[];
        expect(values.map(v => v.clicks), 'click count should be in plugin storage').toContain(2);
    });

    test('runs its own key binding', async ({page}) => {
        await page.locator('#message-input').focus();
        await page.keyboard.press('Alt+KeyJ');
        await waitForOutputContaining(page, 'alt-h pressed');
    });

    test('its key action is listed in Klawisze, where the player can move it and reset it', async ({page}) => {
        await openKeysWindow(page);
        const section = page.locator('#binds-modal [data-section="plugin"]');
        await expect(section.getByText('Ping testowy')).toBeVisible();
        await expect(section.getByText(PLUGIN_NAME)).toBeVisible();
        await expect(bindKey(page, 'plugin:rxtest.ping')).toHaveText('Alt+J');

        await captureKey(page, 'plugin:rxtest.ping', 'F7');
        await expect(bindKey(page, 'plugin:rxtest.ping')).toHaveText('F7');
        await closeKeysWindow(page);

        await page.locator('#message-input').focus();
        await page.keyboard.press('Alt+KeyJ');
        await page.keyboard.press('F7');
        await waitForOutputContaining(page, 'alt-h pressed');
        const output = await getRecentOutput(page);
        expect(output.split('alt-h pressed').length - 1, 'only the new key should fire').toBe(1);

        await openKeysWindow(page);
        await section.getByRole('button', {name: 'domyślny'}).click();
        await expect(bindKey(page, 'plugin:rxtest.ping')).toHaveText('Alt+J');
    });

    test('waits for a game line', async ({page}) => {
        await submitCommand(page, '/rx-wait');
        await pushText(page, 'Ping abc');
        await waitForOutputContaining(page, 'pong abc');
    });
});
