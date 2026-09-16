import type { UiSettings } from "../../uiSettingsCore";
import { CheckboxRow, NumberField, SelectField, SettingsSection } from "../fields";
import ObjectContextMenuEditor from "../ObjectContextMenuEditor";
import { isLayoutModeForced } from "@web/layout/utils/layoutStorage";

interface LayoutManagerSectionProps {
    layoutEnabled: boolean;
    layoutObjectList: boolean;
    onLayoutEnabledChange: (v: boolean) => void;
    onLayoutObjectListChange: (v: boolean) => void;
    onLayoutReset: () => void;
}

export function LayoutManagerSection({
    layoutEnabled, layoutObjectList, onLayoutEnabledChange, onLayoutObjectListChange, onLayoutReset,
}: LayoutManagerSectionProps) {
    const layoutForced = isLayoutModeForced();

    return (
        <SettingsSection title="Menedżer Okien">
            {/* These save immediately rather than on Save, so they never mark
                the page as having unsaved changes. */}
            <div className="ui-settings-stack" data-settings-ignore>
                {/* Shells that force layout mode on (forge) hide the toggles: they
                    are process-local overrides, so flipping them here would do
                    nothing and would not persist. */}
                {layoutForced ? (
                    <div className="text-muted small">Ten interfejs zawsze korzysta z menedżera okien.</div>
                ) : (
                    <>
                        <CheckboxRow id="ui-layout-manager-enabled" label="Włącz menedżer okien" checked={layoutEnabled} onChange={onLayoutEnabledChange} />
                        <CheckboxRow id="ui-layout-manager-object-list" label="Kondycje" checked={layoutObjectList} onChange={onLayoutObjectListChange} disabled={!layoutEnabled} className="ms-3" />
                    </>
                )}
                <button type="button" className="btn btn-secondary btn-sm align-self-start" id="ui-layout-manager-reset" onClick={onLayoutReset}>Przywróć domyślny układ</button>
            </div>
        </SettingsSection>
    );
}

interface OutputSectionProps {
    draft: UiSettings;
    update: (patch: Partial<UiSettings>) => void;
}

export function OutputSection({ draft, update }: OutputSectionProps) {
    return (
        <SettingsSection title="Okno wyjścia i lista obiektów">
            <NumberField id="ui-output-bottom-padding" label="Dolny padding okna (px)" value={draft.outputBottomPadding} step={1} min={0} onChange={(n) => update({ outputBottomPadding: n })} />
            <NumberField id="ui-output-max-elements" label="Maksymalna liczba linii w buforze" settingKey="outputMaxElements" value={draft.outputMaxElements} step={100} min={100} onChange={(n) => update({ outputMaxElements: n })} />
            <SelectField id="ui-team-numbering-mode" label="Numerowanie druzyny na liscie obiektow" value={draft.teamNumberingMode} onChange={(v) => update({ teamNumberingMode: v as UiSettings['teamNumberingMode'] })}>
                <option value="letters">Litery (A, B, C...)</option>
                <option value="numbers">Numery (1, 2, 3...)</option>
            </SelectField>
            <div className="mt-2">
                <label className="form-label mb-1">Menu kontekstowe obiektów (PPM)</label>
                <ObjectContextMenuEditor commands={draft.objectContextMenuCommands} onChange={(objectContextMenuCommands) => update({ objectContextMenuCommands })} />
            </div>
        </SettingsSection>
    );
}
