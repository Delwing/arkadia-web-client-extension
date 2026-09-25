import type { UiSettings } from "../../uiSettingsCore";
import { ChoiceList, Field } from "@web-ui/primitives/index.ts";
import { CheckboxRow, SettingsSection } from "../fields";

const TAB_MODES: { value: UiSettings['tabCompletionMode']; label: string; description: string }[] = [
    { value: 'cycle', label: 'Cała komenda', description: 'Tab wstawia najlepszą podpowiedź w całości, kolejne Tab przełączają na następne.' },
    { value: 'word', label: 'Słowo po słowie (jak zsh)', description: 'Tab dopisuje jedno słowo podpowiedzi, → całą resztę. Shift+Tab zmienia podpowiedź.' },
    { value: 'whole', label: 'Całość, słowo na żądanie (jak fish)', description: 'Tab i → dopisują całą podpowiedź, Ctrl+→ jedno słowo. Shift+Tab zmienia podpowiedź.' },
];

interface CommandsSectionProps {
    draft: UiSettings;
    update: (patch: Partial<UiSettings>) => void;
}

function CommandsSection({ draft, update }: CommandsSectionProps) {
    return (
        <>
            <SettingsSection title="Pole komend">
                <CheckboxRow id="ui-clear-input" label="Czyść pole komend po wysłaniu" checked={draft.clearInputOnSend} onChange={(v) => update({ clearInputOnSend: v })} />
                <CheckboxRow id="ui-auto-lowercase-commands" label="Automatycznie małe litery w komendach" checked={draft.autoLowercaseCommands} onChange={(v) => update({ autoLowercaseCommands: v })} />
                <CheckboxRow id="ui-command-echo" label="Echo komend" checked={draft.commandEcho} onChange={(v) => update({ commandEcho: v })} />
                <CheckboxRow id="ui-show-voice-button" label="Przycisk mikrofonu (dyktowanie głosowe)" checked={draft.showVoiceButton} onChange={(v) => update({ showVoiceButton: v })} />
            </SettingsSection>
            <SettingsSection title="Uzupełnianie">
                <Field label="Uzupełnianie klawiszem Tab">
                    <ChoiceList
                        id="ui-tab-completion-mode"
                        name="tabCompletionMode"
                        value={draft.tabCompletionMode}
                        onChange={(v) => update({ tabCompletionMode: v })}
                        options={TAB_MODES}
                    />
                </Field>
                <CheckboxRow id="ui-tab-completion-hint" label="Podpowiedź uzupełniania (Tab) za kursorem" checked={draft.tabCompletionHint} onChange={(v) => update({ tabCompletionHint: v })} />
            </SettingsSection>
            <SettingsSection title="Podróż wozem">
                <CheckboxRow id="ui-carriage-route-binds" label="Bindy trasy wozu (następny krok, zsiadanie)" checked={draft.carriageRouteBinds} onChange={(v) => update({ carriageRouteBinds: v })} />
                <CheckboxRow id="ui-dismount-on-refused-ride" label="Powtórzenie odrzuconej jazdy zsiada z wozu i idzie pieszo" checked={draft.dismountOnRefusedRide} onChange={(v) => update({ dismountOnRefusedRide: v })} />
            </SettingsSection>
        </>
    );
}

export default CommandsSection;
