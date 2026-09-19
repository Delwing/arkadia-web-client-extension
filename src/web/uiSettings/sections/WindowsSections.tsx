import { Button } from "@design";
import type { UiSettings } from "../../uiSettingsCore";
import {
    CheckboxField,
    NumberField,
    SelectField,
    SettingsCard,
    SettingsHint,
} from "@web/settings/controls.tsx";
import { DeviceOnlyBadge } from "../fields";
import ObjectContextMenuEditor from "../ObjectContextMenuEditor";
import { isLayoutModeForced } from "@web/layout/utils/layoutStorage";

interface LayoutManagerSectionProps {
    layoutEnabled: boolean;
    layoutObjectList: boolean;
    onLayoutEnabledChange: (v: boolean) => void;
    onLayoutObjectListChange: (v: boolean) => void;
    onLayoutReset: () => void;
}

/** Interfejs > Okna. Migrated onto the design system (UI_MIGRATION.md §4). */
export function LayoutManagerSection({
    layoutEnabled, layoutObjectList, onLayoutEnabledChange, onLayoutObjectListChange, onLayoutReset,
}: LayoutManagerSectionProps) {
    const layoutForced = isLayoutModeForced();

    return (
        <SettingsCard title="Menedżer Okien">
            {/* These save immediately rather than on Save, so they never mark
                the page as having unsaved changes. */}
            <div className="settings-stack" data-settings-ignore>
                {/* Shells that force layout mode on (forge) hide the toggles: they
                    are process-local overrides, so flipping them here would do
                    nothing and would not persist. */}
                {layoutForced ? (
                    <SettingsHint>Ten interfejs zawsze korzysta z menedżera okien.</SettingsHint>
                ) : (
                    <>
                        <CheckboxField id="ui-layout-manager-enabled" label="Włącz menedżer okien" checked={layoutEnabled} onChange={onLayoutEnabledChange} />
                        <div className="settings-check--indent">
                            <CheckboxField id="ui-layout-manager-object-list" label="Kondycje" checked={layoutObjectList} onChange={onLayoutObjectListChange} disabled={!layoutEnabled} />
                        </div>
                    </>
                )}
                <Button className="settings-action" size="sm" id="ui-layout-manager-reset" onClick={onLayoutReset}>Przywróć domyślny układ</Button>
            </div>
        </SettingsCard>
    );
}

interface OutputSectionProps {
    draft: UiSettings;
    update: (patch: Partial<UiSettings>) => void;
}

export function OutputSection({ draft, update }: OutputSectionProps) {
    return (
        <SettingsCard title="Okno wyjścia i lista obiektów">
            <NumberField id="ui-output-bottom-padding" label="Dolny padding okna (px)" value={draft.outputBottomPadding} step={1} min={0} onChange={(n) => update({ outputBottomPadding: n })} />
            <NumberField id="ui-output-max-elements" label="Maksymalna liczba linii w buforze" labelExtra={<DeviceOnlyBadge settingKey="outputMaxElements" />} value={draft.outputMaxElements} step={100} min={100} onChange={(n) => update({ outputMaxElements: n })} />
            <SelectField id="ui-team-numbering-mode" label="Numerowanie druzyny na liscie obiektow" value={draft.teamNumberingMode} onChange={(v) => update({ teamNumberingMode: v as UiSettings['teamNumberingMode'] })}>
                <option value="letters">Litery (A, B, C...)</option>
                <option value="numbers">Numery (1, 2, 3...)</option>
            </SelectField>
            <div className="settings-field">
                <label className="settings-field__label" htmlFor="ui-object-context-menu-input">Menu kontekstowe obiektów (PPM)</label>
                <ObjectContextMenuEditor commands={draft.objectContextMenuCommands} onChange={(objectContextMenuCommands) => update({ objectContextMenuCommands })} />
            </div>
        </SettingsCard>
    );
}
