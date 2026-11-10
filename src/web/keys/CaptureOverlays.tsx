import { Plug } from "lucide-react";
import { Button } from "@web-ui/primitives/index.ts";
import { comboLabel, layerLabel, layerOf } from "./keysModel";
import type { Capture, LiveMods } from "./useKeyCapture";

const labelOf = (capture: Capture) => capture.target.kind === "entry" ? capture.target.entry.label : capture.target.label;

/** On a phone or a narrow window: a sheet that waits for the key, showing the modifiers held. */
export function CaptureSheet({ capture, liveMods, onClear, onCancel }: { capture: Capture; liveMods: LiveMods; onClear: () => void; onCancel: () => void }) {
    const previous = capture.target.kind === "entry" ? capture.target.entry.combo : null;
    const mods = layerOf(liveMods);
    return (
        <div className="keys-sheet keys-sheet--capture">
            <div className="keys-sheet__grip" />
            <span className="keys-cap">Nowy klawisz dla</span>
            <strong className="keys-sheet__title">{labelOf(capture)}</strong>
            <div className="keys-sheet__keys">
                {mods && <><span className="keys-kc keys-kc--big">{layerLabel(mods)}</span><span className="keys-muted">+</span></>}
                <span className="keys-kc keys-kc--big is-capturing">?</span>
            </div>
            <span className="keys-dim">{capture.via === "helper" ? "Naciśnij klawisz, słucha helper" : "Naciśnij klawisz na klawiaturze"}</span>
            <span className="keys-muted">Działa z klawiaturą Bluetooth lub USB</span>
            {previous && <div className="keys-sheet__prev"><span className="keys-muted">Poprzednio</span><span className="keys-kc">{comboLabel(previous)}</span></div>}
            <div className="keys-sheet__actions">
                {capture.target.kind === "entry" && <Button onClick={onClear}>Wyczyść</Button>}
                <Button onClick={onCancel}>Anuluj</Button>
            </div>
        </div>
    );
}

/**
 * On a wider window: a bar while the helper listens, or while the page waits
 * for a key that is not yet a binding's (a binding's own keycap blinks instead).
 */
export function CaptureBar({ capture, onCancel }: { capture: Capture; onCancel: () => void }) {
    if (capture.via === "helper") {
        return (
            <div className="keys-capturebar">
                <span className="keys-kc is-capturing">naciśnij…</span>
                <span className="keys-dim">Naciśnij dowolną kombinację dla „{labelOf(capture)}”</span>
                <span className="keys-muted"><Plug size={12} className="keys-helper-icon" /> słucha helper, przeglądarka nic nie dostanie</span>
                <span className="keys-spacer" />
                <Button size="sm" onClick={onCancel}>Anuluj</Button>
            </div>
        );
    }
    if (capture.target.kind === "entry") return null;
    return (
        <div className="keys-capturebar">
            <span className="keys-kc is-capturing">naciśnij…</span>
            <span className="keys-dim">Naciśnij klawisz dla „{capture.target.label}” albo wybierz go na rysunku</span>
            <span className="keys-spacer" />
            <Button size="sm" onClick={onCancel}>Anuluj</Button>
        </div>
    );
}
