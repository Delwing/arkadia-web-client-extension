import { useEffect, useState } from "react";
import { globalStorage } from "@modules/core/storage";
import { disableFileSave, enableFileSave, getDirectoryName, isFileSaveActive, isFileSaveSupported, onStatusChange } from "../../logFileSaver";
import { CheckboxField, SettingsCard, SettingsHint } from "@web/settings/controls.tsx";

/**
 * Session-log recording. Unlike the rest of the page these apply on click, not
 * on save: picking the disk folder needs the click's user activation, and the
 * logger reads `loggingEnabled` live.
 *
 * Migrated onto the design system (UI_MIGRATION.md §4) together with the rest
 * of Interfejs > Inne.
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
        <SettingsCard title="Logi">
            <CheckboxField id="logs-enabled" label="Zapisuj logi" checked={loggingEnabled} onChange={onLoggingChange} />
            {isFileSaveSupported() && (
                <>
                    <CheckboxField id="logs-file-save" label="Zapisuj na dysk" checked={fileSaveEnabled} onChange={(v) => void onFileSaveChange(v)} />
                    {fileSaveEnabled && fileSaveDirName && (
                        <SettingsHint>{"📂"} {fileSaveDirName}</SettingsHint>
                    )}
                </>
            )}
            <SettingsHint>Zmiany działają od razu.</SettingsHint>
        </SettingsCard>
    );
}
