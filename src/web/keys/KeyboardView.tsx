import type { CSSProperties, Ref } from "react";
import { Globe, Plug } from "lucide-react";
import { KEYBOARD, KEYBOARD_HEIGHT, KEYBOARD_WIDTH, type KeyCap } from "./keyboardLayout";
import {
    capLabel,
    classifyKey,
    comboId,
    comboInLayer,
    comboLabel,
    GROUPS,
    isBrowserReserved,
    keyInLayer,
    matchesSearch,
    sameCombo,
    type Combo,
    type KeyEntry,
    type Layer,
} from "./keysModel";
import { bindsWord, useKeys } from "./KeysContext";

interface Props {
    /** The colour map: small keys, no labels. */
    mini: boolean;
    layer: Layer;
    kbWidth: number;
    boardRef: Ref<HTMLDivElement>;
    /** The selected key's combo id. */
    selected: string | null;
    capturing: boolean;
    /** The key whose binding is being re-bound: it blinks along with its keycap in the list. */
    capturingCombo: Combo | null;
    onKey: (combo: Combo, bound: KeyEntry[]) => void;
}

/** The keyboard drawn to scale, each key coloured by what it does in `layer`. */
export function KeyboardView({ mini, layer, kbWidth, boardRef, selected, capturing, capturingCombo, onKey }: Props) {
    const { byCombo, helperConnected, search, searching } = useKeys();
    const u = kbWidth / KEYBOARD_WIDTH;

    const keyCell = (cap: KeyCap) => {
        const combo = comboInLayer(cap.code, layer);
        const id = comboId(combo);
        // NumLock off has only the numpad keys it changes: the rest sit greyed out.
        const inert = cap.inert || !keyInLayer(cap.code, layer);
        const list = inert ? [] : byCombo.get(id) ?? [];
        const reserved = !inert && isBrowserReserved(combo);
        const state = classifyKey(list, helperConnected);
        const conflict = state.conflict;
        const group = (state.active.length ? state.active : list)[0]?.group;
        const dimmed = searching && !list.some(e => matchesSearch(e, search));
        const helperIcon = list.some(e => e.reach === "helper");
        const globalIcon = list.some(e => e.reach === "global" || e.reach === "global_focus");
        const cls = [
            "keys-key",
            // A Mac arrow key is half a row tall: cap and function go side by side.
            (cap.h ?? 1) < 1 && "is-half",
            inert && "is-inert",
            list.length && "is-bound",
            conflict && "is-conflict",
            reserved && "is-reserved",
            selected === id && "is-selected",
            dimmed && "is-dimmed",
            sameCombo(capturingCombo, combo) && "is-capturing-target",
        ].filter(Boolean).join(" ");
        const style: CSSProperties = {
            left: cap.x * u,
            top: cap.y * u,
            width: (cap.w ?? 1) * u - (mini ? 2 : 4),
            height: (cap.h ?? 1) * u - (mini ? 2 : 4),
        };
        // A key the helper takes over still names its one function, not "2 bindy".
        const label = conflict ? bindsWord(state.active.length) : (state.active[0] ?? list[0])?.short;
        return (
            <button
                key={cap.code}
                type="button"
                className={cls}
                style={style}
                data-code={cap.code}
                data-group={group}
                disabled={inert}
                title={inert ? undefined : `${comboLabel(combo)}${list.length ? `: ${list.map(e => e.label).join(", ")}` : ""}`}
                onClick={() => { if (!inert) onKey(combo, list); }}
            >
                {!mini && <span className="keys-key__cap">{capLabel(cap.code, layer)}</span>}
                {!mini && label && <span className="keys-key__fn">{label}</span>}
                {!mini && (helperIcon || globalIcon) && (
                    <span className="keys-key__badge">{globalIcon ? <Globe size={10} /> : <Plug size={10} />}</span>
                )}
            </button>
        );
    };

    return (
        <div className={`keys-board${mini ? " keys-board--mini" : ""}${capturing ? " is-capturing" : ""}`} ref={boardRef}>
            {/* The height comes from the aspect ratio in CSS, not from the measured
                width: the board must hold its place on the very first paint, or the
                window jumps the moment the keys arrive. */}
            <div className="keys-board__inner" style={{ aspectRatio: `${KEYBOARD_WIDTH} / ${KEYBOARD_HEIGHT}` }}>
                {kbWidth > 0 && KEYBOARD.map(keyCell)}
            </div>
        </div>
    );
}

/** The groups' colours; `withReserved` adds the hatching and the helper icons. */
export function Legend({ withReserved }: { withReserved: boolean }) {
    return (
        <div className="keys-legend">
            {GROUPS.map(g => (
                <span key={g.id} className="keys-legend__item"><span className="keys-dot" data-group={g.id} />{g.label}</span>
            ))}
            {withReserved && (
                <>
                    <span className="keys-legend__item"><span className="keys-legend__hatch" />Zajęte przez przeglądarkę</span>
                    <span className="keys-legend__item"><Plug size={12} className="keys-helper-icon" />Przez helpera</span>
                    <span className="keys-legend__item"><Globe size={12} className="keys-global-icon" />Działa wszędzie</span>
                </>
            )}
        </div>
    );
}
