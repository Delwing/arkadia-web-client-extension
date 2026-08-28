import {Button, Form, Modal} from 'react-bootstrap';

export interface ProxySettingsModalProps {
    show: boolean;
    onClose: () => void;
    /** Current user-defined proxy URL ('' = use the default proxy). */
    url: string;
    /** Called as the field changes. */
    onUrlChange: (url: string) => void;
    /** Default proxy URL shown as the placeholder. */
    defaultProxy: string;
    /** Open the "host your own proxy" guide. */
    onHostYourOwn: () => void;
}

/**
 * Small proxy-settings modal: paste/reuse an existing proxy URL, or jump to the
 * self-hosting guide. Decoupled — persisting the URL is the caller's job (onUrlChange).
 */
export function ProxySettingsModal({show, onClose, url, onUrlChange, defaultProxy, onHostYourOwn}: ProxySettingsModalProps) {
    return (
        <Modal show={show} onHide={onClose} centered>
            <Modal.Header closeButton>
                <Modal.Title>Ustawienia proxy</Modal.Title>
            </Modal.Header>
            <Modal.Body>
                <Form.Group>
                    <Form.Label>Adres proxy</Form.Label>
                    <Form.Control
                        type="text"
                        value={url}
                        onChange={e => onUrlChange(e.target.value)}
                        placeholder={defaultProxy}
                        spellCheck={false}
                        autoComplete="off"
                    />
                    <Form.Text className="text-muted">
                        Wklej adres istniejącego proxy lub zostaw puste, aby użyć domyślnego.
                    </Form.Text>
                </Form.Group>
                <hr/>
                <div className="d-flex align-items-center justify-content-between gap-3">
                    <span className="text-muted small">Nie masz proxy? Uruchom własne na Cloudflare.</span>
                    <Button variant="outline-primary" size="sm" onClick={onHostYourOwn}>
                        Uruchom własne proxy
                    </Button>
                </div>
            </Modal.Body>
            <Modal.Footer>
                <Button variant="secondary" onClick={onClose}>Zamknij</Button>
            </Modal.Footer>
        </Modal>
    );
}
