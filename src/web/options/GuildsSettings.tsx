import { useEffect, useState, useMemo } from "react";
import { characterStorage } from "@modules/core/storage";
import GuildSection from "./GuildSection";
import guilds from "./guilds";
import { Settings } from "./defaultSettings";

function GuildsSettings({ registerSave }: { registerSave: (cb: (sharedSettings: Settings) => void) => void }) {
    const [selected, setSelected] = useState<string[]>([]);
    const [enemySelected, setEnemySelected] = useState<string[]>([]);
    const [allySelected, setAllySelected] = useState<string[]>([]);
    const [colors, setColors] = useState<Record<string, string | undefined>>({});
    const [locked, setLocked] = useState(!characterStorage.getCharacter());
    const defaultColors = useMemo(() => {
        const map: Record<string, string> = {};
        guilds.forEach(g => {
            map[g] = '#' + Math.floor(Math.random() * 0xffffff).toString(16).padStart(6, '0');
        });
        return map;
    }, []);

    useEffect(() => {
        const update = () => setLocked(!characterStorage.getCharacter());
        return characterStorage.onCharacterChange(update);
    }, []);

    useEffect(() => {
        const load = () => {
            const settings = characterStorage.get("settings");
            if (settings) {
                setSelected((settings as any).guilds || []);
                setEnemySelected((settings as any).enemyGuilds || []);
                setAllySelected((settings as any).allyGuilds || []);
                setColors((settings as any).guildColors || {});
            } else {
                setSelected([]);
                setEnemySelected([]);
                setAllySelected([]);
                setColors({});
            }
        };

        load();

        const unsub = characterStorage.onChange('settings', (newValue) => {
            const s = (newValue as any) || {};
            setSelected(s.guilds || []);
            setEnemySelected(s.enemyGuilds || []);
            setAllySelected(s.allyGuilds || []);
            setColors(s.guildColors || {});
        });
        return () => {
            unsub();
        };
    }, []);

    function onChange(guild: string, checked: boolean) {
        setSelected(prev => checked ? [...prev, guild] : prev.filter(g => g !== guild));
    }

    function onEnemyChange(guild: string, checked: boolean) {
        setEnemySelected(prev => checked ? [...prev, guild] : prev.filter(g => g !== guild));
    }

    function onAllyChange(guild: string, checked: boolean) {
        setAllySelected(prev => checked ? [...prev, guild] : prev.filter(g => g !== guild));
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
        registerSave((sharedSettings: Settings) => {
            // Update the shared settings object with our values
            sharedSettings.guilds = selected;
            sharedSettings.enemyGuilds = enemySelected;
            sharedSettings.allyGuilds = allySelected;
            sharedSettings.guildColors = colors;
        });
    }, [registerSave, selected, enemySelected, allySelected, colors]);

    return (
        <div className="p-2 h-100">
            <fieldset disabled={locked} className="p-0 border-0 m-0">
                <div className="character-settings-layout">
                    <GuildSection
                        selected={selected}
                        enemySelected={enemySelected}
                        allySelected={allySelected}
                        colors={colors}
                        defaultColors={defaultColors}
                        onChange={onChange}
                        onEnemyChange={onEnemyChange}
                        onAllyChange={onAllyChange}
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
