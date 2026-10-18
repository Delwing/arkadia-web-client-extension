import type { CSSProperties } from "react";
import { computeBoxShadow, type LayoutSettings } from "../mobileButtonSettings";
import { defaultFontColor } from "../buttonSettings";

export interface CellState {
    /** Shown dimmed: the mode takes it from its parent. */
    inherited: boolean;
    /** Marked: stored in this mode (an override or a slot of its own). */
    own: boolean;
    selected: boolean;
    swapSource: boolean;
}

interface Props {
    id: string;
    layout: LayoutSettings;
    buttonSize: number;
    buttonGap: number;
    cellState: (id: string, index: number) => CellState;
    onCellClick: (id: string, index: number) => void;
}

/** The editor's preview of one mode, at the real button size. */
export default function ButtonGrid({ id, layout, buttonSize, buttonGap, cellState, onCellClick }: Props) {
    return (
        <div
            id={id}
            className="mobile-direction-buttons preview"
            style={{
                gridTemplateColumns: `repeat(${layout.cols}, auto)`,
                backgroundColor: layout.background,
                boxShadow: computeBoxShadow(layout.background),
                gap: buttonGap + 'px',
            }}
        >
            {layout.order.map((buttonId, index) => {
                const cfg = layout.buttons[buttonId];
                const isText = cfg.macroType !== 'kierunek';
                const isEmpty = cfg.macroType === 'empty' || !cfg.label;
                const state = cellState(buttonId, index);
                const classes = [
                    'mobile-button',
                    isText ? 'mobile-button-text' : 'direction-button',
                    isEmpty && 'empty',
                    state.selected && 'editing',
                    state.inherited && 'inherited',
                    state.own && 'own',
                    state.swapSource && 'swap-source',
                ].filter(Boolean).join(' ');
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
                        key={`${buttonId}-${index}`}
                        type="button"
                        data-button-id={buttonId}
                        className={classes}
                        style={style}
                        title={isEmpty ? 'Puste pole' : undefined}
                        onClick={() => onCellClick(buttonId, index)}
                    >
                        {isEmpty ? '' : cfg.label}
                    </button>
                );
            })}
        </div>
    );
}
