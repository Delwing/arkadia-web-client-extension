import { stripPolishCharacters } from './stripPolishCharacters';

export type KnowledgeCategoryBaseName =
  | 'Chaos i jego twory'
  | 'goblinoidy'
  | 'golemy'
  | 'istoty demoniczne'
  | 'jaszczuroludzie'
  | 'magia i jej twory'
  | 'nieumarli'
  | 'pajaki i pajakowate'
  | 'ryboludzie'
  | 'smoki i smokowate'
  | 'starsze rasy'
  | 'stwory pokoniunkcyjne'
  | 'szczuroludzie'
  | 'wampiry';

export interface KnowledgeCategoryConfig {
  base: KnowledgeCategoryBaseName;
  dative: string;
  command: string;
}

export const KNOWLEDGE_CATEGORY_CONFIG: KnowledgeCategoryConfig[] = [
  {
    base: 'Chaos i jego twory',
    dative: 'chaosie i jego tworach',
    command: 'wiedza o chaosie i jego tworach',
  },
  {
    base: 'goblinoidy',
    dative: 'goblinoidach',
    command: 'wiedza o goblinoidach',
  },
  {
    base: 'golemy',
    dative: 'golemach',
    command: 'wiedza o golemach',
  },
  {
    base: 'istoty demoniczne',
    dative: 'istotach demonicznych',
    command: 'wiedza o istotach demonicznych',
  },
  {
    base: 'jaszczuroludzie',
    dative: 'jaszczuroludziach',
    command: 'wiedza o jaszczuroludziach',
  },
  {
    base: 'magia i jej twory',
    dative: 'magii i jej tworach',
    command: 'wiedza o magii i jej tworach',
  },
  {
    base: 'nieumarli',
    dative: 'nieumarlych',
    command: 'wiedza o nieumarlych',
  },
  {
    base: 'pajaki i pajakowate',
    dative: 'pajakach i pajakowatych',
    command: 'wiedza o pajakach i pajakowatych',
  },
  {
    base: 'ryboludzie',
    dative: 'ryboludziach',
    command: 'wiedza o ryboludziach',
  },
  {
    base: 'smoki i smokowate',
    dative: 'smokach i smokowatych',
    command: 'wiedza o smokach i smokowatych',
  },
  {
    base: 'starsze rasy',
    dative: 'starszych rasach',
    command: 'wiedza o starszych rasach',
  },
  {
    base: 'stwory pokoniunkcyjne',
    dative: 'stworach pokoniunkcyjnych',
    command: 'wiedza o stworach pokoniunkcyjnych',
  },
  {
    base: 'szczuroludzie',
    dative: 'szczuroludziach',
    command: 'wiedza o szczuroludziach',
  },
  {
    base: 'wampiry',
    dative: 'wampirach',
    command: 'wiedza o wampirach',
  },
];

const baseLookup = new Map<string, KnowledgeCategoryBaseName>();
const dativeLookup = new Map<string, KnowledgeCategoryBaseName>();
const baseToDative = new Map<KnowledgeCategoryBaseName, string>();

for (const config of KNOWLEDGE_CATEGORY_CONFIG) {
  const lowerBase = normalizeKey(config.base);
  const lowerDative = normalizeKey(config.dative);
  baseLookup.set(lowerBase, config.base);
  dativeLookup.set(lowerDative, config.base);
  baseToDative.set(config.base, config.dative);
}

function normalizeKey(input: string): string {
  return stripPolishCharacters(input.trim().toLowerCase().replace(/\s+/g, ' '));
}

export const KNOWLEDGE_CATEGORY_ORDER = KNOWLEDGE_CATEGORY_CONFIG.map((config) => config.base);

export function getBaseCategoryFromName(name: string): KnowledgeCategoryBaseName | null {
  const normalized = normalizeKey(name);
  const result = baseLookup.get(normalized) ?? dativeLookup.get(normalized);
  if (result) return result;

  // Try stripping "o " prefix (DB stores "o goblinoidach", config has "goblinoidach")
  const withoutO = normalized.replace(/^o /, '');
  if (withoutO !== normalized) {
    return dativeLookup.get(withoutO) ?? null;
  }

  return null;
}

export function getDativeCategoryName(base: string): string {
  const normalized = normalizeKey(base);
  const category = baseLookup.get(normalized);
  if (!category) {
    return base;
  }
  return baseToDative.get(category) ?? base;
}

export function isKnowledgeCategoryBaseName(
  value: string,
): value is KnowledgeCategoryBaseName {
  return baseLookup.has(normalizeKey(value));
}
