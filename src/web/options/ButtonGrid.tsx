import { RefObject, MouseEvent, CSSProperties } from "react";
import { ButtonSetting, Settings, defaultSettings, defaultBackground, defaultButtonSize, defaultButtonGap, defaultFontColor, computeBoxShadow } from "../mobileButtonSettings";

export type Mode = 'solo' | 'team' | 'leader';

interface Props {
    mode: Mode;
    view: Mode;
    settings: Settings;
    notEditable: string[];
    emptySetting: ButtonSetting;
    openConfig: (setName: Mode, id: string, ev: MouseEvent<HTMLButtonElement>) => void;
    gridRef: RefObject<HTMLDivElement>;
    activeButtonId?: string | null;
}

export default function ButtonGrid({ mode, view, settings, notEditable, emptySetting, openConfig, gridRef, activeButtonId }: Props) {
    const set = settings[mode];
    const bgColor = set.background || defaultBackground;
    const buttonSize = settings.buttonSize ?? defaultButtonSize;
    const buttonGap = settings.buttonGap ?? defaultButtonGap;
    return (
        <div
            ref={gridRef}
            id={`mobile-buttons-preview-${mode}`}
            className={`mobile-direction-buttons preview mb-2 ${view === mode ? '' : 'd-none'}`}
            style={{
                gridTemplateColumns: `repeat(${set.cols}, auto)`,
                backgroundColor: bgColor,
                boxShadow: computeBoxShadow(bgColor),
                gap: buttonGap + 'px',
            }}
        >
            {set.order.map(id => {
                const cfg = set.buttons[id] || defaultSettings[id] || emptySetting;
                let classes = 'mobile-button';
                const isText = cfg.macro !== 'kierunek';
                if (cfg.macro === 'kierunek') {
                    classes += ' direction-button';
                } else {
                    classes += ' mobile-button-text';
                }
                const isEmpty = cfg.macro === 'empty' || !cfg.label;
                if (isEmpty) classes += ' empty';
                const isActive = activeButtonId === id;
                if (isActive) classes += ' editing';
                const handle = notEditable.includes(id)
                    ? undefined
                    : (ev: React.MouseEvent<HTMLButtonElement>) => openConfig(mode, id, ev);
                // Font size scales with button size: direction ~35%, text ~20% to ensure fit
                const fontSize = isText ? Math.max(6, Math.round(buttonSize * 0.20)) : Math.round(buttonSize * 0.35);
                const style: CSSProperties = {
                    width: buttonSize + 'px',
                    height: buttonSize + 'px',
                    fontSize: fontSize + 'px',
                };
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
