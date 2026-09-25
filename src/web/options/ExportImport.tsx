import { useState } from "react";
import LocalExportTab from "./LocalExportTab";
import GoogleDriveTab from "./GoogleDriveTab";
import FirebaseTab from "./FirebaseTab";
import DeviceManagementTab from "./DeviceManagementTab";

type Tab = 'local' | 'google-drive' | 'firebase' | 'devices';

const TABS: { key: Tab; label: string }[] = [
    { key: 'firebase', label: 'Synchronizacja' },
    { key: 'local', label: 'Plik' },
    { key: 'google-drive', label: 'Google Drive' },
    { key: 'devices', label: 'Urzadzenia' },
];

function ExportImport() {
    const [activeTab, setActiveTab] = useState<Tab>('firebase');
    return (
        <div className="export-import">
            {/* Tab navigation */}
            <div className="dialog-tabs export-import__tabs">
                {TABS.map(({ key, label }) => (
                    <button
                        key={key}
                        type="button"
                        className={`dialog-tab${activeTab === key ? " is-active" : ""}`}
                        onClick={() => setActiveTab(key)}
                    >
                        {label}
                    </button>
                ))}
            </div>

            {/* Tab content */}
            <div className="export-import__body">
                {activeTab === 'firebase' && (
                    <FirebaseTab />
                )}
                {activeTab === 'local' && (
                    <div className="export-import__scroll">
                        <LocalExportTab />
                    </div>
                )}
                {activeTab === 'google-drive' && (
                    <div className="export-import__scroll">
                        <GoogleDriveTab />
                    </div>
                )}
                {activeTab === 'devices' && (
                    <div className="export-import__scroll">
                        <DeviceManagementTab />
                    </div>
                )}
            </div>
        </div>
    );
}

export default ExportImport;
