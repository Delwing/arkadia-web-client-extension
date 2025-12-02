import { RefObject, MouseEvent, CSSProperties } from "react";
import { ButtonSetting, Settings, defaultSettings, defaultBackground, defaultFontColor, computeBoxShadow } from "../mobileButtonSettings";

export type Mode = 'solo' | 'team' | 'leader';

interface Props {
    mode: Mode;
    view: Mode;
    settings: Settings;
    notEditable: string[];
    emptySetting: ButtonSetting;
    openConfig: (setName: Mode, id: string, ev: MouseEvent<HTMLButtonElement>) => void;
    gridRef: RefObject<HTMLDivElement>;
}

export default function ButtonGrid({ mode, view, settings, notEditable, emptySetting, openConfig, gridRef }: Props) {
    const set = settings[mode];
    const bgColor = set.background || defaultBackground;
    return (
        <div
            ref={gridRef}
            id={`mobile-buttons-preview-${mode}`}
            className={`mobile-direction-buttons preview mb-2 ${view === mode ? '' : 'd-none'}`}
            style={{
                gridTemplateColumns: `repeat(${set.cols}, auto)`,
                backgroundColor: bgColor,
                boxShadow: computeBoxShadow(bgColor),
            }}
        >
            {set.order.map(id => {
                const cfg = set.buttons[id] || defaultSettings[id] || emptySetting;
                let classes = 'mobile-button';
                if (cfg.macro === 'kierunek') {
                    classes += ' direction-button';
                } else {
                    classes += ' mobile-button-text';
                }
                const isEmpty = cfg.macro === 'empty' || !cfg.label;
                if (isEmpty) classes += ' empty';
                const handle = notEditable.includes(id)
                    ? undefined
                    : (ev: React.MouseEvent<HTMLButtonElement>) => openConfig(mode, id, ev);
                const style: CSSProperties = {};
                if (isEmpty) {
                    style.backgroundColor = 'transparent';
                } else {
                    style.backgroundColor = cfg.color;
                    style.color = cfg.fontColor || defaultFontColor;
                }
                return (
                    <button
                        key={id}
                        data-button-id={id}
                        className={classes}
                        style={style}
                        onClick={handle}
                    >
                        {isEmpty ? '' : cfg.label}
                    </button>
                );
            })}
        </div>
    );
}
