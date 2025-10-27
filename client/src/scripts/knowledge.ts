import Client from '../Client';
import { colorString, findClosestColor } from '../Colors';
import {
  DEFAULT_KNOWLEDGE_CHARACTER_KEY,
  getKnowledgeStore,
  KnowledgeCategoryStatus,
  KnowledgeLibraryEntry,
  KnowledgeSnapshot,
} from '../dataStores/knowledgeStore';
import { getCurrentCharacter } from '../storage';

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
const KNOWLEDGE_PROMPT_PATTERN =
  /^Wiedze o czym chcesz zglebiac\? (.*)$/;

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

function getUniqueLibraryCategories(library: KnowledgeLibraryEntry): string[] {
  const seen = new Set<string>();
  const unique: string[] = [];

  for (const category of library.categories) {
    const key = category.toLowerCase();
    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    unique.push(category);
  }

  return unique;
}

export default function initKnowledge(client: Client, aliases?: AliasEntry[]) {
  const aliasList = aliases ?? client.aliases;
  const store = getKnowledgeStore();
  let currentLibraryId: string | null = null;
  let currentSnapshot: KnowledgeSnapshot | undefined;
  let pendingPromptTrigger: {
    trigger: ReturnType<typeof client.Triggers.registerOneTimeTrigger>;
    timeoutId: number;
  } | null = null;

  function getCharacterProgressKey(): string {
    const current = getCurrentCharacter();
    if (!current) {
      return DEFAULT_KNOWLEDGE_CHARACTER_KEY;
    }
    const trimmed = current.trim();
    return trimmed.length > 0 ? trimmed : DEFAULT_KNOWLEDGE_CHARACTER_KEY;
  }

  void store.refresh().catch((error) => {
    console.error('Failed to refresh knowledge data:', error);
  });

  store.subscribe((snapshot) => {
    currentSnapshot = snapshot ?? undefined;
    if (client.Map.currentRoom) {
      updateCurrentLibrary(client.Map.currentRoom);
    }
  });

  function clearPendingPrompt(removeTrigger: boolean) {
    if (!pendingPromptTrigger) {
      return;
    }

    window.clearTimeout(pendingPromptTrigger.timeoutId);
    if (removeTrigger) {
      client.Triggers.removeTrigger(pendingPromptTrigger.trigger);
    }
    pendingPromptTrigger = null;
  }

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
        const characterKey = getCharacterProgressKey();
        const characterProgress = { ...(nextProgress[characterKey] ?? {}) };
        const libraryProgress = { ...(characterProgress[libraryId] ?? {}) };
        const previousStatus = libraryProgress[normalized];

        if (previousStatus === 'completed' && status !== 'completed') {
          return snapshot;
        }

        if (previousStatus === status) {
          return snapshot;
        }

        libraryProgress[normalized] = status;
        characterProgress[libraryId] = libraryProgress;
        nextProgress[characterKey] = characterProgress;

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

  client.addEventListener('command', (event: CustomEvent<string>) => {
    const command = (event.detail ?? '').trim();
    if (command !== 'zglebiaj wiedze') {
      return;
    }

    clearPendingPrompt(true);
    const trigger = client.Triggers.registerOneTimeTrigger(
      KNOWLEDGE_PROMPT_PATTERN,
      (_raw, _line, matches) => {
        clearPendingPrompt(false);
        const categoriesText = matches[1];
        if (categoriesText) {
          handleKnowledgePrompt(categoriesText);
        }
      },
      'knowledge-progress',
    );

    const timeoutId = window.setTimeout(() => {
      clearPendingPrompt(true);
    }, 5000);

    pendingPromptTrigger = { trigger, timeoutId };
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

  function getActiveLibraryContext():
    | {
        libraryId: string;
        library: KnowledgeLibraryEntry;
        libraryProgress: Record<string, KnowledgeCategoryStatus>;
      }
    | null {
    if (!currentSnapshot) {
      return null;
    }

    const libraryId = currentLibraryId;
    if (!libraryId) {
      return null;
    }

    const library = currentSnapshot.data.libraries[libraryId];
    if (!library) {
      return null;
    }

    const characterKey = getCharacterProgressKey();
    const characterProgress = currentSnapshot.data.progress[characterKey] ?? {};
    const libraryProgress = characterProgress[libraryId] ?? {};

    return { libraryId, library, libraryProgress };
  }

  function printLibraryCategories(
    library: KnowledgeLibraryEntry,
    libraryProgress: Record<string, KnowledgeCategoryStatus>,
    categories: string[],
  ) {
    const header = colorString(library.name, HEADER_COLOR);
    const lines = categories.map((category) => {
      const status = libraryProgress[category] ?? 'not_started';
      return ` - ${formatCategory(client, category, status)}`;
    });

    client.println([header, ...lines].join('\n'));
  }

  function handleKnowledgePrompt(categoriesText: string) {
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

    const cleaned = categoriesText.trim().replace(/\?$/, '').replace(/\s+/g, ' ');
    const normalizedPrompt = cleaned.replace(/\s+czy o\s+/gi, ', o ');
    const rawCategories = normalizedPrompt
      .split(/, o /i)
      .map((entry) => entry.trim().replace(/^[Oo]\s+/, '').trim())
      .filter((entry) => entry.length > 0);

    const normalizedCategories: string[] = [];
    const seenNormalized = new Set<string>();
    const unrecognized: string[] = [];
    for (const rawCategory of rawCategories) {
      const normalized = normalizeCategory(rawCategory, library);
      if (!normalized) {
        unrecognized.push(rawCategory);
        continue;
      }
      const key = normalized.toLowerCase();
      if (seenNormalized.has(key)) {
        continue;
      }

      seenNormalized.add(key);
      normalizedCategories.push(normalized);
    }

    const uniqueLibraryCategories = getUniqueLibraryCategories(library);
    const expectedSet = new Set(uniqueLibraryCategories);
    const seenSet = new Set(normalizedCategories);
    const missing = uniqueLibraryCategories.filter((category) => !seenSet.has(category));
    const unexpected = normalizedCategories.filter((category) => !expectedSet.has(category));

    if (
      unrecognized.length > 0 ||
      missing.length > 0 ||
      unexpected.length > 0 ||
      normalizedCategories.length !== uniqueLibraryCategories.length
    ) {
      const messages: string[] = [];
      if (unrecognized.length > 0) {
        messages.push(
          `Nie rozpoznano kategorii: ${unrecognized.join(', ')}.`,
        );
      }
      if (missing.length > 0) {
        messages.push(`Brakuje kategorii: ${missing.join(', ')}.`);
      }
      if (unexpected.length > 0) {
        messages.push(`Nieoczekiwane kategorie: ${unexpected.join(', ')}.`);
      }
      messages.push('Prosze zglosic to do developera.');
      client.println(messages.join('\n'));
      console.warn('Knowledge prompt mismatch', {
        categoriesText,
        rawCategories,
        unrecognized,
        missing,
        unexpected,
      });
      return;
    }

    const characterKey = getCharacterProgressKey();
    const characterProgress = currentSnapshot.data.progress[characterKey] ?? {};
    const libraryProgress = characterProgress[libraryId] ?? {};

    printLibraryCategories(
      library,
      libraryProgress,
      getUniqueLibraryCategories(library),
    );
  }

  function showLibraryCategories() {
    if (!currentSnapshot) {
      client.println('Dane wiedzy nie sa jeszcze dostepne.');
      return;
    }

    const context = getActiveLibraryContext();
    if (!context) {
      if (!currentLibraryId) {
        client.println('Nie jestes w bibliotece.');
        return;
      }

      client.println('Brak danych o tej bibliotece.');
      return;
    }

    printLibraryCategories(
      context.library,
      context.libraryProgress,
      getUniqueLibraryCategories(context.library),
    );
  }

  aliasList.push({ pattern: /\/zglebiaj$/, callback: showLibraryCategories });
}

