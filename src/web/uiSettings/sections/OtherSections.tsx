import type { UiSettings } from "../../uiSettingsCore";
import { CheckboxRow, SettingsSection } from "../fields";

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
        </SettingsSection>
    );
}
