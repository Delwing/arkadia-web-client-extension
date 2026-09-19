import type { UiSettings } from "../../uiSettingsCore";
import { CheckboxField, SettingsCard } from "@web/settings/controls.tsx";

interface OtherSectionProps {
    draft: UiSettings;
    update: (patch: Partial<UiSettings>) => void;
}

/**
 * Interfejs > Inne, the "Inne" card. Migrated onto the design system
 * (UI_MIGRATION.md §4); it used to share OtherSections.tsx with
 * MobileButtonsSection, which belongs to a tab that has not moved yet.
 */
export default function OtherSection({ draft, update }: OtherSectionProps) {
    return (
        <SettingsCard title="Inne">
            <CheckboxField id="ui-fight-title-icon" label="Ikona walki w tytule" checked={draft.fightTitleIcon} onChange={(v) => update({ fightTitleIcon: v })} />
            <CheckboxField id="ui-wake-lock" label="Blokada usypiania ekranu (Wake Lock)" checked={draft.wakeLock} onChange={(v) => update({ wakeLock: v })} />
        </SettingsCard>
    );
}
