import { useState } from "react";
import xtermArkadia from "@client/xtermArkadia";
import xtermProper from "@client/xtermProper";
import type { UiSettings } from "../uiSettingsCore";
import SubDialog from "../SubDialog";
import "./palettePreview.css";

type Palette = UiSettings["xtermPalette"];

const PALETTE_TITLES: Record<Palette, string> = {
    arkadia: "Arkadia",
    proper: "XTerm",
};

/**
 * Arkadia's palette carries a padding entry at index 0 ("fake color, to shift
 * index by one"), because the game numbers its colours one higher than xterm
 * does. So the code a colour answers to is its index in the palette's own
 * array, and Arkadia's real colours start at 1 while XTerm's start at 0.
 */
function swatches(palette: Palette): { code: number; hex: string }[] {
    const colors = palette === "proper" ? xtermProper : xtermArkadia;
    const first = palette === "proper" ? 0 : 1;
    const list: { code: number; hex: string }[] = [];
    for (let code = first; code < colors.length; code++) {
        list.push({ code, hex: colors[code] });
    }
    return list;
}

/**
 * The 256 colours of a palette, with the code each one answers to, so picking
 * between Arkadia and XTerm is not done blind. Both are shown side by side:
 * the same code is a different colour in each, which is the whole point of the
 * setting.
 */
function PalettePreviewDialog({ palette, onClose }: { palette: Palette; onClose: () => void }) {
    const [shown, setShown] = useState<Palette>(palette);
    const list = swatches(shown);

    return (
        <SubDialog title="Paleta kolorów" size="lg" onClose={onClose}>
            <div className="dialog-tabs palette-preview__tabs">
                {(Object.keys(PALETTE_TITLES) as Palette[]).map(key => (
                    <button
                        key={key}
                        type="button"
                        id={`ui-palette-preview-${key}`}
                        className={`dialog-tab${shown === key ? " is-active" : ""}`}
                        onClick={() => setShown(key)}
                    >
                        {PALETTE_TITLES[key]}
                        {key === palette && <span className="dialog-tab__count">wybrana</span>}
                    </button>
                ))}
            </div>
            <p className="popup-field__hint">
                Numer pod próbką to kod koloru w tej palecie — ten sam kod daje inny kolor w każdej z nich.
            </p>
            <div className="palette-preview" id="ui-palette-preview-grid">
                {list.map(({ code, hex }) => (
                    <span key={code} className="palette-preview__cell" data-code={code} title={`${code} · ${hex}`}>
                        <span className="palette-preview__swatch" style={{ backgroundColor: hex }} />
                        <span className="palette-preview__code">{code}</span>
                    </span>
                ))}
            </div>
        </SubDialog>
    );
}

export default PalettePreviewDialog;
