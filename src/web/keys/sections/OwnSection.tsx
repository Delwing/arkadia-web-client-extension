import { Globe, Pencil, Plus } from "lucide-react";
import { Button, DeleteButton, Input } from "@web-ui/primitives/index.ts";
import { commandOf, editCommand, removeEntry } from "../keyEdits";
import { rowClass, useKeys } from "../KeysContext";
import { KeyChip, ReachBadge, SectionHead } from "../parts";

/**
 * Own shortcuts, whether the page hears them or the helper does: a shortcut
 * on a key the browser keeps is still an own shortcut, just heard elsewhere.
 */
export default function OwnSection() {
    const { data, entries, search, helperSupported, applyEdit, selectEntry, addOwnCommand, newRowRef } = useKeys();
    const own = entries.filter(e => e.group === "own");
    return (
        <section className="keys-section" data-section="own">
            <SectionHead group="own" count={own.length} />
            {own.length === 0 && <p className="keys-muted keys-empty">Brak własnych skrótów.</p>}
            {own.map(e => (
                <div key={e.id} className={rowClass(e, search, " keys-row--own")} data-bind={e.id} onClick={() => selectEntry(e)}>
                    <KeyChip entry={e} />
                    <Input
                        mono
                        className="keys-command"
                        placeholder="Komenda"
                        value={commandOf(data, e)}
                        onClick={ev => ev.stopPropagation()}
                        onChange={ev => applyEdit(editCommand(data, e, ev.target.value), true)}
                        ref={el => {
                            // The row just added takes the caret.
                            if (el && newRowRef.current === e.id) {
                                newRowRef.current = null;
                                el.focus();
                                el.scrollIntoView({ block: "nearest" });
                            }
                        }}
                    />
                    <ReachBadge entry={e} />
                    {/* The command field covers most of the row and keeps its own
                        clicks, so this is the dependable way to open the panel. */}
                    <Button
                        size="sm"
                        variant="ghost"
                        className="popup-btn--icon"
                        title="Pokaż klawisz i gdzie działa"
                        disabled={!e.combo}
                        onClick={ev => { ev.stopPropagation(); selectEntry(e); }}
                    >
                        <Pencil size={15} strokeWidth={1.75} />
                    </Button>
                    <DeleteButton onClick={ev => { ev.stopPropagation(); applyEdit(removeEntry(data, e)); }} />
                </div>
            ))}
            <div className="keys-adds">
                <button type="button" className="keys-add" onClick={() => addOwnCommand("client")}>
                    <Plus size={14} strokeWidth={2.2} />Komenda
                </button>
                {helperSupported && (
                    <button
                        type="button"
                        className="keys-add"
                        title="Skrót, którego słucha helper — działa też poza klientem"
                        onClick={() => addOwnCommand("global")}
                    >
                        <Plus size={14} strokeWidth={2.2} />Komenda przez helpera<Globe size={12} className="keys-global-icon" />
                    </button>
                )}
            </div>
        </section>
    );
}
