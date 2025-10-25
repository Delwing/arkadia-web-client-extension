import { useEffect, useMemo, useState } from "react";
import storage, { getCurrentCharacter } from "@client/src/storage";
import { settingsStore, useSettingsSlice } from "@client/src/state/settingsStore";
import GuildSection from "./GuildSection";
import guilds from "./guilds";

function ensureGuildList(value: unknown): string[] {
    return Array.isArray(value) ? value.filter((guild): guild is string => typeof guild === "string") : [];
}

function ensureGuildColors(value: unknown): Record<string, string | undefined> {
    if (!value || typeof value !== "object") {
        return {};
    }
    const entries = Object.entries(value as Record<string, unknown>);
    const result: Record<string, string | undefined> = {};
    entries.forEach(([guild, color]) => {
        if (typeof color === "string") {
            result[guild] = color;
        }
    });
    return result;
}

function GuildsSettings({ registerSave }: { registerSave: (cb: () => void) => void }) {
    const storeGuilds = useSettingsSlice(settings => settings.guilds);
    const storeEnemyGuilds = useSettingsSlice(settings => settings.enemyGuilds);
    const storeGuildColors = useSettingsSlice(settings => settings.guildColors);
    const [selected, setSelected] = useState<string[]>(() => ensureGuildList(storeGuilds));
    const [enemySelected, setEnemySelected] = useState<string[]>(() => ensureGuildList(storeEnemyGuilds));
    const [colors, setColors] = useState<Record<string, string | undefined>>(() => ensureGuildColors(storeGuildColors));
    const [locked, setLocked] = useState(!getCurrentCharacter());
    const defaultColors = useMemo(() => {
        const map: Record<string, string> = {};
        guilds.forEach(g => {
            map[g] = '#' + Math.floor(Math.random() * 0xffffff).toString(16).padStart(6, '0');
        });
        return map;
    }, []);

    useEffect(() => {
        const update = () => setLocked(!getCurrentCharacter());
        storage.onChanged?.addListener(update);
        window.addEventListener('storage', update);
        return () => {
            storage.onChanged?.removeListener?.(update);
            window.removeEventListener('storage', update);
        };
    }, []);

    useEffect(() => {
        setSelected(ensureGuildList(storeGuilds));
    }, [storeGuilds]);

    useEffect(() => {
        setEnemySelected(ensureGuildList(storeEnemyGuilds));
    }, [storeEnemyGuilds]);

    useEffect(() => {
        setColors(ensureGuildColors(storeGuildColors));
    }, [storeGuildColors]);

    function onChange(guild: string, checked: boolean) {
        setSelected(prev => checked ? [...prev, guild] : prev.filter(g => g !== guild));
    }

    function onEnemyChange(guild: string, checked: boolean) {
        setEnemySelected(prev => checked ? [...prev, guild] : prev.filter(g => g !== guild));
    }

    function onColorChange(guild: string, color?: string) {
        setColors(prev => {
            const next = {...prev};
            if (color) {
                next[guild] = color;
            } else {
                delete next[guild];
            }
            return next;
        });
    }

    function onChangeAll(checked: boolean) {
        setSelected(checked ? [...guilds] : []);
    }

    function onChangeAllEnemy(checked: boolean) {
        setEnemySelected(checked ? [...guilds] : []);
    }

    useEffect(() => {
        registerSave(() => settingsStore.getState().updateSettings({
            guilds: selected,
            enemyGuilds: enemySelected,
            guildColors: colors,
        }));
    }, [registerSave, selected, enemySelected, colors]);

    return (
        <div className="p-2 h-100">
            <fieldset disabled={locked} className="p-0 border-0 m-0">
                <div className="character-settings-layout">
                    <GuildSection
                        selected={selected}
                        enemySelected={enemySelected}
                        colors={colors}
                        defaultColors={defaultColors}
                        onChange={onChange}
                        onEnemyChange={onEnemyChange}
                        onColorChange={onColorChange}
                        onChangeAll={onChangeAll}
                        onChangeAllEnemy={onChangeAllEnemy}
                    />
                </div>
            </fieldset>
        </div>
    );
}

export default GuildsSettings;
