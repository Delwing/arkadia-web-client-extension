import { beforeEach, describe, expect, it, vi } from 'vitest';
import { InvalidSnapshotError } from '@modules/data/dataStore/validation';
import { getKnowledgeDetailsStore } from '@modules/data/dataStores/knowledgeDetailsStore';

const loadWiedza = vi.fn();
vi.mock('@modules/data/wiedzaLoader.ts', () => ({ default: () => loadWiedza() }));

const CATEGORY = 'goblinoidy';

function definitions(exploration: string[]) {
  return { [CATEGORY]: { fight: [], books: [], exploration } } as any;
}

function withProgress(exploration: string[]) {
  return (current: any) => ({
    ...current,
    data: {
      ...current.data,
      progress: {
        Alice: {
          [CATEGORY]: {
            entries: { fight: [], books: [], exploration },
            unknownEntries: { fight: [], books: [], exploration: [] },
            levels: {},
            updatedAt: 1,
          },
        },
      },
    },
  });
}

async function freshStore() {
  const store = getKnowledgeDetailsStore();
  await store.clear();
  return store;
}

async function progressOf(store: Awaited<ReturnType<typeof freshStore>>) {
  return (await store.getSnapshot())?.data.progress.Alice?.[CATEGORY as never] as any;
}

describe('knowledgeDetailsStore when wiedza is unavailable', () => {
  beforeEach(() => loadWiedza.mockReset());

  it('keeps the stored progress when wiedza yields no definitions', async () => {
    const store = await freshStore();
    loadWiedza.mockResolvedValue(definitions(['Zbadales las']));
    await store.refresh({ force: true });
    await store.applyLocalChange(withProgress(['Zbadales las']));

    loadWiedza.mockResolvedValue({});
    await expect(store.refresh({ force: true })).rejects.toBeInstanceOf(InvalidSnapshotError);

    expect((await progressOf(store)).entries.exploration).toEqual(['Zbadales las']);
  });

  it('brings an entry back from unknown once the definitions have it again', async () => {
    const store = await freshStore();
    loadWiedza.mockResolvedValue(definitions(['Zbadales las']));
    await store.refresh({ force: true });
    await store.applyLocalChange(withProgress(['Zbadales gory']));

    // A definitions list that lacks the entry moves it to unknown...
    await store.refresh({ force: true });
    let progress = await progressOf(store);
    expect(progress.entries.exploration).toEqual([]);
    expect(progress.unknownEntries.exploration).toEqual(['Zbadales gory']);

    // ...and one that has it again restores it instead of having dropped it
    loadWiedza.mockResolvedValue(definitions(['Zbadales las', 'Zbadales gory']));
    await store.refresh({ force: true });
    progress = await progressOf(store);
    expect(progress.entries.exploration).toEqual(['Zbadales gory']);
    expect(progress.unknownEntries.exploration).toEqual([]);
  });
});
