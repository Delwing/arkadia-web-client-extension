import { useEffect, useState, useMemo } from "react";
import storage, { getCurrentCharacter } from "@client/src/storage";
import GuildSection from "./GuildSection";
import guilds from "./guilds";
import { useUiDispatch, useUiStore } from "../ui/store";

function GuildsSettings({ registerSave }: { registerSave: (cb: () => void) => void }) {
    const [selected, setSelected] = useState<string[]>([]);
    const [enemySelected, setEnemySelected] = useState<string[]>([]);
    const [colors, setColors] = useState<Record<string, string | undefined>>({});
    const [locked, setLocked] = useState(!getCurrentCharacter());
    const dispatch = useUiDispatch();
    const settingsGuilds = useUiStore(state => state.settings.guilds as string[] | undefined);
    const settingsEnemyGuilds = useUiStore(state => state.settings.enemyGuilds as string[] | undefined);
    const settingsGuildColors = useUiStore(state => state.settings.guildColors as Record<string, string | undefined> | undefined);
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
        setSelected(Array.isArray(settingsGuilds) ? [...settingsGuilds] : []);
    }, [settingsGuilds]);

    useEffect(() => {
        setEnemySelected(Array.isArray(settingsEnemyGuilds) ? [...settingsEnemyGuilds] : []);
    }, [settingsEnemyGuilds]);

    useEffect(() => {
        setColors(settingsGuildColors ? { ...settingsGuildColors } : {});
    }, [settingsGuildColors]);

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
        registerSave(() =>
            dispatch({
                type: "settings/update",
                patch: {
                    guilds: [...selected],
                    enemyGuilds: [...enemySelected],
                    guildColors: { ...colors },
                },
            })
        );
    }, [registerSave, selected, enemySelected, colors, dispatch]);

    return (
        <div className="p-2">
            <fieldset disabled={locked} className="p-0 border-0 m-0">
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
            </fieldset>
        </div>
    );
}

export default GuildsSettings;
