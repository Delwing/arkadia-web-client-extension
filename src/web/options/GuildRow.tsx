import {ChangeEvent, useEffect, useState} from "react";
import {CheckboxField} from "@web/settings/controls.tsx";

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

    function handleColorChange(ev: ChangeEvent<HTMLInputElement>) {
        const newColor = ev.target.value;
        setPickerColor(newColor);
        if (color !== undefined) {
            onColorChange(guild, newColor);
        }
    }

    function handleColorToggle(checked: boolean) {
        onColorChange(guild, checked ? pickerColor : undefined);
    }

    return (
        <div className="guild-row">
            <h6 className="guild-row__name">{guild}</h6>
            <div className="guild-row__options">
                <CheckboxField
                    id={`guild-${guild}`}
                    label="Ładowanie triggerów"
                    checked={selected}
                    onChange={(checked) => onChange(guild, checked)}
                />
                <CheckboxField
                    id={`enemy-guild-${guild}`}
                    label="Wróg"
                    checked={enemySelected}
                    onChange={(checked) => onEnemyChange(guild, checked)}
                    disabled={allySelected}
                />
                <CheckboxField
                    id={`ally-guild-${guild}`}
                    label="Sojusz"
                    checked={allySelected}
                    onChange={(checked) => onAllyChange(guild, checked)}
                    disabled={enemySelected}
                />
                <CheckboxField
                    id={`guild-color-enabled-${guild}`}
                    label="Kolor"
                    checked={color !== undefined}
                    onChange={handleColorToggle}
                    disabled={enemySelected}
                />
                <input
                    type="color"
                    id={`guild-color-${guild}`}
                    className="settings-color"
                    value={pickerColor}
                    onChange={handleColorChange}
                    disabled={enemySelected}
                />
            </div>
        </div>
    );
}
