import 'fake-indexeddb/auto';
import { firstValueFrom } from 'rxjs';
import { timeout } from 'rxjs/operators';
import { DefaultDataCatalog } from '../../../src/runtime/data/default-catalog';
import type { DataCatalogReadyEvent, NpcDefinition } from '../../../src/runtime/data';
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

    it('marks loader errors in metadata when load fails', async () => {
        const catalog = new DefaultDataCatalog();
        catalog.register({
            key: 'failing',
            loader: async () => {
                throw new Error('boom');
            },
        });

        await expect(catalog.load('failing')).rejects.toThrow('boom');
        const metadata = catalog.metadataFor('failing');
        expect(metadata?.status).toBe('error');
        expect(metadata?.error).toBe('boom');
    });

    it('resets dataset metadata to idle after clearing', async () => {
        const catalog = new DefaultDataCatalog();
        catalog.register({
            key: 'to-clear',
            loader: async ({ persist }) => {
                const payload = { value: 1 };
                await persist(payload);
                return payload;
            },
        });

        await catalog.load('to-clear');
        await catalog.clear('to-clear');

        expect(catalog.get('to-clear')).toBeUndefined();
        expect(catalog.metadataFor('to-clear')).toMatchObject({ key: 'to-clear', status: 'idle' });
    });

    it('exposes dedicated helpers for core datasets', async () => {
        const baseCatalog = new DefaultDataCatalog();
        registerCoreLoaders({
            catalog: baseCatalog,
            mapSource: async () => [
                {
                    areaName: 'Test',
                    areaId: 'test',
                    rooms: [],
                    labels: [],
                },
            ],
            npcSource: async () => [{ name: 'Npc', loc: 1 }] as NpcDefinition[],
            colorSource: async () => [
                {
                    envId: 'env',
                    colors: [],
                },
            ],
        });

        await baseCatalog.loadAll();

        expect(baseCatalog.getMapData()).toEqual([
            {
                areaName: 'Test',
                areaId: 'test',
                rooms: [],
                labels: [],
            },
        ]);
        expect(baseCatalog.getNpcData()).toEqual([{ name: 'Npc', loc: 1 }]);
        expect(baseCatalog.getColorPalettes()).toEqual([
            {
                envId: 'env',
                colors: [],
            },
        ]);
        expect(baseCatalog.getMapMetadata()).toMatchObject({ key: MAP_DATASET_KEY, status: 'ready' });
        expect(baseCatalog.getNpcMetadata()).toMatchObject({ key: NPC_DATASET_KEY, status: 'ready' });
        expect(baseCatalog.getColorMetadata()).toMatchObject({ key: COLORS_DATASET_KEY, status: 'ready' });
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
