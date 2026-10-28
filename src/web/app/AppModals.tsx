import { useState } from "react";
import { useAppServices } from "./appServices";
import { Island } from "./Island";
import { AppModalShell } from "../modals/AppModalShell";
import SettingsDialog from "../settings/SettingsDialog";
import { SAVE_SETTINGS_EVENT } from "../settings/categories";
import CharacterManagement from "../options/CharacterManagementModal";
import Keys from "../keys/Keys";
import Scripts from "../options/Scripts";
import AutomationWindow from "../automation/AutomationWindow";
import Recordings from "../options/Recordings";
import Places from "../places/Places";
import HelperSettings from "../options/HelperSettings";
import { isHelperSupported } from "../helperDownload";

/**
 * The page-level windows, opened by id through src/web/modals/appModal.ts. Each
 * keeps the ids its content and the tests look for (`#settings-root`,
 * `#binds-options`…). The log viewer's window (#logs-modal) stays in index.html:
 * logBrowserMount.tsx, a separate entry, fills it.
 */
export function AppModals() {
    const { client, helperConnection } = useAppServices();
    // Klawisze portals its keymap toolbar into the header; the slot exists only once rendered.
    const [bindsHeaderSlot, setBindsHeaderSlot] = useState<HTMLDivElement | null>(null);

    return (
        <>
            <AppModalShell
                id="settings-modal"
                title="Ustawienia"
                modalClassName="app-modal--settings"
                dialogClassName="app-modal__dialog--xl app-modal__dialog--fill app-modal__dialog--phone-full"
                bodyClassName="app-modal__body--panel"
                headerActions={
                    <button
                        type="button"
                        className="popup-btn popup-btn--control popup-btn--sm"
                        id="settings-characters-btn"
                        onClick={() => window.dispatchEvent(new Event("show-character-management"))}
                    >
                        Postacie
                    </button>
                }
                footer={
                    <>
                        {/* Shown while something is unsaved (SettingsDialog toggles it); closing keeps the edits for the next opening. */}
                        <button type="button" className="popup-btn popup-btn--control" id="settings-discard" title="Wróć do zapisanych ustawień" hidden>Odrzuć zmiany</button>
                        <button
                            type="button"
                            className="popup-btn popup-btn--control popup-btn--solid"
                            id="settings-save"
                            onClick={() => window.dispatchEvent(new Event(SAVE_SETTINGS_EVENT))}
                        >
                            Zapisz
                        </button>
                    </>
                }
            >
                <div id="settings-root" className="app-modal__panel">
                    <Island name="SettingsDialog">
                        <SettingsDialog soundManager={client.SoundManager} onEnableNotifications={() => client.enableNotifications()} />
                    </Island>
                </div>
            </AppModalShell>

            <AppModalShell id="character-management-modal" title="Zarządzanie postaciami">
                <div id="character-management-root">
                    <Island name="CharacterManagement"><CharacterManagement /></Island>
                </div>
            </AppModalShell>

            {/* Every change in Klawisze is stored at once, so there is no footer. */}
            <AppModalShell
                id="binds-modal"
                title="Klawisze"
                dialogClassName="app-modal__dialog--keys app-modal__dialog--phone-full"
                bodyClassName="app-modal__body--flush"
                headerSlot={{ id: "binds-header-slot", ref: setBindsHeaderSlot }}
            >
                <div id="binds-options">
                    <Island name="Keys">
                        <Keys helperConnection={isHelperSupported() ? helperConnection : null} headerSlot={bindsHeaderSlot} />
                    </Island>
                </div>
            </AppModalShell>

            {/* The panel scrolls its own list under a fixed tab bar and toolbar, so the body itself must not scroll. */}
            <AppModalShell
                id="scripts-modal"
                title="Wtyczki"
                dialogClassName="app-modal__dialog--xl app-modal__dialog--fill"
                bodyClassName="app-modal__body--panel"
            >
                <div id="scripts-options" className="app-modal__panel">
                    <Island name="Scripts"><Scripts /></Island>
                </div>
            </AppModalShell>

            <AppModalShell
                id="automation-modal"
                title="Skrypty"
                dialogClassName="app-modal__dialog--automation app-modal__dialog--phone-full"
                bodyClassName="app-modal__body--flush"
            >
                <div id="automation-options">
                    <Island name="AutomationWindow"><AutomationWindow /></Island>
                </div>
            </AppModalShell>

            <AppModalShell id="recordings-modal" title="Nagrania" dialogClassName="app-modal__dialog--lg">
                <div id="recordings-options">
                    <Island name="Recordings"><Recordings /></Island>
                </div>
            </AppModalShell>

            <AppModalShell
                id="places-modal"
                title="Miejsca"
                dialogClassName="app-modal__dialog--xl app-modal__dialog--phone-full"
                bodyClassName="app-modal__body--flush"
            >
                <div id="places-options">
                    <Island name="Places"><Places /></Island>
                </div>
            </AppModalShell>

            <AppModalShell id="helper-modal" title="Arkadia Helper" bodyClassName="app-modal__body--flush">
                <div id="helper-options">
                    <Island name="HelperSettings"><HelperSettings helperConnection={helperConnection} /></Island>
                </div>
            </AppModalShell>

            <AppModalShell id="location-share-modal" title="Kod QR lokacji" bodyClassName="app-modal__body--center">
                <img id="location-qr-image" alt="QR code" />
            </AppModalShell>
        </>
    );
}
