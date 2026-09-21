import guilds from "./guilds";
import GuildRow from "./GuildRow";
import {Check} from "@web-ui/primitives/index.ts";

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

export default function GuildSection({selected, enemySelected, allySelected, colors = {}, defaultColors, onChange, onEnemyChange, onAllyChange, onColorChange, onChangeAll, onChangeAllEnemy}: Props) {
    const allSelected = selected.length === guilds.length;
    const allEnemySelected = enemySelected.length === guilds.length;
    return (
        <section className="character-settings-section character-settings-section--full">
            <h5 className="character-settings-section-title">Gildie</h5>
            <table className="popup-table guilds-table">
                <thead>
                <tr>
                    <th>Gildia</th>
                    <th>
                        <Check
                            id="guild-all"
                            label="Triggery"
                            title="Ładowanie triggerów — zaznacz wszystkie"
                            checked={allSelected}
                            onChange={ev => onChangeAll(ev.target.checked)}
                        />
                    </th>
                    <th>
                        <Check
                            id="enemy-guild-all"
                            label="Wróg"
                            title="Wszystkie gildie jako wrogowie"
                            checked={allEnemySelected}
                            onChange={ev => onChangeAllEnemy(ev.target.checked)}
                        />
                    </th>
                    <th>Sojusz</th>
                    <th>Kolor</th>
                </tr>
                </thead>
                <tbody>
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
                </tbody>
            </table>
        </section>
    );
}
