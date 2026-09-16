import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { characterStorage } from "@modules/core/storage";
import type { Settings } from "@modules/core/defaultSettings";
import type { SettingsCategoryKey } from "@web/settings/categories.ts";
import {
    CollectSection,
    CombatCommandsSection,
    ContainersSection,
    CuttingSection,
    DrawSheatheSection,
    ExitsSection,
    HerbsSection,
    LanguageSection,
    OtherOptionsSection,
} from "./Settings";
import { useGeneralSettingsForm } from "./useGeneralSettingsForm";
import GuildsSettings from "./GuildsSettings";
import LuaGagsSettings from "./LuaGagsSettings";
import EnemyBindsSettings from "./EnemyBindsSettings";
import MagikiSettings from "./MagikiSettings";

type CharacterCategoryKey = Extract<SettingsCategoryKey, `character-${string}`>;
type SaveFn = (settings: Settings) => void;
type Panel = "general" | "guild" | "luaGags" | "enemyBinds" | "magiki";

export interface CharacterSettingsPages {
    pages: Record<CharacterCategoryKey, ReactNode>;
    /** The selected character, or null while none is chosen (pages are read-only then). */
    character: string | null;
    /** Dialog opened: drop unsaved edits and start from what is stored. */
    reload: () => void;
    save: () => void;
}

/**
 * The character-settings half of the settings dialog. Every panel contributes
 * a save callback; saving runs them all over one copy of the stored `settings`
 * and writes it once.
 */
export function useCharacterSettingsPages(): CharacterSettingsPages {
    const saveRefs = useRef<Record<Panel, SaveFn>>({
        general: () => {}, guild: () => {}, luaGags: () => {}, enemyBinds: () => {}, magiki: () => {},
    });
    const register = useRef(Object.fromEntries(
        (["general", "guild", "luaGags", "enemyBinds", "magiki"] as Panel[]).map(panel => [
            panel,
            (fn: SaveFn) => { saveRefs.current[panel] = fn; },
        ]),
    ) as Record<Panel, (fn: SaveFn) => void>).current;

    const [character, setCharacter] = useState<string | null>(characterStorage.getCharacter());
    // Remounting the self-contained panels is how they drop unsaved edits.
    const [generation, setGeneration] = useState(0);

    useEffect(() => characterStorage.onCharacterChange(() => setCharacter(characterStorage.getCharacter())), []);

    const general = useGeneralSettingsForm(register.general);
    const reloadGeneral = general.reload;

    const reload = useCallback(() => {
        reloadGeneral();
        setGeneration(g => g + 1);
    }, [reloadGeneral]);

    const save = useCallback(() => {
        const updated = { ...(characterStorage.get("settings") ?? {} as Settings) };
        for (const fn of Object.values(saveRefs.current)) fn(updated);
        characterStorage.set("settings", updated);
    }, []);

    const form = { settings: general.settings, onChangeSetting: general.onChangeSetting };

    const pages: Record<CharacterCategoryKey, ReactNode> = {
        "character-general": (
            <>
                <ExitsSection {...form} />
                <OtherOptionsSection {...form} />
                <LanguageSection {...form} />
            </>
        ),
        "character-items": (
            <>
                <ContainersSection {...form} />
                <CollectSection {...form} />
                <HerbsSection {...form} />
                <CuttingSection {...form} />
            </>
        ),
        "character-combat": (
            <>
                <CombatCommandsSection {...form} />
                <DrawSheatheSection {...form} />
                <EnemyBindsSettings key={`enemyBinds-${generation}`} registerSave={register.enemyBinds} />
                <LuaGagsSettings key={`luaGags-${generation}`} registerSave={register.luaGags} />
            </>
        ),
        "character-guilds": <GuildsSettings key={generation} registerSave={register.guild} />,
        "character-magics": <MagikiSettings key={generation} registerSave={register.magiki} />,
    };

    return { pages, character, reload, save };
}
