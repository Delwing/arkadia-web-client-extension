import { describe, expect, it } from 'vitest';
import {
    blobsOf,
    downloadFiles,
    gitBlobSha,
    GithubError,
    listFiles,
    parseGithubSource,
    planPull,
    resolveCommit,
    sourceUrl,
} from '../../../plugins/editor/githubSource';

const COMMIT = 'a'.repeat(40);

function respond(body: string | object, init: ResponseInit = {}) {
    return new Response(typeof body === 'string' ? body : JSON.stringify(body), init);
}

describe('parseGithubSource', () => {
    it('reads owner/repo with folder and ref', () => {
        expect(parseGithubSource('me/plugins')).toEqual({ owner: 'me', repo: 'plugins', path: '' });
        expect(parseGithubSource(' me/plugins/combat/ui@dev ')).toEqual({ owner: 'me', repo: 'plugins', path: 'combat/ui', ref: 'dev' });
        expect(parseGithubSource('me/plugins.git@v1.2')).toEqual({ owner: 'me', repo: 'plugins', path: '', ref: 'v1.2' });
    });

    it('reads github.com addresses', () => {
        expect(parseGithubSource('https://github.com/me/plugins')).toEqual({ owner: 'me', repo: 'plugins', path: '' });
        expect(parseGithubSource('github.com/me/plugins.git')).toEqual({ owner: 'me', repo: 'plugins', path: '' });
        expect(parseGithubSource('https://github.com/me/plugins/tree/main/combat?x=1')).toEqual({ owner: 'me', repo: 'plugins', path: 'combat', ref: 'main' });
    });

    it('rejects what is not a repository', () => {
        expect(parseGithubSource('plugins')).toBeNull();
        expect(parseGithubSource('me/plugins@')).toBeNull();
        expect(parseGithubSource('me/plu gins')).toBeNull();
        expect(parseGithubSource('me/plugins/../x')).toBeNull();
        expect(parseGithubSource('https://github.com/me/plugins/issues/3')).toBeNull();
    });

    it('links back to github.com', () => {
        expect(sourceUrl({ owner: 'me', repo: 'p', path: '' })).toBe('https://github.com/me/p');
        expect(sourceUrl({ owner: 'me', repo: 'p', path: 'a b', ref: 'dev' })).toBe('https://github.com/me/p/tree/dev/a%20b');
    });
});

describe('gitBlobSha', () => {
    it('matches the ids git gives', async () => {
        expect(await gitBlobSha('')).toBe('e69de29bb2d1d6434b8b29ae775ad8c2e48c5391');
        expect(await gitBlobSha('hello\n')).toBe('ce013625030ba8dba906f756967f9e9ca394464a');
        expect(await blobsOf({ 'a.ts': { content: 'hello\n' } })).toEqual({ 'a.ts': 'ce013625030ba8dba906f756967f9e9ca394464a' });
    });
});

describe('planPull', () => {
    it('takes upstream changes, keeps local ones and reports both', () => {
        const base = { same: '1', ours: '1', theirs: '1', both: '1', bothSame: '1', goneThere: '1', goneHere: '1', goneHereChangedThere: '1' };
        const local = { same: '1', ours: '2', theirs: '1', both: '2', bothSame: '2', goneThere: '1', goneHereChangedThere: undefined, newHere: '5' } as Record<string, string>;
        delete local.goneHereChangedThere;
        const remote = { same: '1', ours: '1', theirs: '3', both: '3', bothSame: '2', goneHere: '1', goneHereChangedThere: '4', newThere: '6' };
        expect(planPull(base, local, remote)).toEqual({
            update: ['newThere', 'theirs'],
            remove: ['goneThere'],
            conflicts: ['both', 'goneHereChangedThere'],
        });
    });
});

describe('GitHub requests', () => {
    const source = { owner: 'me', repo: 'repo', path: 'plugin', ref: 'main' };

    it('resolves the ref to a commit', async () => {
        const urls: string[] = [];
        const sha = await resolveCommit(source, async (url) => {
            urls.push(String(url));
            return respond(`${COMMIT}\n`);
        });
        expect(sha).toBe(COMMIT);
        expect(urls).toEqual(['https://api.github.com/repos/me/repo/commits/main']);
    });

    it('explains a missing repository and a spent rate limit', async () => {
        await expect(resolveCommit(source, async () => respond('{}', { status: 404 }))).rejects.toThrow(/not found.*private/);
        const limited = respond('{}', { status: 403, headers: { 'x-ratelimit-remaining': '0', 'x-ratelimit-reset': String(Math.floor(Date.now() / 1000) + 600) } });
        await expect(resolveCommit(source, async () => limited)).rejects.toThrow(/60 requests an hour.*10 minutes/);
        await expect(resolveCommit(source, async () => { throw new TypeError('offline'); })).rejects.toBeInstanceOf(GithubError);
    });

    it('lists the source files in the folder', async () => {
        const tree = {
            tree: [
                { path: 'README.md', type: 'blob', sha: 'r' },
                { path: 'plugin', type: 'tree', sha: 't' },
                { path: 'plugin/index.ts', type: 'blob', sha: 'i', size: 10 },
                { path: 'plugin/utils/a.ts', type: 'blob', sha: 'u', size: 10 },
                { path: 'plugin/logo.png', type: 'blob', sha: 'p', size: 10 },
                { path: 'plugin/node_modules/x/index.js', type: 'blob', sha: 'n', size: 10 },
                { path: 'plugin/.github/workflow.yml', type: 'blob', sha: 'g', size: 10 },
                { path: 'plugin/big.js', type: 'blob', sha: 'b', size: 2 * 1024 * 1024 },
                { path: 'plugin-other/index.ts', type: 'blob', sha: 'o', size: 10 },
            ],
        };
        const blobs = await listFiles(source, COMMIT, async () => respond(tree));
        expect(blobs).toEqual({ 'index.ts': 'i', 'utils/a.ts': 'u' });

        await expect(listFiles({ ...source, path: 'nope' }, COMMIT, async () => respond(tree))).rejects.toThrow(/no folder nope/);
        await expect(listFiles(source, COMMIT, async () => respond({ tree: [], truncated: true }))).rejects.toThrow(/too large/);
    });

    it('downloads files from raw.githubusercontent.com, keeping a byte order mark', async () => {
        const urls: string[] = [];
        const files = await downloadFiles({ ...source, path: 'my plugin' }, COMMIT, ['index.ts', 'utils/a.ts'], async (url) => {
            urls.push(String(url));
            return new Response(String(url).endsWith('index.ts') ? '﻿export {}' : 'x');
        });
        expect(files).toEqual({ 'index.ts': '﻿export {}', 'utils/a.ts': 'x' });
        expect(urls.sort()).toEqual([
            `https://raw.githubusercontent.com/me/repo/${COMMIT}/my%20plugin/index.ts`,
            `https://raw.githubusercontent.com/me/repo/${COMMIT}/my%20plugin/utils/a.ts`,
        ]);
    });
});
