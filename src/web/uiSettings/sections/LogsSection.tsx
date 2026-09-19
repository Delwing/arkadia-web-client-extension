import { useEffect, useState } from "react";
import { globalStorage } from "@modules/core/storage";
import { disableFileSave, enableFileSave, getDirectoryName, isFileSaveActive, isFileSaveSupported, onStatusChange } from "../../logFileSaver";
import { CheckboxRow, SettingsSection } from "../fields";

/**
 * Session-log recording. Unlike the rest of the page these apply on click, not
 * on save: picking the disk folder needs the click's user activation, and the
 * logger reads `loggingEnabled` live.
 */
export default function LogsSection() {
    const [loggingEnabled, setLoggingEnabled] = useState(() => globalStorage.get("loggingEnabled") !== false);
    const [fileSaveEnabled, setFileSaveEnabled] = useState(isFileSaveActive());
    const [fileSaveDirName, setFileSaveDirName] = useState(getDirectoryName());

    useEffect(() => {
        const offLogging = globalStorage.onChange("loggingEnabled", (value) => setLoggingEnabled(value !== false));
        const offFileSave = onStatusChange((active, dirName) => {
            setFileSaveEnabled(active);
            setFileSaveDirName(dirName);
        });
        return () => {
            offLogging();
            offFileSave();
        };
    }, []);

    const onLoggingChange = (enabled: boolean) => {
        setLoggingEnabled(enabled);
        globalStorage.set("loggingEnabled", enabled);
    };

    const onFileSaveChange = async (enabled: boolean) => {
        if (enabled) {
            const result = await enableFileSave();
            if (result) {
                setFileSaveEnabled(true);
                setFileSaveDirName(result.dirName);
            }
        } else {
            disableFileSave();
            setFileSaveEnabled(false);
            setFileSaveDirName(null);
        }
    };

    return (
        <SettingsSection title="Logi">
            <CheckboxRow id="logs-enabled" label="Zapisuj logi" checked={loggingEnabled} onChange={onLoggingChange} />
            {isFileSaveSupported() && (
                <>
                    <CheckboxRow id="logs-file-save" label="Zapisuj na dysk" checked={fileSaveEnabled} onChange={(v) => void onFileSaveChange(v)} />
                    {fileSaveEnabled && fileSaveDirName && (
                        <span className="text-muted small">{"📂"} {fileSaveDirName}</span>
                    )}
                </>
            )}
            <span className="text-muted small">Zmiany działają od razu.</span>
        </SettingsSection>
    );
}
