import { useSyncExternalStore } from "react";
import { getAllFooterItems, subscribeFooterItems } from "@modules/core/footerRegistry";
import type { FooterBlockId, FooterBlockNode, FooterChipsBlock, FooterNode } from "@shared/footerLayoutTypes";
import { Check } from "@web-ui/primitives/index.ts";
import { DISPLAY_NAMES } from "../footerComponentRows";
import { CheckboxRow, RangeField, SelectField } from "../../uiSettings/fields";

export const BLOCK_NAMES: Record<FooterBlockId, string> = {
    multibinds: "Multibindy",
    vitals: "Stan postaci",
    chips: "Plakietki",
    compass: "Róża kierunków",
    reconnect: "Połącz ponownie",
};

/** A block as it is first added, before the player sets it up. */
export const NEW_BLOCKS: Record<FooterBlockId, FooterBlockNode> = {
    multibinds: { type: "block", block: "multibinds" },
    vitals: { type: "block", block: "vitals" },
    chips: { type: "block", block: "chips", items: [], arrange: "wrap" },
    compass: { type: "block", block: "compass" },
    reconnect: { type: "block", block: "reconnect" },
};

/** What the editor calls a band or node. */
export function nodeLabel(node: FooterNode | undefined, bandIndex: number): string {
    if (!node) return `Pas ${bandIndex + 1}`;
    if (node.type !== "block") return node.type === "row" ? "Wiersz" : "Kolumna";
    if (node.block === "chips") {
        if (node.items === "rest") return "Plakietki – pozostałe";
        return `Plakietki – wybrane (${node.items.length})`;
    }
    return BLOCK_NAMES[node.block];
}

/** Which chips a chip block lists by name, picked from everything registered. */
function ChipPicker({ block, onChange }: { block: FooterChipsBlock; onChange: (items: string[]) => void }) {
    const registered = useSyncExternalStore(subscribeFooterItems, getAllFooterItems, getAllFooterItems);
    const picked = block.items === "rest" ? [] : block.items;
    const toggle = (id: string, on: boolean) => onChange(on ? [...picked, id] : picked.filter((item) => item !== id));
    return (
        <div className="footer-outline__chips">
            {registered.map((item) => (
                <Check
                    key={item.id}
                    id={`fl-chip-${item.id.replace(/[^a-zA-Z0-9_-]/g, "_")}`}
                    label={DISPLAY_NAMES[item.id] ?? item.label ?? item.id}
                    checked={picked.includes(item.id)}
                    onChange={(e) => toggle(item.id, e.target.checked)}
                />
            ))}
        </div>
    );
}

/** The settings of the selected block or group. */
export default function NodeFields({ node, onChange }: { node: FooterNode; onChange: (node: FooterNode) => void }) {
    const grow = (
        <RangeField
            id="fl-grow"
            label="Udział szerokości (0 = ile potrzebuje)"
            value={node.grow ?? 0}
            min={0}
            max={100}
            step={1}
            onChange={(v) => onChange({ ...node, grow: v > 0 ? v : undefined })}
        />
    );
    if (node.type !== "block") return grow;
    switch (node.block) {
        case "chips":
            return (
                <>
                    {grow}
                    <SelectField
                        id="fl-chip-items"
                        label="Które plakietki"
                        value={node.items === "rest" ? "rest" : "list"}
                        onChange={(v) => onChange({ ...node, items: v === "rest" ? "rest" : [] })}
                    >
                        <option value="rest">Pozostałe – wszystkie niewybrane gdzie indziej</option>
                        <option value="list">Wybrane</option>
                    </SelectField>
                    {node.items !== "rest" && <ChipPicker block={node} onChange={(items) => onChange({ ...node, items })} />}
                    <SelectField id="fl-chip-arrange" label="Ułożenie" value={node.arrange} onChange={(v) => onChange({ ...node, arrange: v as FooterChipsBlock["arrange"] })}>
                        <option value="fold">Jedna linia, reszta pod „+N”</option>
                        <option value="wrap">Tyle linii, ile trzeba</option>
                        <option value="grid">Siatka, kolumnami</option>
                    </SelectField>
                    {node.arrange === "grid" && (
                        <RangeField id="fl-chip-rows" label="Linie siatki" value={node.rows ?? 4} min={1} max={8} step={1} onChange={(v) => onChange({ ...node, rows: v })} />
                    )}
                    <SelectField id="fl-chip-look" label="Wygląd" value={node.look ?? "icon"} onChange={(v) => onChange({ ...node, look: v as FooterChipsBlock["look"] })}>
                        <option value="icon">Kafelki z ikoną</option>
                        <option value="text">Tekst „Nazwa: wartość”</option>
                    </SelectField>
                    <CheckboxRow
                        id="fl-chip-quiet"
                        label="Przygaszone, bez ramek"
                        hint="Szary tekst bez tła – jak ping na końcu klasycznej stopki."
                        checked={node.quiet === true}
                        onChange={(v) => onChange({ ...node, quiet: v || undefined })}
                    />
                </>
            );
        case "vitals":
            return (
                <>
                    {grow}
                    <RangeField id="fl-vitals-per-row" label="Pasków w linii (0 = wszystkie w jednej)" value={node.perRow ?? 0} min={0} max={11} step={1} onChange={(v) => onChange({ ...node, perRow: v > 0 ? v : undefined })} />
                    <CheckboxRow id="fl-improve-bar" label="Postępy jako pasek pod stanem postaci" checked={node.improveBar === true} onChange={(v) => onChange({ ...node, improveBar: v || undefined })} />
                </>
            );
        case "multibinds":
            return (
                <>
                    {grow}
                    <CheckboxRow id="fl-binds-always" label="Zawsze widoczne, także bez bindów" checked={node.alwaysVisible === true} onChange={(v) => onChange({ ...node, alwaysVisible: v || undefined })} />
                </>
            );
        default:
            return grow;
    }
}
