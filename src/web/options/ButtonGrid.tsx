import { RefObject, MouseEvent, CSSProperties } from "react";
import { Settings, defaultSettings, defaultBackground, defaultButtonSize, defaultButtonGap, computeBoxShadow } from "../mobileButtonSettings";
import type { MobileButtonSetting } from "../buttonSettings";
import { defaultFontColor } from "../buttonSettings";

export type Mode = 'solo' | 'team' | 'leader';

interface Props {
    mode: Mode;
    view: Mode;
    settings: Settings;
    notEditable: string[];
    emptySetting: MobileButtonSetting;
    openConfig: (setName: Mode, id: string, ev: MouseEvent<HTMLButtonElement>) => void;
    gridRef: RefObject<HTMLDivElement>;
    activeButtonId?: string | null;
}

function buttonsEqual(a: MobileButtonSetting | undefined, b: MobileButtonSetting | undefined): boolean {
    if (a === b) return true;
    if (!a || !b) return false;
    try {
        return JSON.stringify(a) === JSON.stringify(b);
    } catch {
        return false;
    }
}

export default function ButtonGrid({ mode, view, settings, notEditable, emptySetting, openConfig, gridRef, activeButtonId }: Props) {
    const set = settings[mode];
    const bgColor = set.background || defaultBackground;
    const buttonSize = settings.buttonSize ?? defaultButtonSize;
    const buttonGap = settings.buttonGap ?? defaultButtonGap;
    const baseSet = settings.solo;
    const isOverrideMode = mode !== 'solo';
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
            {set.order.map((id, idx) => {
                const cfg = set.buttons[id] || defaultSettings[id] || emptySetting;
                let classes = 'mobile-button';
                const isText = cfg.macroType !== 'kierunek';
                if (cfg.macroType === 'kierunek') {
                    classes += ' direction-button';
                } else {
                    classes += ' mobile-button-text';
                }
                const isEmpty = cfg.macroType === 'empty' || !cfg.label;
                if (isEmpty) classes += ' empty';
                const isActive = activeButtonId === id;
                if (isActive) classes += ' editing';
                let inherited = false;
                if (isOverrideMode) {
                    const baseId = baseSet.order[idx];
                    const baseCfg = baseId !== undefined ? baseSet.buttons[baseId] : undefined;
                    inherited = baseId === id && buttonsEqual(cfg, baseCfg);
                    if (inherited) classes += ' inherited';
                    else classes += ' overridden';
                }
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
                if (isOverrideMode && !inherited) {
                    style.outline = '2px solid #ffc107';
                    style.outlineOffset = '-2px';
                }
                return (
                    <button
                        key={id}
                        data-button-id={id}
                        className={classes}
                        style={style}
                        onClick={handle}
                        title={isOverrideMode ? (inherited ? 'Dziedziczy z trybu Bazowy' : 'Nadpisanie wzgledem trybu Bazowy') : undefined}
                    >
                        {isEmpty ? '' : cfg.label}
                    </button>
                );
            })}
        </div>
    );
}
