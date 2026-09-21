import { useCallback, useState, type ReactNode } from "react";
import LocalExportTab from "./LocalExportTab";
import GoogleDriveTab from "./GoogleDriveTab";
import FirebaseTab from "./FirebaseTab";
import DeviceManagementTab from "./DeviceManagementTab";
import { collectCharacters, DEFAULT_EXPORT_OPTIONS, type ExportOptions } from "./exportUtils";

type DataPageKey = "data-sync" | "data-backup" | "data-devices";

/**
 * The "Dane" pages of the settings dialog: sync, backup and devices, which used
 * to be the tabs of the separate "Eksport i import" window. Google Drive backs
 * up the same selection the file export shows, so that state lives here.
 */
export function useDataPages(): { pages: Record<DataPageKey, ReactNode> } {
    const [selectedCharacters, setSelectedCharacters] = useState<string[]>(() => collectCharacters());
    const [exportOptions, setExportOptions] = useState<ExportOptions>({ ...DEFAULT_EXPORT_OPTIONS });

    const handleSelectionChange = useCallback((characters: string[], options: ExportOptions) => {
        setSelectedCharacters(characters);
        setExportOptions(options);
    }, []);

    const handleImportComplete = useCallback(() => {
        setSelectedCharacters(collectCharacters());
    }, []);

    return {
        pages: {
            "data-sync": <FirebaseTab onImportComplete={handleImportComplete} />,
            "data-backup": (
                <div className="ui-settings-stack">
                    <LocalExportTab onSelectionChange={handleSelectionChange} />
                    <section className="character-settings-section">
                        <h5 className="character-settings-section-title">Google Drive</h5>
                        <GoogleDriveTab
                            selectedCharacters={selectedCharacters}
                            exportOptions={exportOptions}
                            onImportComplete={handleImportComplete}
                        />
                    </section>
                </div>
            ),
            "data-devices": <DeviceManagementTab />,
        },
    };
}
