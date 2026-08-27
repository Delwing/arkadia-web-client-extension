import { useState } from "react";
import type { UiSettings } from "../../uiSettingsCore";
import { CheckboxRow, NumberField, SelectField, SettingsSection } from "../fields";
import ObjectContextMenuEditor from "../ObjectContextMenuEditor";

interface BehaviourTabProps {
    draft: UiSettings;
    update: (patch: Partial<UiSettings>) => void;
    onEnableNotifications: () => void;
}

function notificationsGranted() {
    return typeof Notification !== "undefined" && Notification.permission === "granted";
}

function BehaviourTab({ draft, update, onEnableNotifications }: BehaviourTabProps) {
    const [notifGranted, setNotifGranted] = useState(notificationsGranted);

    return (
        <>
            <SettingsSection title="Komendy">
                <CheckboxRow id="ui-clear-input" label="Czyść pole komend po wysłaniu" checked={draft.clearInputOnSend} onChange={(v) => update({ clearInputOnSend: v })} />
                <CheckboxRow id="ui-auto-lowercase-commands" label="Automatycznie małe litery w komendach" checked={draft.autoLowercaseCommands} onChange={(v) => update({ autoLowercaseCommands: v })} />
                <CheckboxRow id="ui-command-echo" label="Echo komend" checked={draft.commandEcho} onChange={(v) => update({ commandEcho: v })} />
                <CheckboxRow id="ui-keep-multibinds-visible" label="Zawsze pokazuj pasek multibindów" checked={draft.keepMultibindsVisible} onChange={(v) => update({ keepMultibindsVisible: v })} />
                <CheckboxRow id="ui-drinkable-as-functional-bind" label="Bind picia na bind funkcyjny" checked={draft.drinkableAsFunctionalBind} onChange={(v) => update({ drinkableAsFunctionalBind: v })} />
                <CheckboxRow id="ui-gate-as-functional-bind" label="Bind bramy na bind funkcyjny" checked={draft.gateAsFunctionalBind} onChange={(v) => update({ gateAsFunctionalBind: v })} />
                <CheckboxRow id="ui-dismount-on-refused-ride" label="Powtorzenie odrzuconej jazdy zsiada z wozu i idzie pieszo" checked={draft.dismountOnRefusedRide} onChange={(v) => update({ dismountOnRefusedRide: v })} />
                <CheckboxRow id="ui-carriage-route-binds" label="Bindy trasy wozu (nastepny krok, zsiadanie)" checked={draft.carriageRouteBinds} onChange={(v) => update({ carriageRouteBinds: v })} />
            </SettingsSection>

            <SettingsSection title="Okno wyjścia i lista obiektów">
                <NumberField id="ui-output-bottom-padding" label="Dolny padding okna (px)" value={draft.outputBottomPadding} step={1} min={0} onChange={(n) => update({ outputBottomPadding: n })} />
                <NumberField id="ui-output-max-elements" label="Maksymalna liczba linii w buforze" value={draft.outputMaxElements} step={100} min={100} onChange={(n) => update({ outputMaxElements: n })} />
                <SelectField id="ui-team-numbering-mode" label="Numerowanie druzyny na liscie obiektow" value={draft.teamNumberingMode} onChange={(v) => update({ teamNumberingMode: v as UiSettings['teamNumberingMode'] })}>
                    <option value="letters">Litery (A, B, C...)</option>
                    <option value="numbers">Numery (1, 2, 3...)</option>
                </SelectField>
                <div className="mt-2">
                    <label className="form-label mb-1">Menu kontekstowe obiektów (PPM)</label>
                    <ObjectContextMenuEditor commands={draft.objectContextMenuCommands} onChange={(objectContextMenuCommands) => update({ objectContextMenuCommands })} />
                </div>
            </SettingsSection>

            <SettingsSection title="Inne">
                <CheckboxRow id="ui-fight-title-icon" label="Ikona walki w tytule" checked={draft.fightTitleIcon} onChange={(v) => update({ fightTitleIcon: v })} />
                <CheckboxRow id="ui-wake-lock" label="Blokada usypiania ekranu (Wake Lock)" checked={draft.wakeLock} onChange={(v) => update({ wakeLock: v })} />
                {!notifGranted && (
                    <button
                        type="button"
                        className="btn btn-warning align-self-start"
                        id="ui-enable-notifications"
                        onClick={() => { onEnableNotifications(); setNotifGranted(notificationsGranted()); }}
                    >
                        Włącz powiadomienia
                    </button>
                )}
            </SettingsSection>
        </>
    );
}

export default BehaviourTab;
