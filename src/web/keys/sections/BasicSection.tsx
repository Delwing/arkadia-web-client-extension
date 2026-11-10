import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { slotDef } from "../keysModel";
import { entryById, useKeys } from "../KeysContext";
import { BindRow, SectionHead } from "../parts";

const BASIC_IDS = ["main", "mainGates", "mainTransport", "mainLoot", "attack", "support", "lamp", "moveMode", "roomBind", "drinkable", "gateBind", "doubleK"];

/** The built-in binds; on a phone only the first three until asked. */
export default function BasicSection() {
    const { entries, size, searching } = useKeys();
    const [expanded, setExpanded] = useState(false);
    const all = BASIC_IDS.map(p => entryById(entries, `slot:${p}`));
    const limit = size === "phone" && !expanded && !searching ? 3 : all.length;
    return (
        <section className="keys-section" data-section="basic">
            <SectionHead group="basic" count={size === "phone" ? all.length : undefined} />
            {all.slice(0, limit).map(e => (
                <BindRow key={e.id} entry={e} dimLabel={e.ref.kind === "slot" && !!slotDef(e.ref.path)?.inherits} />
            ))}
            {limit < all.length && (
                <button type="button" className="keys-add" onClick={() => setExpanded(true)}>
                    Pokaż wszystkie {all.length}<ChevronDown size={14} />
                </button>
            )}
        </section>
    );
}
