import { useState } from "react";
import {
    FOOTER_PRESET_TWEAKS,
    type FooterLayout,
    type FooterLayoutChoice,
    type FooterLayoutTweak,
    type FooterLayoutTweaks,
    type FooterLayoutTweakSet,
    type FooterPresetId,
} from "@shared/footerLayoutTypes";
import { Button } from "@web-ui/primitives/index.ts";
import { FOOTER_PRESETS } from "@web-ui/footer/layout/presets.ts";
import { layoutTweaks, tweakLayout } from "@web-ui/footer/layout/layoutTree.ts";
import { CheckboxRow, RangeField, SelectField } from "../uiSettings/fields";
import FooterLayoutDialog from "./footerEditor/FooterLayoutDialog";

export interface FooterLayoutSettingsValue {
    footerLayout?: FooterLayoutChoice;
    footerLayoutTweaks?: FooterLayoutTweakSet;
    footerCustomLayout?: FooterLayout;
    footerCustomBase?: FooterPresetId;
}

interface FooterLayoutSettingsProps {
    value: FooterLayoutSettingsValue;
    onChange: (patch: FooterLayoutSettingsValue) => void;
}

const PRESET_NAMES: Record<FooterPresetId, string> = {
    stock: "Klasyczny",
    forge: "Piętrowy",
    arkadia: "Mudlet",
};

/** A preset as the player has adjusted it: where their own layout starts from. */
const presetAsTweaked = (preset: FooterPresetId, tweaks: FooterLayoutTweakSet | undefined): FooterLayout =>
    tweakLayout(FOOTER_PRESETS[preset], tweaks?.[preset]);

/**
 * Stopka -> Układ stopki: the layout every UI draws, then the handful of
 * adjustments that layout offers (FOOTER_PRESET_TWEAKS). Each layout keeps its
 * own adjustments, so trying another one and coming back loses nothing.
 * "Dostosuj" opens a preset in the layout editor (a dialog over the settings)
 * to build the player's own from; their own is kept while they try presets.
 */
export default function FooterLayoutSettings({ value, onChange }: FooterLayoutSettingsProps) {
    // Nothing picked is the classic layout.
    const choice = value.footerLayout ?? "stock";
    const tweaks = value.footerLayoutTweaks;
    const layout = choice !== "custom" ? choice : undefined;
    const own = layout ? tweaks?.[layout] : undefined;
    const values = layout ? { ...layoutTweaks(FOOTER_PRESETS[layout]), ...own } : null;
    const set = <K extends FooterLayoutTweak>(key: K, next: FooterLayoutTweaks[K]) => {
        if (!layout) return;
        onChange({ footerLayoutTweaks: { ...tweaks, [layout]: { ...own, [key]: next } } });
    };
    const offered = (key: FooterLayoutTweak) => layout !== undefined && FOOTER_PRESET_TWEAKS[layout].includes(key);

    const base = value.footerCustomBase ?? "stock";
    /** The editor, open on a layout; "Gotowe" makes it the player's own, `base` the preset it came from. */
    const [editing, setEditing] = useState<{ initial: FooterLayout; base: FooterPresetId } | null>(null);
    const customize = (preset: FooterPresetId) => setEditing({ initial: presetAsTweaked(preset, tweaks), base: preset });

    return (
        <>
            <SelectField
                id="ui-footer-layout"
                label="Układ"
                hint="Jeden dla obu interfejsów. Telefon zawsze ma układ klasyczny."
                value={choice}
                onChange={(v) => {
                    // Nothing of their own yet: start it from the layout they had.
                    if (v === "custom" && !value.footerCustomLayout) customize(layout ?? "stock");
                    else onChange({ footerLayout: v as FooterLayoutChoice });
                }}
            >
                <option value="stock">{PRESET_NAMES.stock}</option>
                <option value="forge">{PRESET_NAMES.forge}</option>
                <option value="arkadia">{PRESET_NAMES.arkadia}</option>
                <option value="custom">Własny</option>
            </SelectField>
            {layout && (
                <div className="popup-field">
                    <Button size="sm" id="ui-footer-customize" onClick={() => customize(layout)}>Dostosuj…</Button>
                    <div className="popup-field__hint">
                        Otwiera edytor z tym układem, by zbudować z niego własny{value.footerCustomLayout ? " – zastąpi obecny własny" : ""}.
                    </div>
                </div>
            )}
            {choice === "custom" && value.footerCustomLayout && (
                <div className="popup-field footer-layout-custom-actions">
                    <Button size="sm" id="ui-footer-edit" onClick={() => setEditing({ initial: value.footerCustomLayout!, base })}>Edytuj układ…</Button>
                    <Button
                        size="sm"
                        variant="ghost"
                        id="ui-footer-restore"
                        onClick={() => onChange({ footerCustomLayout: presetAsTweaked(base, tweaks) })}
                    >
                        Przywróć {PRESET_NAMES[base]}
                    </Button>
                </div>
            )}
            {editing && (
                <FooterLayoutDialog
                    initial={editing.initial}
                    onCancel={() => setEditing(null)}
                    onDone={(footerCustomLayout) => {
                        onChange({ footerLayout: "custom", footerCustomLayout, footerCustomBase: editing.base });
                        setEditing(null);
                    }}
                />
            )}
            {values && offered("chipLook") && (
                <SelectField
                    id="ui-footer-chip-look"
                    label="Plakietki"
                    value={values.chipLook}
                    onChange={(v) => set("chipLook", v as FooterLayoutTweaks["chipLook"])}
                >
                    <option value="icon">Kafelki z ikoną</option>
                    <option value="text">Tekst „Nazwa: wartość”</option>
                </SelectField>
            )}
            {values && offered("chipArrange") && (
                <SelectField
                    id="ui-footer-chip-arrange"
                    label="Gdy plakietki się nie mieszczą"
                    value={values.chipArrange}
                    onChange={(v) => set("chipArrange", v as FooterLayoutTweaks["chipArrange"])}
                >
                    <option value="fold">Jedna linia, reszta pod „+N”</option>
                    <option value="wrap">Tyle linii, ile trzeba</option>
                </SelectField>
            )}
            {values && offered("chipRows") && (
                <RangeField id="ui-footer-chip-rows" label="Linie plakietek" value={values.chipRows} min={1} max={8} step={1} onChange={(v) => set("chipRows", v)} />
            )}
            {values && offered("vitalsPerRow") && (
                <RangeField id="ui-footer-vitals-per-row" label="Pasków stanu w linii" value={values.vitalsPerRow} min={1} max={11} step={1} onChange={(v) => set("vitalsPerRow", v)} />
            )}
            {values && offered("improveBar") && (
                <CheckboxRow id="ui-footer-improve-bar" label="Postępy jako pasek pod stanem postaci" checked={values.improveBar} onChange={(v) => set("improveBar", v)} />
            )}
            {values && offered("compass") && (
                <CheckboxRow id="ui-footer-compass" label="Róża kierunków z wyjściami" checked={values.compass} onChange={(v) => set("compass", v)} />
            )}
            {values && offered("compassWidth") && values.compass && (
                <RangeField id="ui-footer-compass-width" label="Szerokość róży (%)" value={values.compassWidth} min={5} max={40} step={1} onChange={(v) => set("compassWidth", v)} />
            )}
            {values && offered("chipsWidth") && (
                <RangeField id="ui-footer-chips-width" label="Szerokość plakietek (%)" value={values.chipsWidth} min={10} max={80} step={1} onChange={(v) => set("chipsWidth", v)} />
            )}
        </>
    );
}
