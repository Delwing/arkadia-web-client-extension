import { matchesSearch } from "../keysModel";
import { entryById, useKeys } from "../KeysContext";
import { KeyChip, ReachBadge, SectionHead } from "../parts";

/** Three enemies, each with an attack key and a block key on one row. */
export default function EnemySection() {
    const { entries, search, selectEntry } = useKeys();
    return (
        <section className="keys-section" data-section="enemy">
            <SectionHead group="enemy" extra={<span className="keys-muted">atakuj · blokuj</span>} />
            {[0, 1, 2].map(i => {
                const attack = entryById(entries, `slot:enemy[${i}]`);
                const block = entryById(entries, `slot:enemyBlock[${i}]`);
                const shown = matchesSearch(attack, search) || matchesSearch(block, search);
                return (
                    <div
                        key={i}
                        className={`keys-row is-pickable${shown ? "" : " is-hidden"}`}
                        data-bind={attack.id}
                        onClick={() => selectEntry(attack)}
                    >
                        <span className="keys-row__label">
                            Wróg {i + 1}
                            <ReachBadge entry={attack} />
                        </span>
                        <KeyChip entry={attack} />
                        <KeyChip entry={block} />
                    </div>
                );
            })}
        </section>
    );
}
