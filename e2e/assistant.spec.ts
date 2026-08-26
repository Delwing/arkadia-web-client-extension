import {expect, test} from './support/fixtures';
import type {Page, Route} from '@playwright/test';
import {
    ensureGameSocket,
    getLastOutgoingCommand,
    submitCommand,
    waitForCommandInput,
} from './support/mocks';

const WORKER_URL = 'http://localhost:8787';

function sse(frames: unknown[]): string {
    return frames.map(frame => `data: ${JSON.stringify(frame)}\n\n`).join('');
}

/**
 * Stand in for the Worker. The real one is a separate deploy target; what this
 * spec verifies is the client half of the contract — frames in, streamed prose
 * and validated proposal cards out.
 */
async function stubWorker(page: Page, frames: unknown[]) {
    await page.route(`${WORKER_URL}/ask`, (route: Route) => {
        if (route.request().method() === 'OPTIONS') {
            return route.fulfill({
                status: 204,
                headers: {
                    'access-control-allow-origin': '*',
                    'access-control-allow-headers': 'content-type',
                    'access-control-allow-methods': 'POST, OPTIONS',
                },
            });
        }
        return route.fulfill({
            status: 200,
            headers: {
                'content-type': 'text/event-stream; charset=utf-8',
                'access-control-allow-origin': '*',
            },
            body: sse(frames),
        });
    });
}

async function bootWithAssistant(page: Page, frames: unknown[]) {
    await page.addInitScript((url: string) => {
        localStorage.setItem('arkadia.assistantWorkerUrl', url);
    }, WORKER_URL);
    await stubWorker(page, frames);
    await page.goto('/');
    await waitForCommandInput(page);
    await ensureGameSocket(page);
}

const ALIAS_FRAMES = [
    {type: 'delta', text: 'Alias mozesz dodac w ustawieniach klienta. '},
    {type: 'delta', text: 'Ponizej gotowa propozycja.'},
    {
        type: 'proposals',
        proposals: [{
            kind: 'alias',
            pattern: 'zz',
            command: 'zabij wszystko',
            label: 'Skrot na atak',
        }],
    },
    {type: 'done', quota: {used: 1, limit: 20, resetsAt: 0}},
];

test.describe('AI assistant panel', () => {
    test('opens on /pomoc, streams an answer and applies a proposed alias', async ({page}) => {
        await bootWithAssistant(page, ALIAS_FRAMES);

        await submitCommand(page, '/pomoc jak dodac alias');

        const panel = page.locator('.assistant-popup__messages');
        await expect(panel, 'should open the assistant panel').toBeVisible();

        // The question from `/pomoc <pytanie>` is asked immediately.
        await expect(panel).toContainText('jak dodac alias');
        await expect(panel, 'should render the streamed answer')
            .toContainText('Alias mozesz dodac w ustawieniach klienta. Ponizej gotowa propozycja.');

        const card = page.locator('.assistant-card');
        await expect(card, 'should render one validated proposal card').toHaveCount(1);
        await expect(card).toContainText('Nowy alias');
        await expect(card).toContainText('zabij wszystko');

        // Nothing may be written before the click.
        expect(await page.evaluate(() => localStorage.getItem('aliases'))).toBeNull();

        await card.getByRole('button', {name: 'Zastosuj'}).click();
        await expect(card).toContainText('Dodano alias');

        expect(JSON.parse(await page.evaluate(() => localStorage.getItem('aliases') ?? '[]')))
            .toEqual([{pattern: 'zz', command: 'zabij wszystko'}]);

        // The alias is live immediately — userAliases re-registers on storage change.
        await submitCommand(page, 'zz');
        await expect
            .poll(async () => await getLastOutgoingCommand(page), {
                message: 'applied alias should fire without a reload',
            })
            .toBe('zabij wszystko');
    });

    test('rejecting a proposal writes nothing', async ({page}) => {
        await bootWithAssistant(page, ALIAS_FRAMES);

        await submitCommand(page, '/pomoc jak dodac alias');

        const card = page.locator('.assistant-card');
        await expect(card).toHaveCount(1);
        await card.getByRole('button', {name: 'Odrzuc'}).click();

        await expect(card).toContainText('Odrzucono');
        expect(await page.evaluate(() => localStorage.getItem('aliases'))).toBeNull();
    });

    test('discards partial text when the Worker sends a restart frame', async ({page}) => {
        await bootWithAssistant(page, [
            {type: 'delta', text: 'ZLA ODPOWIEDZ ktora zdechla w polowie'},
            {type: 'restart', source: 'gemini-1'},
            {type: 'delta', text: 'Poprawna odpowiedz od drugiego dostawcy.'},
            {type: 'done'},
        ]);

        await submitCommand(page, '/pomoc test');

        const panel = page.locator('.assistant-popup__messages');
        await expect(panel).toContainText('Poprawna odpowiedz od drugiego dostawcy.');
        await expect(panel, 'restart must wipe everything streamed before it')
            .not.toContainText('ZLA ODPOWIEDZ');
    });

    test('surfaces command flags and repairs on the card', async ({page}) => {
        await bootWithAssistant(page, [
            {type: 'delta', text: 'Propozycja ponizej.'},
            {
                type: 'proposals',
                proposals: [{
                    kind: 'trigger',
                    triggerType: 'pattern',
                    // Polish letters in a pattern are repaired, not rejected.
                    pattern: 'Zabiłeś (.+)',
                    macros: [{type: 'command', command: 'wyrzuc zwloki'}],
                    label: 'Sprzatanie po walce',
                }],
            },
            {type: 'done'},
        ]);

        await submitCommand(page, '/pomoc posprzataj po walce');

        const card = page.locator('.assistant-card');
        await expect(card).toHaveCount(1);
        await expect(card, 'the diacritic fold must be shown to the user')
            .toContainText('Poprawiono automatycznie');
        await expect(card).toContainText('Zabiles (.+)');
        await expect(card, 'a destructive command must be flagged prominently')
            .toContainText('Komenda wyrzuca przedmioty.');
    });

    test('drops proposals that fail validation instead of offering them', async ({page}) => {
        await bootWithAssistant(page, [
            {type: 'delta', text: 'Sprobuje.'},
            {
                type: 'proposals',
                proposals: [{kind: 'settings', key: 'zmyslonyKlucz', value: 1, label: 'Nieistniejace'}],
            },
            {type: 'done'},
        ]);

        await submitCommand(page, '/pomoc zmien zmyslony klucz');

        await expect(page.locator('.assistant-card')).toHaveCount(0);
        await expect(page.locator('.assistant-msg__dropped')).toContainText('Odrzucono 1');
    });

    test('reports pool exhaustion instead of failing silently', async ({page}) => {
        await bootWithAssistant(page, [
            {
                type: 'error',
                status: 'pool_exhausted',
                message: 'Wszyscy dostawcy sa chwilowo niedostepni.',
                retryAfter: 3600,
            },
        ]);

        await submitCommand(page, '/pomoc cokolwiek');

        await expect(page.locator('.assistant-msg--failed'))
            .toContainText('Wszyscy dostawcy sa chwilowo niedostepni.');
    });
});
