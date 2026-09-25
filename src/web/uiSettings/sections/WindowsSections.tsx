import type { UiSettings } from "../../uiSettingsCore";
import { Button, Field } from "@web-ui/primitives/index.ts";
import { CheckboxRow, NumberField, SelectField, SettingsSection } from "../fields";
import ObjectContextMenuEditor from "../ObjectContextMenuEditor";
import { isLayoutModeForced } from "@web/layout/utils/layoutStorage";
import { isDockArrangementSwitchable } from "@web/layout/utils/dockArrangement";
import type { SpanningDocks } from "@web/layout/types";
import { getActiveShell, switchShell, UI_SHELL_LABELS, UI_SHELLS, type UiShell } from "@web/shell/uiShell";

/** Which chrome the page runs: the classic one or the forge HUD. Switching reloads. */
export function ShellSection() {
    const active = getActiveShell();
    return (
        <SettingsSection title="Interfejs">
            <div className="ui-settings-stack" data-settings-ignore>
                <div className="popup-field__hint">
                    Obecnie: {UI_SHELL_LABELS[active]}. Wybór dotyczy tego urządzenia; zmiana przeładuje stronę.
                </div>
                {UI_SHELLS.filter((shell) => shell !== active).map((shell: UiShell) => (
                    <Button key={shell} size="sm" className="ui-settings-self-start" id={`ui-shell-${shell}`} onClick={() => switchShell(shell)}>
                        Przełącz na: {UI_SHELL_LABELS[shell]}
                    </Button>
                ))}
            </div>
        </SettingsSection>
    );
}

interface LayoutManagerSectionProps {
    layoutEnabled: boolean;
    layoutObjectList: boolean;
    dockArrangement: SpanningDocks;
    onLayoutEnabledChange: (v: boolean) => void;
    onLayoutObjectListChange: (v: boolean) => void;
    onDockArrangementChange: (v: SpanningDocks) => void;
    onLayoutReset: () => void;
}

export function LayoutManagerSection({
    layoutEnabled, layoutObjectList, dockArrangement, onLayoutEnabledChange, onLayoutObjectListChange, onDockArrangementChange, onLayoutReset,
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
                    <div className="popup-field__hint">Ten interfejs zawsze korzysta z menedżera okien.</div>
                ) : (
                    <>
                        <CheckboxRow id="ui-layout-manager-enabled" label="Włącz menedżer okien" checked={layoutEnabled} onChange={onLayoutEnabledChange} />
                        <CheckboxRow id="ui-layout-manager-object-list" label="Kondycje" checked={layoutObjectList} onChange={onLayoutObjectListChange} disabled={!layoutEnabled} className="ui-settings-indent" />
                    </>
                )}
                {isDockArrangementSwitchable() && (
                    <SelectField id="ui-layout-dock-arrangement" label="Układ doków" value={dockArrangement} disabled={!layoutEnabled} onChange={(v) => onDockArrangementChange(v as SpanningDocks)}>
                        <option value="topBottom">Górny i dolny na całą szerokość</option>
                        <option value="leftRight">Boczne na całą wysokość</option>
                    </SelectField>
                )}
                <Button size="sm" className="ui-settings-self-start" id="ui-layout-manager-reset" onClick={onLayoutReset}>Przywróć domyślny układ</Button>
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
            <NumberField id="ui-output-max-elements" label="Maksymalna liczba linii w buforze" value={draft.outputMaxElements} step={100} min={100} onChange={(n) => update({ outputMaxElements: n })} />
            <SelectField id="ui-team-numbering-mode" label="Numerowanie druzyny na liscie obiektow" value={draft.teamNumberingMode} onChange={(v) => update({ teamNumberingMode: v as UiSettings['teamNumberingMode'] })}>
                <option value="letters">Litery (A, B, C...)</option>
                <option value="numbers">Numery (1, 2, 3...)</option>
            </SelectField>
            <Field label="Menu kontekstowe obiektów (PPM)" htmlFor="ui-object-context-menu-input">
                <ObjectContextMenuEditor commands={draft.objectContextMenuCommands} onChange={(objectContextMenuCommands) => update({ objectContextMenuCommands })} />
            </Field>
        </SettingsSection>
    );
}
