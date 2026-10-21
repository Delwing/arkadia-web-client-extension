import { afterEach, describe, expect, it } from 'vitest';
import type { PluginFile } from '@client/utils/pluginEditorStorage';
import { FolderWatcher, foldersOf, scanFolder, type FolderChanges } from '../../editor/localFolder';

// An in-memory stand-in for a FileSystemDirectoryHandle: files keyed by
// path, each with the time it was last written.
class FakeFolder {
    files = new Map<string, { content: string; lastModified: number }>();
    clock = 1000;

    put(path: string, content: string) {
        this.files.set(path, { content, lastModified: ++this.clock });
    }

    handle(prefix = '', name = 'plugin'): FileSystemDirectoryHandle {
        const folder = this;
        const childNames = () => {
            const names = new Map<string, 'file' | 'directory'>();
            for (const path of folder.files.keys()) {
                if (!path.startsWith(prefix)) continue;
                const [head, ...rest] = path.slice(prefix.length).split('/');
                names.set(head, rest.length ? 'directory' : 'file');
            }
            return names;
        };
        const fileHandle = (path: string) => ({
            kind: 'file',
            name: path.split('/').pop(),
            async getFile() {
                const entry = folder.files.get(path)!;
                return { size: entry.content.length, lastModified: entry.lastModified, text: async () => entry.content };
            },
            async createWritable() {
                return {
                    write: async (content: string) => folder.put(path, content),
                    close: async () => {},
                };
            },
        });
        return {
            kind: 'directory',
            name,
            async *values() {
                for (const [child, kind] of childNames()) {
                    yield kind === 'file' ? fileHandle(prefix + child) : folder.handle(`${prefix}${child}/`, child);
                }
            },
            async getDirectoryHandle(child: string) {
                return folder.handle(`${prefix}${child}/`, child);
            },
            async getFileHandle(child: string, options?: { create?: boolean }) {
                const path = prefix + child;
                if (!folder.files.has(path)) {
                    if (!options?.create) throw new DOMException('missing', 'NotFoundError');
                    folder.put(path, '');
                }
                return fileHandle(path);
            },
            async removeEntry(child: string) {
                folder.files.delete(prefix + child);
            },
        } as unknown as FileSystemDirectoryHandle;
    }
}

function files(entries: Record<string, string>): Record<string, PluginFile> {
    const out: Record<string, PluginFile> = {};
    for (const [path, content] of Object.entries(entries)) out[path] = { path, content, language: 'typescript' };
    return out;
}

function contents(folder: FakeFolder): Record<string, string> {
    return Object.fromEntries([...folder.files].map(([path, entry]) => [path, entry.content]));
}

const watchers: FolderWatcher[] = [];

function watch(folder: FakeFolder) {
    const reported: FolderChanges[] = [];
    const watcher = new FolderWatcher('p1', folder.handle(), async changes => { reported.push(changes); }, () => {}, 60_000);
    watchers.push(watcher);
    return { watcher, reported };
}

afterEach(() => {
    watchers.splice(0).forEach(watcher => watcher.stop());
});

describe('scanFolder', () => {
    it('takes source files and skips tooling folders, dot-files and lock files', async () => {
        const folder = new FakeFolder();
        folder.put('index.ts', 'a');
        folder.put('lib/util.ts', 'b');
        folder.put('node_modules/x/index.js', 'c');
        folder.put('.idea/workspace.xml', 'd');
        folder.put('.eslintrc.json', 'e');
        folder.put('package-lock.json', '{}');
        folder.put('logo.png', 'f');
        folder.put('index.ts___jb_tmp___', 'g');

        const scanned = await scanFolder(folder.handle());
        expect([...scanned.keys()].sort()).toEqual(['index.ts', 'lib/util.ts']);
    });
});

describe('foldersOf', () => {
    it('lists every folder on the way to each file', () => {
        expect(foldersOf(['index.ts', 'a/b/c.ts', 'a/d.ts'])).toEqual(['a', 'a/b']);
    });
});

describe('FolderWatcher', () => {
    it('fills an empty folder from the plugin', async () => {
        const folder = new FakeFolder();
        const { watcher, reported } = watch(folder);

        await watcher.start(files({ 'index.ts': 'a', 'lib/util.ts': 'b' }), Infinity);

        expect(contents(folder)).toEqual({ 'index.ts': 'a', 'lib/util.ts': 'b' });
        expect(reported).toEqual([]);
    });

    it('on start takes folder files newer than the last save and writes back older ones', async () => {
        const folder = new FakeFolder();
        folder.put('old.ts', 'stale');
        const savedAt = folder.clock;
        folder.put('index.ts', 'from IDE');
        const { watcher, reported } = watch(folder);

        await watcher.start(files({ 'index.ts': 'saved', 'old.ts': 'saved later', 'new.ts': 'n' }), savedAt);

        expect(reported).toEqual([{ changed: [{ path: 'index.ts', content: 'from IDE' }], removed: [] }]);
        expect(contents(folder)).toEqual({ 'index.ts': 'from IDE', 'old.ts': 'saved later', 'new.ts': 'n' });
    });

    it('reports files the IDE writes, and not its own writes', async () => {
        const folder = new FakeFolder();
        const { watcher, reported } = watch(folder);
        await watcher.start(files({ 'index.ts': 'a' }), Infinity);

        await watcher.writePlugin(files({ 'index.ts': 'from browser' }));
        await watcher.poll();
        expect(reported).toEqual([]);

        folder.put('index.ts', 'from IDE');
        folder.put('lib/new.ts', 'n');
        await watcher.poll();
        expect(reported).toEqual([{
            changed: [{ path: 'index.ts', content: 'from IDE' }, { path: 'lib/new.ts', content: 'n' }],
            removed: [],
        }]);
    });

    it('reports a removal only once the file stays gone, riding out save-by-rename', async () => {
        const folder = new FakeFolder();
        const { watcher, reported } = watch(folder);
        await watcher.start(files({ 'index.ts': 'a', 'util.ts': 'b' }), Infinity);

        folder.files.delete('util.ts');
        await watcher.poll();
        expect(reported).toEqual([]);
        folder.put('util.ts', 'b2');
        await watcher.poll();
        expect(reported).toEqual([{ changed: [{ path: 'util.ts', content: 'b2' }], removed: [] }]);

        folder.files.delete('util.ts');
        await watcher.poll();
        await watcher.poll();
        expect(reported[1]).toEqual({ changed: [], removed: ['util.ts'] });
    });

    it('writing the plugin removes files it no longer has, but leaves ignored ones', async () => {
        const folder = new FakeFolder();
        folder.put('node_modules/x.js', 'keep');
        const { watcher } = watch(folder);
        await watcher.start(files({ 'index.ts': 'a', 'gone.ts': 'b' }), Infinity);

        await watcher.writePlugin(files({ 'index.ts': 'a' }));

        expect(contents(folder)).toEqual({ 'node_modules/x.js': 'keep', 'index.ts': 'a' });
    });
});
