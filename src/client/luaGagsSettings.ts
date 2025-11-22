export const LUA_GAGS_STORAGE_KEY = "lua_gags_delete_lines" as const;
export const LUA_GAGS_COLORS_STORAGE_KEY = "lua_gags_colors" as const;

export const LUA_GAG_LINE_TYPES = [
    "moje_ciosy",
    "moje_spece",
    "innych_ciosy",
    "innych_ciosy_we_mnie",
    "innych_spece",
    "moje_uniki",
    "innych_uniki",
    "moje_parowanie",
    "innych_parowanie",
    "zaslony_udane",
    "zaslony_nieudane",
    "bron",
    "npc",
    "npc_spece",
] as const;

export type LuaGagLineType = typeof LUA_GAG_LINE_TYPES[number];

export type LuaGagDeleteMode = 0 | 1 | 2;

export type LuaGagsDeleteLinesSettings = Record<LuaGagLineType, LuaGagDeleteMode>;

export type LuaGagsColorsSettings = Record<LuaGagLineType, string>;

export const DEFAULT_LUA_GAGS_DELETE_LINES: LuaGagsDeleteLinesSettings = {
    moje_ciosy: 2,
    moje_spece: 2,
    innych_ciosy: 2,
    innych_ciosy_we_mnie: 2,
    innych_spece: 2,
    moje_uniki: 2,
    innych_uniki: 2,
    moje_parowanie: 2,
    innych_parowanie: 2,
    zaslony_udane: 2,
    zaslony_nieudane: 2,
    bron: 2,
    npc: 2,
    npc_spece: 2,
};

export const DEFAULT_LUA_GAGS_COLORS: LuaGagsColorsSettings = {
    moje_ciosy: "#f0f8ff",
    moje_spece: "#adff2f",
    innych_ciosy: "#d3d3d3",
    innych_ciosy_we_mnie: "#d3d3d3",
    innych_spece: "#708090",
    moje_uniki: "#4682b4",
    innych_uniki: "#2f4f4f",
    moje_parowanie: "#4682b4",
    innych_parowanie: "#2f4f4f",
    zaslony_udane: "#00bfff",
    zaslony_nieudane: "#483d8b",
    bron: "#ffd700",
    npc: "#fffaf0",
    npc_spece: "#fffaf0",
};

export function normalizeLuaGagsDeleteLines(
    value: unknown,
): LuaGagsDeleteLinesSettings {
    const normalized: LuaGagsDeleteLinesSettings = { ...DEFAULT_LUA_GAGS_DELETE_LINES };
    if (value && typeof value === "object") {
        LUA_GAG_LINE_TYPES.forEach(key => {
            const raw = (value as Record<string, unknown>)[key];
            if (raw === 0 || raw === 1 || raw === 2) {
                normalized[key] = raw;
            }
        });
    }
    return normalized;
}

export function normalizeLuaGagsColors(
    value: unknown,
): LuaGagsColorsSettings {
    const normalized: LuaGagsColorsSettings = { ...DEFAULT_LUA_GAGS_COLORS };
    if (value && typeof value === "object") {
        LUA_GAG_LINE_TYPES.forEach(key => {
            const raw = (value as Record<string, unknown>)[key];
            if (typeof raw === "string" && /^#[0-9a-fA-F]{6}$/.test(raw)) {
                normalized[key] = raw;
            }
        });
    }
    return normalized;
}
