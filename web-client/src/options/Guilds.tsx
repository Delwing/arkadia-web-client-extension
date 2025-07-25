import { useEffect, useState, useMemo } from "react";
import { Button } from "react-bootstrap";
import storage, { getCurrentCharacter } from "@client/src/storage";
import GuildSection from "./GuildSection";
import guilds from "./guilds";
import { defaultSettings } from "./defaultSettings";

function Guilds() {
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

    function save() {
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
            storage.setItem("settings", settings).then(() => {
                window.dispatchEvent(new Event('close-options'));
            });
        });
    }

    return (
        <div className="m-2">
            {locked && (
                <div className="alert alert-info" role="alert">
                    Opcje zależne od postaci są zablokowane do momentu jej wybrania.
                </div>
            )}
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
                <Button onClick={save}>Zapisz</Button>
            </fieldset>
        </div>
    );
}

export default Guilds;
