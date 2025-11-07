import { useEffect, useState, useMemo } from "react";
import storage, { getCurrentCharacter } from "@modules/core/storage";
import GuildSection from "./GuildSection";
import guilds from "./guilds";
import { defaultSettings } from "./defaultSettings";

function GuildsSettings({ registerSave }: { registerSave: (cb: () => void) => void }) {
    const [selected, setSelected] = useState<string[]>([]);
    const [enemySelected, setEnemySelected] = useState<string[]>([]);
    const [colors, setColors] = useState<Record<string, string | undefined>>({});
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
        const load = () => {
            storage.getItem("settings").then(res => {
                if (res && res.settings) {
                    setSelected(res.settings.guilds || []);
                    setEnemySelected(res.settings.enemyGuilds || []);
                    setColors(res.settings.guildColors || {});
                } else {
                    setSelected([]);
                    setEnemySelected([]);
                    setColors({});
                }
            });
        };

        load();

        const listener = (changes: { [key: string]: { oldValue: any; newValue: any } }) => {
            if (changes.settings) {
                const s = changes.settings.newValue || {};
                setSelected(s.guilds || []);
                setEnemySelected(s.enemyGuilds || []);
                setColors(s.guildColors || {});
            }
        };

        storage.onChanged?.addListener(listener);
        return () => {
            storage.onChanged?.removeListener?.(listener);
        };
    }, []);

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
            storage.getItem("settings").then(res => {
                const base = res && res.settings
                    ? { ...defaultSettings, ...res.settings }
                    : { ...defaultSettings };
                const settings = {
                    ...base,
                    guilds: selected,
                    enemyGuilds: enemySelected,
                    guildColors: colors,
                };
                return storage.setItem("settings", settings);
            })
        );
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
