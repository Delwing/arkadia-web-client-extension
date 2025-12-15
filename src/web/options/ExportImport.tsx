import { useCallback, useState } from "react";
import { Button } from "react-bootstrap";
import LocalExportTab from "./LocalExportTab";
import GoogleDriveTab from "./GoogleDriveTab";
import FirebaseTab from "./FirebaseTab";
import { collectCharacters, DEFAULT_EXPORT_OPTIONS, type ExportOptions } from "./exportUtils";

type Tab = 'local' | 'google-drive' | 'firebase';

function ExportImport() {
    const [activeTab, setActiveTab] = useState<Tab>('firebase');
    const [selectedCharacters, setSelectedCharacters] = useState<string[]>(() => collectCharacters());
    const [exportOptions, setExportOptions] = useState<ExportOptions>({ ...DEFAULT_EXPORT_OPTIONS });

    const handleSelectionChange = useCallback((characters: string[], options: ExportOptions) => {
        setSelectedCharacters(characters);
        setExportOptions(options);
    }, []);

    const handleImportComplete = useCallback(() => {
        // Refresh characters after import
        setSelectedCharacters(collectCharacters());
    }, []);

    return (
        <div className="d-flex flex-column h-100" style={{ minHeight: 0 }}>
            {/* Tab navigation */}
            <div className="d-flex gap-2 mb-3 flex-wrap flex-shrink-0">
                <Button
                    size="sm"
                    variant={activeTab === 'firebase' ? 'primary' : 'secondary'}
                    onClick={() => setActiveTab('firebase')}
                >
                    Synchronizacja konfiguracji
                </Button>
                <Button
                    size="sm"
                    variant={activeTab === 'local' ? 'primary' : 'secondary'}
                    onClick={() => setActiveTab('local')}
                >
                    Plik
                </Button>
                <Button
                    size="sm"
                    variant={activeTab === 'google-drive' ? 'primary' : 'secondary'}
                    onClick={() => setActiveTab('google-drive')}
                >
                    Google Drive
                </Button>
            </div>

            {/* Tab content */}
            <div className="flex-grow-1 overflow-hidden" style={{ minHeight: 0 }}>
                {activeTab === 'firebase' && (
                    <FirebaseTab
                        onImportComplete={handleImportComplete}
                    />
                )}
                {activeTab === 'local' && (
                    <div className="h-100 overflow-auto" style={{ minHeight: 0 }}>
                        <LocalExportTab onSelectionChange={handleSelectionChange} />
                    </div>
                )}
                {activeTab === 'google-drive' && (
                    <div className="h-100 overflow-auto" style={{ minHeight: 0 }}>
                        <GoogleDriveTab
                            selectedCharacters={selectedCharacters}
                            exportOptions={exportOptions}
                            onImportComplete={handleImportComplete}
                        />
                    </div>
                )}
            </div>
        </div>
    );
}

export default ExportImport;
