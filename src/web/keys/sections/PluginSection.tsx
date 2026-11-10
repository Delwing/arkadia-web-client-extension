import { useSyncExternalStore } from "react";
import { Button } from "@web-ui/primitives/index.ts";
import { getPluginKeyActions, subscribePluginKeyActions } from "@modules/core/pluginKeyRegistry";
import { comboLabel, comboOf, type KeyEntry } from "../keysModel";
import { resetPluginKey } from "../keyEdits";
import { rowClass, useKeys } from "../KeysContext";
import { KeyChip, SectionHead } from "../parts";

/** Plugin key actions: the plugin suggests a key, the player can move it or switch it off. */
export default function PluginSection() {
    const { data, entries, search, applyEdit, selectEntry } = useKeys();
    const pluginActions = useSyncExternalStore(subscribePluginKeyActions, getPluginKeyActions);
    const plugin = entries.filter(e => e.ref.kind === "plugin");
    if (plugin.length === 0) return null;

    const pluginDefault = (e: KeyEntry) => {
        const id = e.ref.kind === "plugin" ? e.ref.id : undefined;
        const combo = comboOf(pluginActions.find(a => a.id === id)?.defaultBind);
        return combo ? comboLabel(combo) : "brak";
    };

    return (
        <section className="keys-section" data-section="plugin">
            <SectionHead group="plugin" count={plugin.length} />
            {plugin.map(e => (
                <div
                    key={e.id}
                    className={rowClass(e, search)}
                    data-bind={e.id}
                    title={e.combo ? `Pokaż klawisz ${comboLabel(e.combo)}` : undefined}
                    onClick={() => selectEntry(e)}
                >
                    <span className="keys-row__label">
                        {e.label}
                        {e.owner && <span className="keys-muted">{e.owner}</span>}
                    </span>
                    {e.overridden && (
                        <Button
                            size="sm"
                            variant="ghost"
                            title={`Przywróć klawisz pluginu: ${pluginDefault(e)}`}
                            onClick={ev => { ev.stopPropagation(); applyEdit(resetPluginKey(data, e)); }}
                        >
                            domyślny
                        </Button>
                    )}
                    <KeyChip entry={e} />
                </div>
            ))}
        </section>
    );
}
