import { useState } from "react";
import { GripVertical, Plus } from "lucide-react";
import type { CustomSound } from "@modules/core/customSounds";
import type { PluginTriggerMacro } from "@modules/core/pluginTriggerMacroRegistry";
import type { UserMacro } from "@client/scripts/userTriggers";
import { MacroEditor, type MacroPlaceholder } from "./MacroEditor";

/** The editor's "Co zrobic": actions run top to bottom, reordered by the grip. */
export function ActionList({
    macros,
    onChange,
    newMacro,
    lineless,
    placeholders,
    commandPlaceholder,
    sounds,
    onRequestSoundUpload,
    pluginMacros,
}: {
    macros: UserMacro[];
    onChange: (macros: UserMacro[]) => void;
    /** What "Dodaj akcje" adds. */
    newMacro: () => UserMacro;
    lineless: boolean;
    placeholders: MacroPlaceholder[];
    commandPlaceholder?: string;
    sounds: CustomSound[];
    onRequestSoundUpload: () => Promise<string | undefined>;
    pluginMacros: PluginTriggerMacro[];
}) {
    const [dragging, setDragging] = useState<number | null>(null);
    const [over, setOver] = useState<number | null>(null);

    const move = (from: number, to: number) => {
        if (from === to) return;
        const next = [...macros];
        const [item] = next.splice(from, 1);
        next.splice(to, 0, item);
        onChange(next);
    };

    return (
        <div className="automation-acts">
            {macros.map((m, i) => (
                <div
                    key={i}
                    className={`automation-act${dragging === i ? " is-dragging" : ""}${over === i && dragging !== i ? " is-over" : ""}`}
                    onDragOver={e => { if (dragging !== null) { e.preventDefault(); setOver(i); } }}
                    onDrop={e => { e.preventDefault(); if (dragging !== null) move(dragging, i); setDragging(null); setOver(null); }}
                >
                    <span
                        className="automation-act__grip"
                        title="Przeciagnij, zeby zmienic kolejnosc"
                        draggable
                        onDragStart={e => { setDragging(i); e.dataTransfer.effectAllowed = "move"; e.dataTransfer.setData("text/plain", String(i)); }}
                        onDragEnd={() => { setDragging(null); setOver(null); }}
                    >
                        <GripVertical size={14} />
                    </span>
                    <MacroEditor
                        macro={m}
                        onChange={macro => onChange(macros.map((p, j) => (j === i ? macro : p)))}
                        onRemove={() => onChange(macros.filter((_, j) => j !== i))}
                        sounds={sounds}
                        onRequestSoundUpload={onRequestSoundUpload}
                        pluginMacros={pluginMacros}
                        lineless={lineless}
                        placeholders={placeholders}
                        commandPlaceholder={commandPlaceholder}
                    />
                </div>
            ))}
            <button type="button" className="automation-add-row" onClick={() => onChange([...macros, newMacro()])}>
                <Plus size={14} />Dodaj akcję
            </button>
        </div>
    );
}
