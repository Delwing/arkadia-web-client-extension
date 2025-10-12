import 'fake-indexeddb/auto';
import { firstValueFrom } from 'rxjs';
import { timeout } from 'rxjs/operators';
import { DefaultDataCatalog } from '../../../src/runtime/data/default-catalog';
import type { DataCatalogReadyEvent } from '../../../src/runtime/data';
import {
    COLORS_DATASET_KEY,
    MAP_DATASET_KEY,
    NPC_DATASET_KEY,
    registerCoreLoaders,
} from '../../../src/runtime/data/core-loaders';
import type { DataPersistenceAdapter } from '../../../src/runtime/data/persistence/types';

describe('DefaultDataCatalog', () => {
    class MemoryAdapter<T> implements DataPersistenceAdapter<T> {
        constructor(private value?: T) {}

        async read(): Promise<T | undefined> {
            return this.value;
        }

        async write(value: T): Promise<void> {
            this.value = value;
        }

        async clear(): Promise<void> {
            this.value = undefined;
        }
    }

    it('allows registering loaders and retrieving data', async () => {
        const catalog = new DefaultDataCatalog();
        const adapter = new MemoryAdapter<{ value: number }>();

        catalog.register({
            key: 'test',
            loader: async ({ persist }) => {
                const payload = { value: 42 };
                await persist(payload);
                return payload;
            },
            persistence: adapter,
        });

        await catalog.load('test');

        expect(catalog.get('test')).toEqual({ value: 42 });
        expect(catalog.metadataFor('test')?.status).toBe('ready');
        expect(await adapter.read()).toEqual({ value: 42 });
    });

    it('emits ready events when loaders finish', async () => {
        const catalog = new DefaultDataCatalog();
        catalog.register({
            key: 'ready-test',
            loader: async ({ persist }) => {
                const payload = { another: 'value' };
                await persist(payload);
                return payload;
            },
        });

        const eventPromise = firstValueFrom(
            catalog
                .ready$('ready-test')
                .pipe(timeout({ each: 1000 })),
        ) as Promise<DataCatalogReadyEvent<{ another: string }>>;

        await catalog.load('ready-test');

        const event = await eventPromise;
        expect(event.key).toBe('ready-test');
        expect(event.data).toEqual({ another: 'value' });
        expect(event.metadata.status).toBe('ready');
    });

    it('restores cached data and emits ready event on registration', async () => {
        const adapter = new MemoryAdapter({ cached: true });
        const catalog = new DefaultDataCatalog();

        catalog.register({
            key: 'cached',
            loader: async ({ cachedData }) => cachedData ?? { cached: false },
            persistence: adapter,
        });

        const event = await firstValueFrom(
            catalog
                .ready$('cached')
                .pipe(timeout({ each: 1000 })),
        );

        expect(event.data).toEqual({ cached: true });
        expect(event.metadata.source).toBe('cache');
        expect(catalog.get('cached')).toEqual({ cached: true });
    });

    it('waitForReady resolves cached data without triggering loaders again', async () => {
        const catalog = new DefaultDataCatalog();
        let loadCount = 0;

        catalog.register({
            key: 'cached-ready',
            loader: async ({ persist }) => {
                loadCount += 1;
                const payload = { ready: true };
                await persist(payload);
                return payload;
            },
        });

        await catalog.waitForReady('cached-ready');
        expect(loadCount).toBe(1);

        const second = await catalog.waitForReady<{ ready: boolean }>('cached-ready');
        expect(loadCount).toBe(1);
        expect(second.data).toEqual({ ready: true });
        expect(second.metadata.status).toBe('ready');
    });

    it('deduplicates concurrent waitForReady calls', async () => {
        const catalog = new DefaultDataCatalog();
        let loadCount = 0;

        catalog.register({
            key: 'dedupe',
            loader: async ({ persist }) => {
                loadCount += 1;
                const payload = { deduped: true };
                await persist(payload);
                return payload;
            },
        });

        const [first, second] = await Promise.all([
            catalog.waitForReady<{ deduped: boolean }>('dedupe'),
            catalog.waitForReady<{ deduped: boolean }>('dedupe'),
        ]);

        expect(loadCount).toBe(1);
        expect(first.data).toEqual({ deduped: true });
        expect(second.data).toEqual({ deduped: true });
    });

    it('propagates loader errors through waitForReady', async () => {
        const catalog = new DefaultDataCatalog();

        catalog.register({
            key: 'erroring',
            loader: async () => {
                throw new Error('nope');
            },
        });

        await expect(catalog.waitForReady('erroring')).rejects.toThrow('nope');
        expect(catalog.metadataFor('erroring')?.status).toBe('error');
    });
});

describe('core data loaders', () => {
    class MemoryAdapter<T> implements DataPersistenceAdapter<T> {
        constructor(private value?: T) {}

        async read(): Promise<T | undefined> {
            return this.value;
        }

        async write(value: T): Promise<void> {
            this.value = value;
        }

        async clear(): Promise<void> {
            this.value = undefined;
        }
    }

    it('registers loaders for core datasets and marks readiness', async () => {
        const mapAdapter = new MemoryAdapter<unknown>();
        const npcAdapter = new MemoryAdapter<unknown>();
        const colorAdapter = new MemoryAdapter<unknown>();
        const catalog = registerCoreLoaders({
            catalog: new DefaultDataCatalog(),
            mapPersistence: mapAdapter,
            npcPersistence: npcAdapter,
            colorPersistence: colorAdapter,
            mapSource: async () => ({ zones: [] }),
            npcSource: async () => ({ npcs: [] }),
            colorSource: async () => ({ palette: [] }),
        });

        const mapReady = firstValueFrom(
            catalog
                .ready$(MAP_DATASET_KEY)
                .pipe(timeout({ each: 1000 })),
        );
        const npcReady = firstValueFrom(
            catalog
                .ready$(NPC_DATASET_KEY)
                .pipe(timeout({ each: 1000 })),
        );
        const colorReady = firstValueFrom(
            catalog
                .ready$(COLORS_DATASET_KEY)
                .pipe(timeout({ each: 1000 })),
        );

        await catalog.loadAll();

        await expect(mapReady).resolves.toMatchObject({ key: MAP_DATASET_KEY });
        await expect(npcReady).resolves.toMatchObject({ key: NPC_DATASET_KEY });
        await expect(colorReady).resolves.toMatchObject({ key: COLORS_DATASET_KEY });
        expect(await mapAdapter.read()).toEqual({ zones: [] });
        expect(await npcAdapter.read()).toEqual({ npcs: [] });
        expect(await colorAdapter.read()).toEqual({ palette: [] });
    });
});
