import { useState } from "react";
import type { UiSettings } from "../../uiSettingsCore";
import { Button } from "@web-ui/primitives/index.ts";
import { SettingsSection } from "../fields";
import PushNotificationsSection from "../PushNotificationsSection";

interface NotificationsSectionProps {
    draft: UiSettings;
    update: (patch: Partial<UiSettings>) => void;
    onEnableNotifications: () => void;
}

function notificationsGranted() {
    return typeof Notification !== "undefined" && Notification.permission === "granted";
}

function NotificationsSection({ draft, update, onEnableNotifications }: NotificationsSectionProps) {
    const [notifGranted, setNotifGranted] = useState(notificationsGranted);

    return (
        <SettingsSection title="Powiadomienia">
            {!notifGranted && (
                <Button
                    variant="solid"
                    className="ui-settings-self-start"
                    id="ui-enable-notifications"
                    onClick={() => { onEnableNotifications(); setNotifGranted(notificationsGranted()); }}
                >
                    Włącz powiadomienia
                </Button>
            )}
            <PushNotificationsSection draft={draft} update={update} />
        </SettingsSection>
    );
}

export default NotificationsSection;
