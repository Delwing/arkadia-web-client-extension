import { useEffect, useState } from "react";
import { Modal } from "react-bootstrap";
import type { CustomSound } from "@modules/core/customSounds";
import { calculateBase64Size, formatBytes } from "../uiSettingsCore";

interface ManageSoundsModalProps {
    show: boolean;
    onHide: () => void;
    customSounds: CustomSound[];
    onDelete: (sound: CustomSound) => void;
    previewKey: (key: string) => void;
}

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

    return (
        <Modal show={show} onHide={onHide} scrollable>
            <Modal.Header closeButton>
                <Modal.Title>Zarządzaj dźwiękami</Modal.Title>
            </Modal.Header>
            <Modal.Body>
                <div className="d-flex flex-column gap-2">
                    <div className="d-flex align-items-center justify-content-between p-2 border rounded">
                        <div className="d-flex flex-column">
                            <span className="fw-semibold">Domyślny beep</span>
                            <span className="text-muted small">{formatBytes(defaultBeepSize)}</span>
                        </div>
                        <div className="d-flex gap-2">
                            <button className="btn btn-primary btn-sm" onClick={() => previewKey('beep')}>{'▶'}</button>
                        </div>
                    </div>
                    {customSounds.map(sound => (
                        <div key={sound.key} className="d-flex align-items-center justify-content-between p-2 border rounded">
                            <div className="d-flex flex-column">
                                <span className="fw-semibold">{sound.name}</span>
                                <span className="text-muted small">{formatBytes(calculateBase64Size(sound.data))}</span>
                            </div>
                            <div className="d-flex gap-2">
                                <button className="btn btn-primary btn-sm" onClick={() => previewKey(sound.key)}>{'▶'}</button>
                                <button
                                    className="btn btn-danger btn-sm"
                                    onClick={() => {
                                        if (confirm(`Czy na pewno chcesz usunąć dźwięk "${sound.name}"?`)) {
                                            onDelete(sound);
                                        }
                                    }}
                                >
                                    Usuń
                                </button>
                            </div>
                        </div>
                    ))}
                </div>
            </Modal.Body>
        </Modal>
    );
}

export default ManageSoundsModal;
