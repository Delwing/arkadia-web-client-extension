import {ChangeEvent, useEffect, useState} from "react";
import {Check} from "@web-ui/primitives/index.ts";

interface Props {
    guild: string;
    selected: boolean;
    enemySelected: boolean;
    allySelected: boolean;
    /** currently active color, undefined when disabled */
    color?: string;
    /** default color for the guild */
    defaultColor: string;
    onChange: (guild: string, checked: boolean) => void;
    onEnemyChange: (guild: string, checked: boolean) => void;
    onAllyChange: (guild: string, checked: boolean) => void;
    /**
     * when color is undefined color should be disabled
     */
    onColorChange: (guild: string, color?: string) => void;
}

export default function GuildRow({guild, selected, enemySelected, allySelected, color, defaultColor, onChange, onEnemyChange, onAllyChange, onColorChange}: Props) {
    const [pickerColor, setPickerColor] = useState(color ?? defaultColor);

    useEffect(() => {
        setPickerColor(color ?? defaultColor);
    }, [color, defaultColor]);
    function handleSelect(ev: ChangeEvent<HTMLInputElement>) {
        onChange(guild, ev.target.checked);
    }

    function handleEnemySelect(ev: ChangeEvent<HTMLInputElement>) {
        onEnemyChange(guild, ev.target.checked);
    }

    function handleAllySelect(ev: ChangeEvent<HTMLInputElement>) {
        onAllyChange(guild, ev.target.checked);
    }

    function handleColorChange(ev: ChangeEvent<HTMLInputElement>) {
        const newColor = ev.target.value;
        setPickerColor(newColor);
        if (color !== undefined) {
            onColorChange(guild, newColor);
        }
    }

    function handleColorToggle(ev: ChangeEvent<HTMLInputElement>) {
        if (ev.target.checked) {
            onColorChange(guild, pickerColor);
        } else {
            onColorChange(guild, undefined);
        }
    }

    return (
        <tr>
            <th scope="row" className="guilds-table__name">{guild}</th>
            <td>
                <Check
                    id={`guild-${guild}`}
                    title="Ładowanie triggerów"
                    checked={selected}
                    onChange={handleSelect}
                />
            </td>
            <td>
                <Check
                    id={`enemy-guild-${guild}`}
                    title="Wróg"
                    checked={enemySelected}
                    onChange={handleEnemySelect}
                    disabled={allySelected}
                />
            </td>
            <td>
                <Check
                    id={`ally-guild-${guild}`}
                    title="Sojusz"
                    checked={allySelected}
                    onChange={handleAllySelect}
                    disabled={enemySelected}
                />
            </td>
            <td>
                <div className="popup-inline">
                    <Check
                        id={`guild-color-enabled-${guild}`}
                        title="Kolor"
                        checked={color !== undefined}
                        onChange={handleColorToggle}
                        disabled={enemySelected}
                    />
                    <input
                        type="color"
                        id={`guild-color-${guild}`}
                        className="popup-color"
                        value={pickerColor}
                        onChange={handleColorChange}
                        disabled={enemySelected}
                    />
                </div>
            </td>
        </tr>
    );
}
