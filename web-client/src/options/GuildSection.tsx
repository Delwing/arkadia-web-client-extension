import guilds from "./guilds";
import GuildRow from "./GuildRow";
import {Form} from "react-bootstrap";

interface Props {
    selected: string[];
    enemySelected: string[];
    /** map of enabled colors */
    colors?: Record<string, string | undefined>;
    /** default colors for display */
    defaultColors: Record<string, string>;
    onChange: (guild: string, checked: boolean) => void;
    onEnemyChange: (guild: string, checked: boolean) => void;
    onColorChange: (guild: string, color?: string) => void;
    onChangeAll: (checked: boolean) => void;
    onChangeAllEnemy: (checked: boolean) => void;
}

export default function GuildSection({selected, enemySelected, colors = {}, defaultColors, onChange, onEnemyChange, onColorChange, onChangeAll, onChangeAllEnemy}: Props) {
    const allSelected = selected.length === guilds.length;
    const allEnemySelected = enemySelected.length === guilds.length;
    return (
        <div className="mb-4 border rounded p-3">
            <div className="d-flex justify-content-between mb-2">
                <h5 className="fw-bold">Gildie</h5>
                <div className="d-flex gap-2">
                    <Form.Check
                        type="checkbox"
                        id="guild-all"
                        label="Wszystkie"
                        checked={allSelected}
                        onChange={ev => onChangeAll(ev.target.checked)}
                    />
                    <Form.Check
                        type="checkbox"
                        id="enemy-guild-all"
                        label="Wrogowie"
                        checked={allEnemySelected}
                        onChange={ev => onChangeAllEnemy(ev.target.checked)}
                    />
                </div>
            </div>
            <div className="d-flex flex-column">
                {guilds.map(g => (
                    <GuildRow
                        key={g}
                        guild={g}
                        selected={selected.includes(g)}
                        enemySelected={enemySelected.includes(g)}
                        color={colors[g]}
                        defaultColor={defaultColors[g]}
                        onChange={onChange}
                        onEnemyChange={onEnemyChange}
                        onColorChange={onColorChange}
                    />
                ))}
            </div>
        </div>
    );
}
