import { useState } from "react";
import type { UiSettings } from "../../uiSettingsCore";
import { Button, Field, Segmented } from "@web-ui/primitives/index.ts";
import { CheckboxRow, SelectField, SettingsSection } from "../fields";
import PushNotificationsSection from "../PushNotificationsSection";
import { TOAST_POSITIONS, TOAST_SOURCES } from "@web/notifications/toastSettings.ts";
import type { ToastPosition } from "@shared/uiSettingsTypes.ts";

interface NotificationsSectionProps {
    draft: UiSettings;
    update: (patch: Partial<UiSettings>) => void;
    onEnableNotifications: () => void;
}

const DURATION_SCALES = [0.5, 1, 1.5, 2, 3];
const MAX_VISIBLE = [1, 2, 3, 4, 6, 8];

function notificationsGranted() {
    return typeof Notification !== "undefined" && Notification.permission === "granted";
}

function NotificationsSection({ draft, update, onEnableNotifications }: NotificationsSectionProps) {
    const [notifGranted, setNotifGranted] = useState(notificationsGranted);
    const muted = draft.toastMutedSources ?? [];

    return (
        <>
            <SettingsSection title="Powiadomienia w grze">
                <Field label="Pozycja">
                    <Segmented<ToastPosition>
                        name="ui-toast-position"
                        value={draft.toastPosition}
                        options={TOAST_POSITIONS}
                        onChange={(v) => update({ toastPosition: v })}
                    />
                </Field>
                <SelectField id="ui-toast-duration" label="Czas wyświetlania" value={String(draft.toastDurationScale)} onChange={(v) => update({ toastDurationScale: Number(v) })}>
                    {DURATION_SCALES.map(s => <option key={s} value={String(s)}>×{String(s).replace('.', ',')}</option>)}
                </SelectField>
                <SelectField id="ui-toast-max-visible" label="Najwięcej naraz" value={String(draft.toastMaxVisible)} onChange={(v) => update({ toastMaxVisible: Number(v) })}>
                    {MAX_VISIBLE.map(n => <option key={n} value={String(n)}>{n}</option>)}
                </SelectField>
                <Field label="Pokazuj powiadomienia z">
                    <div className="ui-settings-stack">
                        {TOAST_SOURCES.map(source => (
                            <CheckboxRow
                                key={source.value}
                                id={`ui-toast-source-${source.value}`}
                                label={source.label}
                                checked={!muted.includes(source.value)}
                                onChange={(on) => update({
                                    toastMutedSources: on
                                        ? muted.filter(s => s !== source.value)
                                        : [...muted, source.value],
                                })}
                            />
                        ))}
                    </div>
                </Field>
                <CheckboxRow
                    id="ui-toast-dnd"
                    label="Nie przeszkadzać"
                    hint="Pokazują się tylko ostrzeżenia i błędy."
                    checked={draft.toastDoNotDisturb}
                    onChange={(v) => update({ toastDoNotDisturb: v })}
                />
            </SettingsSection>
            <SettingsSection title="Powiadomienia systemowe">
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
        </>
    );
}

export default NotificationsSection;
