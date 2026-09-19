import type { UiSettings } from "../../uiSettingsCore";
import { CheckboxRow, SettingsSection } from "../fields";

interface OtherSectionsProps {
    draft: UiSettings;
    update: (patch: Partial<UiSettings>) => void;
}

/**
 * Interfejs > Przyciski mobilne, the "Wyświetlanie" card. Still on Bootstrap:
 * the rest of that tab is MobileButtons (761 lines) and a tab moves whole.
 * The "Inne" card that used to live here migrated to ./OtherSection.tsx.
 */
export function MobileButtonsSection({ draft, update }: OtherSectionsProps) {
    return (
        <SettingsSection title="Wyświetlanie">
            <CheckboxRow id="ui-show-buttons" settingKey="showButtons" label="Pokaż przyciski na ekranie" checked={draft.showButtons} onChange={(v) => update({ showButtons: v })} />
            <CheckboxRow id="ui-haptic-feedback" label="Wibracje przycisków mobilnych" checked={draft.hapticFeedback} onChange={(v) => update({ hapticFeedback: v })} />
        </SettingsSection>
    );
}
