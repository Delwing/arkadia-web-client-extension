import { useEffect, useState } from "react";
import { Button } from "@design";
import type { CustomSound } from "@modules/core/customSounds";
import SubDialog from "../SubDialog";
import { calculateBase64Size, formatBytes } from "../uiSettingsCore";

interface ManageSoundsModalProps {
    show: boolean;
    onHide: () => void;
    customSounds: CustomSound[];
    onDelete: (sound: CustomSound) => void;
    previewKey: (key: string) => void;
}

/**
 * Opened from the sound page of `#settings-modal`, so it uses the shared
 * inline `SubDialog` rather than a portaled react-bootstrap `<Modal>` — see
 * `@web/SubDialog` for why.
 *
 * The list inside is migrated onto the design system with the rest of the
 * Dzwiek page; `SubDialog`'s own chrome is not. That shell is Bootstrap and is
 * shared with `#scripts-modal`, `#binds-modal` and `#export-import-modal`, so
 * it moves with the other declarative modals in Phase 5 — the same split PR 1
 * made between `SettingsDialog`'s body and `#settings-modal`'s chrome.
 */
function ManageSoundsModal({ show, onHide, customSounds, onDelete, previewKey }: ManageSoundsModalProps) {
    const [defaultBeepSize, setDefaultBeepSize] = useState(0);

    useEffect(() => {
        if (!show) return;
        let cancelled = false;
        import('../../client/sounds')
            .then(({ beepSound }) => {
                if (!cancelled) setDefaultBeepSize(calculateBase64Size(beepSound));
            })
            .catch(error => console.error('Failed to load default beep sound', error));
        return () => { cancelled = true; };
    }, [show]);

    if (!show) return null;

    return (
        <SubDialog title="Zarządzaj dźwiękami" onClose={onHide}>
            <div className="settings-stack">
                <div className="settings-sound-row">
                    <div className="settings-sound-row__titles">
                        <span className="settings-sound-row__name">Domyślny beep</span>
                        <span className="settings-sound-row__size">{formatBytes(defaultBeepSize)}</span>
                    </div>
                    <div className="settings-button-row">
                        <Button size="sm" title="Odtwórz" onClick={() => previewKey('beep')}>{'\u25b6'}</Button>
                    </div>
                </div>
                {customSounds.map(sound => (
                    <div key={sound.key} className="settings-sound-row">
                        <div className="settings-sound-row__titles">
                            <span className="settings-sound-row__name">{sound.name}</span>
                            <span className="settings-sound-row__size">{formatBytes(calculateBase64Size(sound.data))}</span>
                        </div>
                        <div className="settings-button-row">
                            <Button size="sm" title="Odtwórz" onClick={() => previewKey(sound.key)}>{'\u25b6'}</Button>
                            <Button
                                size="sm"
                                variant="danger"
                                onClick={() => {
                                    if (confirm(`Czy na pewno chcesz usunąć dźwięk "${sound.name}"?`)) {
                                        onDelete(sound);
                                    }
                                }}
                            >
                                Usuń
                            </Button>
                        </div>
                    </div>
                ))}
            </div>
        </SubDialog>
    );
}

export default ManageSoundsModal;
