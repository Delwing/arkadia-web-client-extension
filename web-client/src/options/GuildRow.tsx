import {ChangeEvent, useEffect, useState} from "react";
import {Form} from "react-bootstrap";

interface Props {
    guild: string;
    selected: boolean;
    enemySelected: boolean;
    /** currently active color, undefined when disabled */
    color?: string;
    /** default color for the guild */
    defaultColor: string;
    onChange: (guild: string, checked: boolean) => void;
    onEnemyChange: (guild: string, checked: boolean) => void;
    /**
     * when color is undefined color should be disabled
     */
    onColorChange: (guild: string, color?: string) => void;
}

export default function GuildRow({guild, selected, enemySelected, color, defaultColor, onChange, onEnemyChange, onColorChange}: Props) {
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
        <div className="mb-2">
            <h6 className="fw-bold mb-1">{guild}</h6>
            <div className="d-flex align-items-center flex-wrap gap-2 ms-2">
                <Form.Check
                    type="checkbox"
                    id={`guild-${guild}`}
                    label="Ładowanie triggerów"
                    checked={selected}
                    onChange={handleSelect}
                    className="me-2"
                />
                <Form.Check
                    type="checkbox"
                    id={`enemy-guild-${guild}`}
                    label="Wróg"
                    checked={enemySelected}
                    onChange={handleEnemySelect}
                    className="me-2"
                />
                <Form.Check
                    type="checkbox"
                    id={`guild-color-enabled-${guild}`}
                    label="Kolor"
                    checked={color !== undefined}
                    onChange={handleColorToggle}
                    className="me-2"
                    disabled={enemySelected}
                />
                <Form.Control
                    type="color"
                    id={`guild-color-${guild}`}
                    value={pickerColor}
                    onChange={handleColorChange}
                    disabled={enemySelected}
                    className="form-control-color"
                    style={{width: '3rem'}}
                />
            </div>
        </div>
    );
}
