import type { UiSettings } from "../../uiSettingsCore";
import { CheckboxField, SelectField, SettingsCard } from "@web/settings/controls.tsx";
import { DeviceOnlyBadge } from "../fields";

interface CommandsSectionProps {
    draft: UiSettings;
    update: (patch: Partial<UiSettings>) => void;
}

/** Interfejs > Komendy. Migrated onto the design system (UI_MIGRATION.md §4). */
function CommandsSection({ draft, update }: CommandsSectionProps) {
    return (
        <SettingsCard title="Komendy">
            <CheckboxField id="ui-clear-input" label="Czyść pole komend po wysłaniu" checked={draft.clearInputOnSend} onChange={(v) => update({ clearInputOnSend: v })} />
            <CheckboxField id="ui-auto-lowercase-commands" label="Automatycznie małe litery w komendach" checked={draft.autoLowercaseCommands} onChange={(v) => update({ autoLowercaseCommands: v })} />
            <CheckboxField id="ui-command-echo" label="Echo komend" checked={draft.commandEcho} onChange={(v) => update({ commandEcho: v })} />
            <CheckboxField id="ui-show-voice-button" labelExtra={<DeviceOnlyBadge settingKey="showVoiceButton" />} label="Przycisk mikrofonu (dyktowanie głosowe)" checked={draft.showVoiceButton} onChange={(v) => update({ showVoiceButton: v })} />
            <CheckboxField id="ui-keep-multibinds-visible" labelExtra={<DeviceOnlyBadge settingKey="keepMultibindsVisible" />} label="Zawsze pokazuj pasek multibindów" checked={draft.keepMultibindsVisible} onChange={(v) => update({ keepMultibindsVisible: v })} />
            <SelectField id="ui-multibind-key-hints" labelExtra={<DeviceOnlyBadge settingKey="multibindKeyHints" />} label="Skroty klawiszowe na pasku bindow" value={draft.multibindKeyHints} onChange={(v) => update({ multibindKeyHints: v as UiSettings['multibindKeyHints'] })}>
                <option value="auto">Automatycznie (gdy wykryta klawiatura)</option>
                <option value="always">Zawsze</option>
                <option value="never">Nigdy</option>
            </SelectField>
            <CheckboxField id="ui-drinkable-as-functional-bind" label="Bind picia na bind funkcyjny" checked={draft.drinkableAsFunctionalBind} onChange={(v) => update({ drinkableAsFunctionalBind: v })} />
            <CheckboxField id="ui-gate-as-functional-bind" label="Bind bramy na bind funkcyjny" checked={draft.gateAsFunctionalBind} onChange={(v) => update({ gateAsFunctionalBind: v })} />
            <CheckboxField id="ui-dismount-on-refused-ride" label="Powtorzenie odrzuconej jazdy zsiada z wozu i idzie pieszo" checked={draft.dismountOnRefusedRide} onChange={(v) => update({ dismountOnRefusedRide: v })} />
            <CheckboxField id="ui-carriage-route-binds" label="Bindy trasy wozu (nastepny krok, zsiadanie)" checked={draft.carriageRouteBinds} onChange={(v) => update({ carriageRouteBinds: v })} />
        </SettingsCard>
    );
}

export default CommandsSection;
