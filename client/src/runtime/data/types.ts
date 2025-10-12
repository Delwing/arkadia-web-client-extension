export interface NpcDefinition {
    readonly name: string;
    readonly loc: number;
}

export interface HerbForms {
    readonly mianownik: string;
    readonly dopelniacz: string;
    readonly biernik: string;
    readonly mnoga_mianownik: string;
    readonly mnoga_dopelniacz: string;
    readonly mnoga_biernik: string;
}

export interface HerbUse {
    readonly action: string;
    readonly effect: string;
}

export interface HerbsData {
    readonly herb_id_to_odmiana: Record<string, HerbForms>;
    readonly version: number;
    readonly herb_id_to_use: Record<string, HerbUse[]>;
}
