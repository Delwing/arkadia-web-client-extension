import type { UiSettings } from "../../uiSettingsCore";
import { DeviceOnlyBadge } from "../fields";
import { CheckboxField, SettingsCard } from "@web/settings/controls.tsx";

interface OtherSectionsProps {
    draft: UiSettings;
    update: (patch: Partial<UiSettings>) => void;
}

/**
 * Interfejs > Przyciski mobilne, the "Wyświetlanie" card. Migrated onto the
 * design system together with the rest of the page (UI_MIGRATION.md §4).
 * The "Inne" card that used to live here migrated to ./OtherSection.tsx.
 */
export function MobileButtonsSection({ draft, update }: OtherSectionsProps) {
    return (
        <SettingsCard title="Wyświetlanie">
            <CheckboxField
                id="ui-show-buttons"
                labelExtra={<DeviceOnlyBadge settingKey="showButtons" />}
                label="Pokaż przyciski na ekranie"
                checked={draft.showButtons}
                onChange={(v) => update({ showButtons: v })}
            />
            <CheckboxField
                id="ui-haptic-feedback"
                label="Wibracje przycisków mobilnych"
                checked={draft.hapticFeedback}
                onChange={(v) => update({ hapticFeedback: v })}
            />
        </SettingsCard>
    );
}
