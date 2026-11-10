import { Fragment, useMemo, useSyncExternalStore } from "react";
import { effectiveWalkModifiers, getWalkModes, subscribeWalkModes, walkModifiersOf } from "@modules/core/walkModeRegistry";
import { layerLabel, matchesSearch, takenWalkModifiers, walkModeClashes } from "../keysModel";
import { toggleWalkModifier, WALK_MODIFIERS } from "../keyEdits";
import { entryById, useKeys } from "../KeysContext";
import { KeyChip, SectionHead } from "../parts";

const COMPASS = ["nw", "n", "ne", "w", "zerknij", "e", "sw", "s", "se"] as const;
const EXTRA = ["u", "d", "special", "special2", "special3"] as const;

function DirectionGrid({ dirs, className }: { dirs: readonly string[]; className: string }) {
    const { entries, search } = useKeys();
    return (
        <div className={className}>
            {dirs.map(d => {
                const e = entryById(entries, `slot:directions.${d}`);
                return (
                    <div key={d} className={`keys-compass__cell${matchesSearch(e, search) ? "" : " is-hidden"}`} data-bind={e.id}>
                        <span className="keys-muted">{e.label}</span>
                        <KeyChip entry={e} compact />
                    </div>
                );
            })}
        </div>
    );
}

/** Walk modes: a modifier held with any direction key walks the step that way. */
function WalkModes() {
    const { data, byCombo, applyEdit } = useKeys();
    const { binds } = data;
    const walkModes = useSyncExternalStore(subscribeWalkModes, getWalkModes);
    // A modifier the direction keys already hold is no use to a walk mode: shown off, and locked.
    const walkTaken = useMemo(() => takenWalkModifiers(binds), [binds]);
    const rows = useMemo(() => {
        const withMods = walkModes.map(m => {
            const stored = walkModifiersOf(binds, m);
            return { id: m.id, label: m.label, pluginName: m.pluginName, stored, mods: effectiveWalkModifiers(stored, walkTaken) };
        });
        return withMods.map(w => ({ ...w, clashes: walkModeClashes(w, withMods, binds, byCombo) }));
    }, [walkModes, binds, byCombo, walkTaken]);

    return (
        <div className="keys-walk" data-section="walk">
            <div className="keys-walk__head">
                <span className="keys-cap">Tryby chodzenia</span>
                <span className="keys-muted">modyfikator + kierunek</span>
            </div>
            {rows.map(w => (
                <Fragment key={w.id}>
                    <div className="keys-row" data-walk={w.id}>
                        <span className="keys-row__label">
                            {w.label}
                            {w.pluginName && <span className="keys-muted">{w.pluginName}</span>}
                        </span>
                        {WALK_MODIFIERS.map(m => (
                            <button
                                key={m}
                                type="button"
                                className={["keys-kc", "keys-walk__mod", w.mods[m] ? "is-on" : "is-none", w.mods[m] && w.clashes.length > 0 && "is-conflict"].filter(Boolean).join(" ")}
                                data-mod={m}
                                disabled={walkTaken[m]}
                                title={walkTaken[m]
                                    ? `Kierunki już używają ${layerLabel(m)}`
                                    : `${w.label}: ${w.mods[m] ? "bez" : "z"} ${layerLabel(m)}`}
                                onClick={() => applyEdit(toggleWalkModifier(data, w.id, w.stored, w.mods, m))}
                            >
                                {layerLabel(m)}
                            </button>
                        ))}
                    </div>
                    {w.clashes.length > 0 && (
                        <div className="keys-walk__clash" data-walk-clash={w.id}>
                            Koliduje z: {w.clashes.join(", ")}
                        </div>
                    )}
                </Fragment>
            ))}
        </div>
    );
}

/** The direction keys as a compass, the rest of them, and the walk modes. */
export default function DirSection() {
    const { searching } = useKeys();
    return (
        <section className="keys-section" data-section="dir">
            <SectionHead group="dir" />
            <DirectionGrid dirs={COMPASS} className="keys-compass" />
            <DirectionGrid dirs={EXTRA} className="keys-compass keys-compass--extra" />
            {!searching && <WalkModes />}
        </section>
    );
}
