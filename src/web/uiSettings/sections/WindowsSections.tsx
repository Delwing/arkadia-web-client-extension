import { useEffect, useState } from "react";
import type { UiSettings } from "../../uiSettingsCore";
import { Button, Field } from "@web-ui/primitives/index.ts";
import { CheckboxRow, NumberField, SelectField, SettingsSection } from "../fields";
import ObjectContextMenuEditor from "../ObjectContextMenuEditor";
import { isLayoutModeForced, isRailSpanSupported } from "@web/layout/utils/layoutStorage";
import { useBuiltInPanelSetting } from "@web/hooks/useBuiltInPanelSetting.ts";
import { SEPARATE_OTHERS_SETTING } from "@web/layout/types.ts";
import { listSettingsWindows } from "@web/layout/settingsWindows.ts";
import { subscribeToRegistry } from "@web/layout/popupRegistry.ts";
import { WindowSettingsSections } from "@web/layout/components/WindowSettingsMenu.tsx";
import { AppModal, MODAL_EVENT } from "@web/modals/appModal.ts";
import { SETTINGS_MODAL_ID } from "@web/settings/categories.ts";

interface LayoutManagerSectionProps {
    layoutEnabled: boolean;
    layoutObjectList: boolean;
    layoutRailsFull: boolean;
    onLayoutEnabledChange: (v: boolean) => void;
    onLayoutObjectListChange: (v: boolean) => void;
    onLayoutRailsFullChange: (v: boolean) => void;
    onLayoutReset: () => void;
}

export function LayoutManagerSection({
    layoutEnabled, layoutObjectList, layoutRailsFull,
    onLayoutEnabledChange, onLayoutObjectListChange, onLayoutRailsFullChange, onLayoutReset,
}: LayoutManagerSectionProps) {
    const layoutForced = isLayoutModeForced();
    const railSpanSupported = isRailSpanSupported();
    // Alias of the toggle in Kondycje's settings cog: the same window setting,
    // so flipping either one moves the other.
    const [separateOthers, setSeparateOthers] = useBuiltInPanelSetting('objectList', SEPARATE_OTHERS_SETTING, false);

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
                        <CheckboxRow id="ui-layout-manager-object-list" label="Kondycje jako okno" hint="Wyłączone: lista pływa nad tekstem gry i przesuwasz ją myszą." checked={layoutObjectList} onChange={onLayoutObjectListChange} disabled={!layoutEnabled} className="ui-settings-indent" />
                        <CheckboxRow id="ui-layout-manager-separate-others" label="Pozostali w osobnym oknie" checked={separateOthers === true} onChange={setSeparateOthers} disabled={!layoutEnabled || !layoutObjectList} className="ui-settings-indent ui-settings-indent--2" />
                        {railSpanSupported && (
                            <DockArrangementTiles railsFull={layoutRailsFull} onChange={onLayoutRailsFullChange} disabled={!layoutEnabled} />
                        )}
                    </>
                )}
                <Button size="sm" className="ui-settings-self-start" id="ui-layout-manager-reset" onClick={onLayoutReset}>Przywróć domyślny układ</Button>
            </div>
        </SettingsSection>
    );
}

const DOCK_ARRANGEMENTS = [
    { railsFull: false, id: "ui-layout-arrangement-wide", label: "Pasek poleceń na całą szerokość" },
    { railsFull: true, id: "ui-layout-arrangement-tall", label: "Boczne okna na całą wysokość" },
] as const;

/** Which of the two dock arrangements, each drawn as a miniature of the screen. */
function DockArrangementTiles({ railsFull, onChange, disabled }: {
    railsFull: boolean; onChange: (railsFull: boolean) => void; disabled: boolean;
}) {
    return (
        <div className="ui-settings-indent dock-arrangement-tiles">
            {DOCK_ARRANGEMENTS.map(a => (
                <label key={a.id} className="dock-arrangement-tile">
                    <input
                        type="radio"
                        id={a.id}
                        name="ui-layout-arrangement"
                        checked={railsFull === a.railsFull}
                        disabled={disabled}
                        onChange={() => onChange(a.railsFull)}
                    />
                    <DockArrangementPreview railsFull={a.railsFull} />
                    <span>{a.label}</span>
                </label>
            ))}
        </div>
    );
}

/** Side docks, game output and command bar, as the arrangement places them. */
function DockArrangementPreview({ railsFull }: { railsFull: boolean }) {
    const sideHeight = railsFull ? 56 : 40;
    const barX = railsFull ? 27 : 3;
    return (
        <svg viewBox="0 0 96 62" width="96" height="62">
            <rect className="dock-arrangement-tile__dock" x="3" y="3" width="21" height={sideHeight} rx="2" />
            <rect className="dock-arrangement-tile__dock" x="72" y="3" width="21" height={sideHeight} rx="2" />
            <rect className="dock-arrangement-tile__output" x="27" y="3" width="42" height="40" rx="2" />
            <rect className="dock-arrangement-tile__bar" x={barX} y="46" width={96 - 2 * barX} height="13" rx="2" />
        </svg>
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
            <SelectField id="ui-team-numbering-mode" label="Numerowanie drużyny na liście obiektów" value={draft.teamNumberingMode} onChange={(v) => update({ teamNumberingMode: v as UiSettings['teamNumberingMode'] })}>
                <option value="letters">Litery (A, B, C...)</option>
                <option value="numbers">Numery (1, 2, 3...)</option>
            </SelectField>
            <CheckboxRow id="ui-object-list-cover-markers" label="Pokazuj zasłony wrogów (tarcza za nazwą)" checked={draft.objectListCoverMarkers} onChange={(v) => update({ objectListCoverMarkers: v })} />
            <Field label="Menu kontekstowe obiektów (PPM)" htmlFor="ui-object-context-menu-input">
                <ObjectContextMenuEditor commands={draft.objectContextMenuCommands} onChange={(objectContextMenuCommands) => update({ objectContextMenuCommands })} />
            </Field>
        </SettingsSection>
    );
}

/**
 * Every window's settings, the same ones its header cog edits, for when the
 * header has no room for the cog (a phone, say). They save at once, like the cog.
 */
/** Whether the settings dialog shows; its pages stay mounted while it is closed. */
function useSettingsDialogOpen(): boolean {
    const [open, setOpen] = useState(() => !!AppModal.byId(SETTINGS_MODAL_ID)?.isOpen);
    useEffect(() => {
        const modalEl = document.getElementById(SETTINGS_MODAL_ID);
        const onShow = () => setOpen(true);
        const onHidden = () => setOpen(false);
        modalEl?.addEventListener(MODAL_EVENT.show, onShow);
        modalEl?.addEventListener(MODAL_EVENT.hidden, onHidden);
        return () => {
            modalEl?.removeEventListener(MODAL_EVENT.show, onShow);
            modalEl?.removeEventListener(MODAL_EVENT.hidden, onHidden);
        };
    }, []);
    return open;
}

export function WindowSettingsSection() {
    // Built only while the dialog shows: the hidden pages would otherwise carry
    // a copy of every open window's title and settings.
    return useSettingsDialogOpen() ? <WindowSettingsPicker /> : <SettingsSection title="Ustawienia okien">{null}</SettingsSection>;
}

function WindowSettingsPicker() {
    const [windows, setWindows] = useState(listSettingsWindows);
    useEffect(() => subscribeToRegistry(() => setWindows(listSettingsWindows())), []);
    const [selectedId, setSelectedId] = useState(windows[0]?.id ?? '');
    const selected = windows.find(w => w.id === selectedId) ?? windows[0];

    return (
        <SettingsSection title="Ustawienia okien">
            <div className="ui-settings-stack" data-settings-ignore>
                <SelectField
                    id="ui-window-settings-window"
                    label="Okno"
                    hint="Zamknięte okna pojawią się na liście po otwarciu."
                    value={selected?.id ?? ''}
                    onChange={setSelectedId}
                >
                    {windows.map(w => <option key={w.id} value={w.id}>{w.title}</option>)}
                </SelectField>
                {selected && (
                    <div className="window-settings-inline">
                        <WindowSettingsSections
                            key={selected.id}
                            windowId={selected.id}
                            title={selected.title}
                            fields={selected.fields}
                            appearance={selected.appearance}
                        />
                    </div>
                )}
            </div>
        </SettingsSection>
    );
}
