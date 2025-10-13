export type MapExportData = MapData.Map;

export type MapColors = MapData.Env[];

export interface NpcEntry {
  name: string;
  loc: number;
  cmd?: string;
  body?: string;
}

export interface MagicsFile {
  magics: Record<string, { regexps?: string[] } | undefined>;
}

export interface MagicKeysFile {
  magic_keys: string[];
}

export interface HerbForms {
  mianownik: string;
  dopelniacz: string;
  biernik: string;
  mnoga_mianownik: string;
  mnoga_dopelniacz: string;
  mnoga_biernik: string;
}

export interface HerbUse {
  action: string;
  effect: string;
}

export interface HerbsData {
  herb_id_to_odmiana: Record<string, HerbForms>;
  version: number;
  herb_id_to_use: Record<string, HerbUse[]>;
}

export interface Person {
  id: string;
  name: string;
  description: string;
  guild: string
}

export type NpcCollection = NpcEntry[];
export type MagicsCollection = MagicsFile;
export type MagicKeysCollection = MagicKeysFile;
export type HerbsCollection = HerbsData;
export type PeopleCollection = Person[];
