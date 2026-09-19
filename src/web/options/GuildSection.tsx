import guilds from "./guilds";
import GuildRow from "./GuildRow";
import {CheckboxField, SettingsCard} from "@web/settings/controls.tsx";

interface Props {
    selected: string[];
    enemySelected: string[];
    allySelected: string[];
    /** map of enabled colors */
    colors?: Record<string, string | undefined>;
    /** default colors for display */
    defaultColors: Record<string, string>;
    onChange: (guild: string, checked: boolean) => void;
    onEnemyChange: (guild: string, checked: boolean) => void;
    onAllyChange: (guild: string, checked: boolean) => void;
    onColorChange: (guild: string, color?: string) => void;
    onChangeAll: (checked: boolean) => void;
    onChangeAllEnemy: (checked: boolean) => void;
}

/** Postac > Gildie. Migrated onto the design system (UI_MIGRATION.md §4). */
export default function GuildSection({selected, enemySelected, allySelected, colors = {}, defaultColors, onChange, onEnemyChange, onAllyChange, onColorChange, onChangeAll, onChangeAllEnemy}: Props) {
    const allSelected = selected.length === guilds.length;
    const allEnemySelected = enemySelected.length === guilds.length;
    return (
        <SettingsCard
            title="Gildie"
            full
            headerExtra={
                <div className="settings-row__controls">
                    <CheckboxField
                        id="guild-all"
                        label="Wszystkie"
                        checked={allSelected}
                        onChange={onChangeAll}
                    />
                    <CheckboxField
                        id="enemy-guild-all"
                        label="Wrogowie"
                        checked={allEnemySelected}
                        onChange={onChangeAllEnemy}
                    />
                </div>
            }
        >
            <div className="guild-list">
                {guilds.map(g => (
                    <GuildRow
                        key={g}
                        guild={g}
                        selected={selected.includes(g)}
                        enemySelected={enemySelected.includes(g)}
                        allySelected={allySelected.includes(g)}
                        color={colors[g]}
                        defaultColor={defaultColors[g]}
                        onChange={onChange}
                        onEnemyChange={onEnemyChange}
                        onAllyChange={onAllyChange}
                        onColorChange={onColorChange}
                    />
                ))}
            </div>
        </SettingsCard>
    );
}
