import {createHash} from 'node:crypto';
import type {Page} from '@playwright/test';
import {expect, test} from './support/fixtures';

const blobSha = (content: string) => {
    const body = Buffer.from(content, 'utf8');
    return createHash('sha1').update(Buffer.concat([Buffer.from(`blob ${body.length}\0`), body])).digest('hex');
};

/** A fake public repository: commits of the folder `plugin`, served like GitHub's API and raw host. */
class FakeRepo {
    commits = new Map<string, Record<string, string>>();
    head = '';

    commit(files: Record<string, string>) {
        this.head = String(this.commits.size + 1).padStart(40, 'c');
        this.commits.set(this.head, files);
    }

    async serve(page: Page) {
        await page.route('https://api.github.com/**', route => {
            const url = new URL(route.request().url());
            if (url.pathname === '/repos/me/plugins/commits/main') return route.fulfill({body: this.head, headers: CORS});
            const tree = /^\/repos\/me\/plugins\/git\/trees\/(\w+)$/.exec(url.pathname);
            const files = tree && this.commits.get(tree[1]);
            if (!files) return route.fulfill({status: 404, body: '{}', headers: CORS});
            return route.fulfill({
                contentType: 'application/json',
                headers: CORS,
                body: JSON.stringify({
                    truncated: false,
                    tree: [
                        {path: 'README.md', type: 'blob', sha: blobSha('readme'), size: 6},
                        ...Object.entries(files).map(([path, content]) => ({path: `plugin/${path}`, type: 'blob', sha: blobSha(content), size: content.length})),
                    ],
                }),
            });
        });
        await page.route('https://raw.githubusercontent.com/**', route => {
            const [, , , commit, , ...path] = new URL(route.request().url()).pathname.split('/');
            const content = this.commits.get(commit)?.[path.join('/')];
            return content === undefined
                ? route.fulfill({status: 404, body: '', headers: CORS})
                : route.fulfill({body: content, headers: CORS});
        });
    }
}

const CORS = {'access-control-allow-origin': '*'};

const editorText = (page: Page) => page.locator('.editor-group.active .view-lines');

async function pull(page: Page) {
    await page.click('#actions-btn');
    await page.click('#github-pull-item');
}

test('Plugin editor imports a plugin from GitHub and pulls its changes', async ({page}) => {
    const repo = new FakeRepo();
    repo.commit({
        'index.ts': 'import {a} from "./utils/a"\nexport async function init() { return {name: "Gh", version: a} }\n',
        'utils/a.ts': 'export const a = "1.0.0"\n',
    });
    await repo.serve(page);

    await page.goto('/editor/');
    await page.click('#welcome-github-btn');
    await page.fill('#app-dialog-input', 'https://github.com/me/plugins/tree/main/plugin');
    await page.getByRole('button', {name: 'Import', exact: true}).click();

    await expect(page.locator('#status-text')).toHaveText(/Imported plugin from me\/plugins\/plugin@main/, {timeout: 30000});
    await expect(page.locator('#switcher-name')).toHaveText('plugin');
    await expect(page.locator('.file-item[data-path="utils/a.ts"]')).toBeVisible();
    await expect(page.locator('.file-item[data-path="README.md"]')).toHaveCount(0);

    // Nothing new upstream
    await pull(page);
    await expect(page.locator('#status-text')).toHaveText(/is up to date/);

    // A local change, then GitHub changes another file and adds one
    await page.dblclick('.file-item[data-path="index.ts"]');
    await editorText(page).click();
    await page.keyboard.press('Control+End');
    await page.keyboard.type('// mine\n');
    await page.keyboard.press('Control+s');
    await expect(page.locator('#status-text')).toHaveText('Saved: plugin');

    const first = repo.commits.get(repo.head)!;
    repo.commit({...first, 'utils/a.ts': 'export const a = "2.0.0"\n', 'utils/b.ts': 'export const b = 2\n'});
    await pull(page);
    await expect(page.locator('#status-text')).toHaveText(/Pulled 2 files from me\/plugins\/plugin@main/);
    await expect(page.locator('.file-item[data-path="utils/b.ts"]')).toBeVisible();
    await expect(editorText(page), 'the local change stays').toContainText('// mine');

    // Both sides change the same file: keep mine
    repo.commit({...repo.commits.get(repo.head)!, 'index.ts': 'export async function init() { return {name: "theirs"} }\n'});
    await pull(page);
    await expect(page.locator('#app-dialog-title')).toHaveText('Changed on both sides');
    await page.getByRole('button', {name: 'Keep mine'}).click();
    await expect(page.locator('#status-text')).toHaveText(/up to date/);
    await page.dblclick('.file-item[data-path="index.ts"]');
    await expect(editorText(page)).toContainText('// mine');

    // Once more, and take GitHub's this time
    repo.commit({...repo.commits.get(repo.head)!, 'index.ts': 'export async function init() { return {name: "theirs again"} }\n'});
    await pull(page);
    await page.getByRole('button', {name: 'Use GitHub\'s'}).click();
    await expect(page.locator('#status-text')).toHaveText(/Pulled 1 file/);
    await page.dblclick('.file-item[data-path="index.ts"]');
    await expect(editorText(page)).toContainText('theirs again');
    await expect(editorText(page)).not.toContainText('// mine');
});

test('Plugin editor explains a GitHub repository it cannot find', async ({page}) => {
    await page.route('https://api.github.com/**', route => route.fulfill({status: 404, body: '{}', headers: CORS}));
    await page.goto('/editor/');
    await page.click('#welcome-github-btn');
    await page.fill('#app-dialog-input', 'me/missing');
    await page.keyboard.press('Enter');
    await expect(page.locator('#status-text')).toHaveText(/me\/missing was not found/);
});
