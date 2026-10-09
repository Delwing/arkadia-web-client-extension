import {
    FOOTER_PRESET_TWEAKS,
    type FooterLayoutTweak,
    type FooterLayoutTweaks,
    type FooterLayoutTweakSet,
    type FooterPresetId,
} from "@shared/footerLayoutTypes";
import { FOOTER_PRESETS } from "@web-ui/footer/layout/presets.ts";
import { layoutTweaks } from "@web-ui/footer/layout/layoutTree.ts";
import { CheckboxRow, RangeField, SelectField } from "../uiSettings/fields";

interface FooterLayoutSettingsProps {
    layout: FooterPresetId | undefined;
    tweaks: FooterLayoutTweakSet | undefined;
    onChange: (layout: FooterPresetId | undefined, tweaks: FooterLayoutTweakSet | undefined) => void;
}

/**
 * Stopka -> Układ stopki: the layout every UI draws, then the handful of
 * adjustments that layout offers (FOOTER_PRESET_TWEAKS). Each layout keeps its
 * own adjustments, so trying another one and coming back loses nothing.
 */
export default function FooterLayoutSettings({ layout, tweaks, onChange }: FooterLayoutSettingsProps) {
    const own = layout ? tweaks?.[layout] : undefined;
    const values = layout ? { ...layoutTweaks(FOOTER_PRESETS[layout]), ...own } : null;
    const set = <K extends FooterLayoutTweak>(key: K, value: FooterLayoutTweaks[K]) => {
        if (!layout) return;
        onChange(layout, { ...tweaks, [layout]: { ...own, [key]: value } });
    };
    const offered = (key: FooterLayoutTweak) => layout !== undefined && FOOTER_PRESET_TWEAKS[layout].includes(key);

    return (
        <>
            <SelectField
                id="ui-footer-layout"
                label="Układ"
                hint="Jeden dla obu interfejsów. Telefon zawsze ma układ klasyczny."
                value={layout ?? ""}
                onChange={(v) => onChange(v ? (v as FooterPresetId) : undefined, tweaks)}
            >
                <option value="">Własny układ interfejsu</option>
                <option value="stock">Klasyczny</option>
                <option value="forge">Kuźnia</option>
                <option value="arkadia">Arkadia (Mudlet)</option>
            </SelectField>
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
