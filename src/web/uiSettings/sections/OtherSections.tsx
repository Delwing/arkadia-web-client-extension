import type { UiSettings } from "../../uiSettingsCore";
import { CheckboxRow, SelectField, SettingsSection } from "../fields";

interface OtherSectionsProps {
    draft: UiSettings;
    update: (patch: Partial<UiSettings>) => void;
}

export function MobileButtonsSection({ draft, update }: OtherSectionsProps) {
    return (
        <SettingsSection title="Wyświetlanie">
            <CheckboxRow id="ui-show-buttons" label="Pokaż przyciski na ekranie" checked={draft.showButtons} onChange={(v) => update({ showButtons: v })} />
            <CheckboxRow id="ui-haptic-feedback" label="Wibracje przycisków mobilnych" checked={draft.hapticFeedback} onChange={(v) => update({ hapticFeedback: v })} />
        </SettingsSection>
    );
}

export function OtherSection({ draft, update }: OtherSectionsProps) {
    return (
        <SettingsSection title="Inne">
            <CheckboxRow id="ui-fight-title-icon" label="Ikona walki w tytule" checked={draft.fightTitleIcon} onChange={(v) => update({ fightTitleIcon: v })} />
            <CheckboxRow id="ui-wake-lock" label="Blokada usypiania ekranu (Wake Lock)" checked={draft.wakeLock} onChange={(v) => update({ wakeLock: v })} />
            <SelectField id="ui-trigger-prefilter" label="Filtr wyzwalaczy" hint="Pomija wyzwalacze, które nie mogą pasować do linii, co przyspiesza przetwarzanie tekstu z gry. Weryfikacja niczego nie pomija, tylko zgłasza w konsoli przeglądarki linie, przy których filtr by się pomylił." value={draft.triggerPrefilter} onChange={(v) => update({ triggerPrefilter: v as UiSettings['triggerPrefilter'] })}>
                <option value="on">Włączony</option>
                <option value="off">Wyłączony</option>
                <option value="verify">Weryfikacja (diagnostyka, błędy w konsoli)</option>
            </SelectField>
        </SettingsSection>
    );
}
