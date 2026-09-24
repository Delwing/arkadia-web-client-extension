import { type ReactNode } from "react";
import LocalExportTab from "./LocalExportTab";
import GoogleDriveTab from "./GoogleDriveTab";
import FirebaseTab from "./FirebaseTab";
import DeviceManagementTab from "./DeviceManagementTab";
import ImportPage from "../imports/ImportPage";

type DataPageKey = "data-sync" | "data-backup" | "data-devices" | "data-import";

/**
 * The "Dane" pages of the settings dialog: sync, backup and devices, which used
 * to be the tabs of the separate "Eksport i import" window. A backup always
 * contains all data, to a file or to Google Drive.
 */
export function useDataPages(): { pages: Record<DataPageKey, ReactNode> } {
    return {
        pages: {
            "data-sync": <FirebaseTab />,
            "data-backup": (
                <div className="ui-settings-stack">
                    <LocalExportTab />
                    <section className="character-settings-section">
                        <h5 className="character-settings-section-title">Google Drive</h5>
                        <GoogleDriveTab />
                    </section>
                </div>
            ),
            "data-devices": <DeviceManagementTab />,
            "data-import": <ImportPage />,
        },
    };
}
