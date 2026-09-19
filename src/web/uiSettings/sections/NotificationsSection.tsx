import { useState } from "react";
import { Button } from "@design";
import type { UiSettings } from "../../uiSettingsCore";
import { SettingsCard } from "@web/settings/controls.tsx";
import PushNotificationsSection from "../PushNotificationsSection";

interface NotificationsSectionProps {
    draft: UiSettings;
    update: (patch: Partial<UiSettings>) => void;
    onEnableNotifications: () => void;
}

function notificationsGranted() {
    return typeof Notification !== "undefined" && Notification.permission === "granted";
}

/** Interfejs > Dzwiek i powiadomienia. Migrated (UI_MIGRATION.md §4). */
function NotificationsSection({ draft, update, onEnableNotifications }: NotificationsSectionProps) {
    const [notifGranted, setNotifGranted] = useState(notificationsGranted);

    return (
        <SettingsCard title="Powiadomienia">
            {!notifGranted && (
                <Button
                    className="settings-action"
                    variant="solid"
                    id="ui-enable-notifications"
                    onClick={() => { onEnableNotifications(); setNotifGranted(notificationsGranted()); }}
                >
                    Włącz powiadomienia
                </Button>
            )}
            <PushNotificationsSection draft={draft} update={update} />
        </SettingsCard>
    );
}

export default NotificationsSection;
