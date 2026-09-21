import { useEffect, useState } from "react";
import type { CustomSound } from "@modules/core/customSounds";
import { Button } from "@web-ui/primitives/index.ts";
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
            <div className="settings-rows">
                <div className="settings-row">
                    <span className="popup-field__label">
                        Domyślny beep<span className="settings-inline-note">{formatBytes(defaultBeepSize)}</span>
                    </span>
                    <Button size="sm" variant="ghost" title="Odtwórz" onClick={() => previewKey('beep')}>{'▶'}</Button>
                </div>
                {customSounds.map(sound => (
                    <div key={sound.key} className="settings-row">
                        <span className="popup-field__label">
                            {sound.name}<span className="settings-inline-note">{formatBytes(calculateBase64Size(sound.data))}</span>
                        </span>
                        <div className="popup-inline">
                            <Button size="sm" variant="ghost" title="Odtwórz" onClick={() => previewKey(sound.key)}>{'▶'}</Button>
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
