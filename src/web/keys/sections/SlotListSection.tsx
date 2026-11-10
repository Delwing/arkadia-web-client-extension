import { Plus } from "lucide-react";
import { DeleteButton } from "@web-ui/primitives/index.ts";
import { maxListSlots, type SlotList } from "../keysModel";
import { addListSlot, removeLastListSlot } from "../keyEdits";
import { entryById, useKeys } from "../KeysContext";
import { BindRow, SectionHead } from "../parts";

interface Props {
    list: SlotList;
    group: "temp" | "multi";
    addLabel: string;
    removeTitle: string;
    empty: string;
}

/**
 * A list of slots the player grows: temporary binds (/tbindN) and
 * multibinds (the room's n-th multibind). A slot without a key still works
 * (/tbindN keeps its command, a multibind runs from the bar). Only the last
 * slot can go, so the other slots keep their numbers.
 */
function SlotListSection({ list, group, addLabel, removeTitle, empty }: Props) {
    const { data, entries, applyEdit } = useKeys();
    const keys = data.binds[list] ?? [];
    const max = maxListSlots(list);
    return (
        <section className="keys-section" data-section={group}>
            <SectionHead group={group} count={keys.length} />
            {keys.length === 0 && <p className="keys-muted keys-empty">{empty}</p>}
            {keys.slice(0, max).map((_, i) => {
                const e = entryById(entries, `slot:${list}[${i}]`);
                return (
                    <BindRow key={e.id} entry={e}>
                        {i === keys.length - 1 && (
                            <DeleteButton
                                className="keys-row__delete"
                                title={removeTitle}
                                onClick={ev => { ev.stopPropagation(); applyEdit(removeLastListSlot(data, list, entries)); }}
                            />
                        )}
                    </BindRow>
                );
            })}
            {keys.length < max && (
                <div className="keys-adds">
                    <button type="button" className="keys-add" onClick={() => applyEdit(addListSlot(data, list))}>
                        <Plus size={14} strokeWidth={2.2} />{addLabel}
                    </button>
                </div>
            )}
        </section>
    );
}

export function TempSection() {
    return <SlotListSection list="temp" group="temp" addLabel="Tymczasowy" removeTitle="Usuń ostatni tymczasowy" empty="Brak tymczasowych bindów." />;
}

export function MultiSection() {
    return <SlotListSection list="multibinds" group="multi" addLabel="Multibind" removeTitle="Usuń ostatni multibind" empty="Brak multibindów." />;
}
