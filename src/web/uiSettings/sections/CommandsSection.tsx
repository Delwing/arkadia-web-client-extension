import type { UiSettings } from "../../uiSettingsCore";
import { CheckboxRow, SelectField, SettingsSection } from "../fields";

interface CommandsSectionProps {
    draft: UiSettings;
    update: (patch: Partial<UiSettings>) => void;
}

function CommandsSection({ draft, update }: CommandsSectionProps) {
    return (
        <SettingsSection title="Komendy">
            <CheckboxRow id="ui-clear-input" label="Czyść pole komend po wysłaniu" checked={draft.clearInputOnSend} onChange={(v) => update({ clearInputOnSend: v })} />
            <CheckboxRow id="ui-auto-lowercase-commands" label="Automatycznie małe litery w komendach" checked={draft.autoLowercaseCommands} onChange={(v) => update({ autoLowercaseCommands: v })} />
            <CheckboxRow id="ui-command-echo" label="Echo komend" checked={draft.commandEcho} onChange={(v) => update({ commandEcho: v })} />
            <CheckboxRow id="ui-show-voice-button" label="Przycisk mikrofonu (dyktowanie głosowe)" checked={draft.showVoiceButton} onChange={(v) => update({ showVoiceButton: v })} />
            <CheckboxRow id="ui-tab-completion-hint" label="Podpowiedź uzupełniania (Tab) za kursorem" checked={draft.tabCompletionHint} onChange={(v) => update({ tabCompletionHint: v })} />
            <CheckboxRow id="ui-keep-multibinds-visible" label="Zawsze pokazuj pasek multibindów" checked={draft.keepMultibindsVisible} onChange={(v) => update({ keepMultibindsVisible: v })} />
            <SelectField id="ui-multibind-key-hints" label="Skroty klawiszowe na pasku bindow" value={draft.multibindKeyHints} onChange={(v) => update({ multibindKeyHints: v as UiSettings['multibindKeyHints'] })}>
                <option value="auto">Automatycznie (na telefonie po Alt, Ctrl lub Tab)</option>
                <option value="always">Zawsze</option>
                <option value="never">Nigdy</option>
            </SelectField>
            <CheckboxRow id="ui-drinkable-as-functional-bind" label="Bind picia na bind funkcyjny" checked={draft.drinkableAsFunctionalBind} onChange={(v) => update({ drinkableAsFunctionalBind: v })} />
            <CheckboxRow id="ui-gate-as-functional-bind" label="Bind bramy na bind funkcyjny" checked={draft.gateAsFunctionalBind} onChange={(v) => update({ gateAsFunctionalBind: v })} />
            <CheckboxRow id="ui-dismount-on-refused-ride" label="Powtorzenie odrzuconej jazdy zsiada z wozu i idzie pieszo" checked={draft.dismountOnRefusedRide} onChange={(v) => update({ dismountOnRefusedRide: v })} />
            <CheckboxRow id="ui-carriage-route-binds" label="Bindy trasy wozu (nastepny krok, zsiadanie)" checked={draft.carriageRouteBinds} onChange={(v) => update({ carriageRouteBinds: v })} />
        </SettingsSection>
    );
}

export default CommandsSection;
