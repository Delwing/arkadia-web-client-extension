import Client from '../Client';
import { colorString, findClosestColor } from '../Colors';
import {
  getKnowledgeStore,
  KnowledgeCategoryStatus,
  KnowledgeLibraryEntry,
  KnowledgeSnapshot,
} from '../dataStores/knowledgeStore';

type AliasEntry = { pattern: RegExp; callback: Function };

const STATUS_COLORS: Record<KnowledgeCategoryStatus, number> = {
  not_started: findClosestColor('#ffffff'),
  in_progress: findClosestColor('#ffff00'),
  completed: findClosestColor('#00ff00'),
};

const HEADER_COLOR = findClosestColor('#7cfc00');

const START_LIBRARY_PATTERN =
  /^Zaczynasz zglebiac tutejsze zasoby, probujac dowiedziec sie czegos wiecej o (.*)\.$/;
const COMPLETE_LIBRARY_PATTERN =
  /^Masz wrazenie, ze tutaj nie dowiesz sie juz niczego wiecej o (.*)\.$/;

const CATEGORY_DECLENSION_TO_BASE: Record<string, string> = {
  'chaosie i jego tworach': 'chaos i jego twory',
  goblinoidach: 'goblinoidy',
  golemach: 'golemy',
  'istotach demonicznych': 'istoty demoniczne',
  jaszczuroludziach: 'jaszczuroludzie',
  'magii i jej tworach': 'magia i jej twory',
  nieumarlych: 'nieumarli',
  'pajakach i pajakowatych': 'pajaki i pajakowate',
  ryboludziach: 'ryboludzie',
  'smokach i smokowatych': 'smoki i smokowate',
  'starszych rasach': 'starsze rasy',
  'stworach pokoniunkcyjnych': 'stwory pokoniunkcyjne',
  szczuroludziach: 'szczuroludzie',
  wampirach: 'wampiry',
};

const CATEGORY_BASE_TO_DATIVE: Record<string, string> = {
  'chaos i jego twory': 'chaosie i jego tworach',
  goblinoidy: 'goblinoidach',
  golemy: 'golemach',
  'istoty demoniczne': 'istotach demonicznych',
  jaszczuroludzie: 'jaszczuroludziach',
  'magia i jej twory': 'magii i jej tworach',
  nieumarli: 'nieumarlych',
  'pajaki i pajakowate': 'pajakach i pajakowatych',
  ryboludzie: 'ryboludziach',
  'smoki i smokowate': 'smokach i smokowatych',
  'starsze rasy': 'starszych rasach',
  'stwory pokoniunkcyjne': 'stworach pokoniunkcyjnych',
  szczuroludzie: 'szczuroludziach',
  wampiry: 'wampirach',
};

function normalizeCategory(category: string, library: KnowledgeLibraryEntry): string | null {
  const trimmed = category.trim();
  const lowerTrimmed = trimmed.toLowerCase();
  const baseCandidate =
    CATEGORY_DECLENSION_TO_BASE[lowerTrimmed] !== undefined
      ? CATEGORY_DECLENSION_TO_BASE[lowerTrimmed]
      : trimmed;

  for (const entry of library.categories) {
    if (entry.toLowerCase() === baseCandidate.toLowerCase()) {
      return entry;
    }
  }

  if (baseCandidate !== trimmed) {
    for (const entry of library.categories) {
      if (entry.toLowerCase() === trimmed.toLowerCase()) {
        return entry;
      }
    }
  }

  return null;
}

function formatCategory(
  client: Client,
  category: string,
  status: KnowledgeCategoryStatus,
): string {
  const dativeCategory =
    CATEGORY_BASE_TO_DATIVE[category.toLowerCase()] ?? category;
  const clickable = client.OutputHandler.makeStringClickable(category, () => {
    client.sendCommand(`zglebiaj wiedze o ${dativeCategory}`);
  });
  return colorString(clickable, STATUS_COLORS[status]);
}

export default function initKnowledge(client: Client, aliases?: AliasEntry[]) {
  const aliasList = aliases ?? client.aliases;
  const store = getKnowledgeStore();
  let currentLibraryId: string | null = null;
  let currentSnapshot: KnowledgeSnapshot | undefined;

  void store.refresh().catch((error) => {
    console.error('Failed to refresh knowledge data:', error);
  });

  store.subscribe((snapshot) => {
    currentSnapshot = snapshot ?? undefined;
    if (client.Map.currentRoom) {
      updateCurrentLibrary(client.Map.currentRoom);
    }
  });

  function updateCurrentLibrary(room: any) {
    const internalId: string | undefined = room?.userData?.internal_id;
    if (!internalId || !currentSnapshot?.data.libraries[internalId]) {
      currentLibraryId = null;
      return;
    }
    currentLibraryId = internalId;
  }

  function setProgress(category: string, status: KnowledgeCategoryStatus) {
    if (!currentSnapshot) {
      return;
    }
    const libraryId = currentLibraryId;
    if (!libraryId) {
      return;
    }
    const library = currentSnapshot.data.libraries[libraryId];
    if (!library) {
      return;
    }
    const normalized = normalizeCategory(category, library);
    if (!normalized) {
      return;
    }

    void store
      .applyLocalChange((snapshot) => {
        if (!snapshot) {
          return snapshot;
        }

        if (!snapshot.data.libraries[libraryId]) {
          return snapshot;
        }

        const nextProgress = { ...snapshot.data.progress };
        const libraryProgress = { ...(nextProgress[libraryId] ?? {}) };
        const previousStatus = libraryProgress[normalized];

        if (previousStatus === 'completed' && status !== 'completed') {
          return snapshot;
        }

        if (previousStatus === status) {
          return snapshot;
        }

        libraryProgress[normalized] = status;
        nextProgress[libraryId] = libraryProgress;

        return {
          ...snapshot,
          data: {
            ...snapshot.data,
            progress: nextProgress,
          },
        };
      })
      .catch((error) => {
        console.error('Failed to update knowledge progress:', error);
      });
  }

  client.addEventListener('enterLocation', (event: CustomEvent<{ room: any }>) => {
    updateCurrentLibrary(event.detail.room);
  });

  client.Triggers.registerTrigger(
    START_LIBRARY_PATTERN,
    (_raw, _line, matches) => {
      const category = matches[1];
      if (category) {
        setProgress(category, 'in_progress');
      }
    },
    'knowledge-progress',
  );

  client.Triggers.registerTrigger(
    COMPLETE_LIBRARY_PATTERN,
    (_raw, _line, matches) => {
      const category = matches[1];
      if (category) {
        setProgress(category, 'completed');
      }
    },
    'knowledge-progress',
  );

  function showLibraryCategories() {
    if (!currentSnapshot) {
      client.println('Dane wiedzy nie sa jeszcze dostepne.');
      return;
    }

    const libraryId = currentLibraryId;
    if (!libraryId) {
      client.println('Nie jestes w bibliotece.');
      return;
    }

    const library = currentSnapshot.data.libraries[libraryId];
    if (!library) {
      client.println('Brak danych o tej bibliotece.');
      return;
    }

    const progress = currentSnapshot.data.progress[libraryId] ?? {};
    const header = colorString(library.name, HEADER_COLOR);
    const lines = library.categories.map((category) => {
      const status = progress[category] ?? 'not_started';
      return ` - ${formatCategory(client, category, status)}`;
    });

    client.println([header, ...lines].join('\n'));
  }

  aliasList.push({ pattern: /\/zglebiaj$/, callback: showLibraryCategories });
}

