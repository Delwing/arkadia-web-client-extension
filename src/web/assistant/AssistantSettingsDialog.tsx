import { useState } from 'react';
import SubDialog from '@web/SubDialog.tsx';
import {
    DEFAULT_BYOK_BASE_URL,
    DEFAULT_BYOK_MODEL,
    DEFAULT_WORKER_URL,
    getAssistantApiKey,
    getByokBaseUrl,
    getByokModel,
    getPreferByok,
    getWorkerUrl,
    setAssistantApiKey,
    setByokBaseUrl,
    setByokModel,
    setPreferByok,
    setWorkerUrl,
} from './assistantKeyStore';

/**
 * Assistant settings, rendered inside the panel itself.
 *
 * It lives here rather than in the settings modal on purpose: a settings-modal
 * home would need a `ModalKey` in forge's `MenuModalHost` *and* a `#…-modal`
 * shell in `index.html` — two hosts, two edits, no benefit — while the panel
 * already exists in both UIs through the popup catalog.
 *
 * `SubDialog`, never a react-bootstrap `<Modal>`: a portaled modal inside a
 * panel makes two focus managers fight over the node and pegs the CPU (see the
 * header comment on SubDialog, and commit bce4a890).
 */
export interface AssistantSettingsDialogProps {
    onClose: () => void;
}

export default function AssistantSettingsDialog({ onClose }: AssistantSettingsDialogProps) {
    const [workerUrl, setWorkerUrlState] = useState(() => getWorkerUrl());
    const [apiKey, setApiKeyState] = useState(() => getAssistantApiKey() ?? '');
    const [baseUrl, setBaseUrlState] = useState(() => getByokBaseUrl());
    const [model, setModelState] = useState(() => getByokModel());
    const [preferByok, setPreferByokState] = useState(() => getPreferByok());
    const [saved, setSaved] = useState(false);

    const handleSave = () => {
        setWorkerUrl(workerUrl.trim() === DEFAULT_WORKER_URL ? null : workerUrl);
        setAssistantApiKey(apiKey.trim() === '' ? null : apiKey);
        setByokBaseUrl(baseUrl.trim() === DEFAULT_BYOK_BASE_URL ? null : baseUrl);
        setByokModel(model.trim() === DEFAULT_BYOK_MODEL ? null : model);
        setPreferByok(preferByok && apiKey.trim() !== '');
        setSaved(true);
        setTimeout(onClose, 400);
    };

    return (
        <SubDialog
            title="Ustawienia asystenta"
            onClose={onClose}
            size="lg"
            footer={(
                <>
                    <button type="button" className="btn btn-secondary" onClick={onClose}>Anuluj</button>
                    <button type="button" className="btn btn-primary" onClick={handleSave}>
                        {saved ? 'Zapisano' : 'Zapisz'}
                    </button>
                </>
            )}
        >
            <div className="assistant-settings">
                <label className="assistant-settings__field">
                    <span>Adres serwera asystenta</span>
                    <input
                        type="text"
                        className="form-control"
                        value={workerUrl}
                        placeholder={DEFAULT_WORKER_URL || 'https://…workers.dev'}
                        onChange={event => setWorkerUrlState(event.target.value)}
                    />
                    <small>
                        Wspolny serwer z pula kluczy. Do testow lokalnych: <code>http://localhost:8787</code>
                        {' '}(<code>cd worker &amp;&amp; yarn dev</code>). Puste pole wylacza ta droge.
                    </small>
                </label>

                <hr />

                <div className="assistant-settings__section-title">Wlasny klucz API (opcjonalnie)</div>
                <p className="assistant-settings__note">
                    Klucz jest zapisywany wylacznie na tym urzadzeniu i <strong>nigdy</strong> nie
                    trafia do synchronizacji w chmurze ani do eksportu ustawien. Uzywamy go dopiero
                    wtedy, gdy wspolna pula kluczy jest wyczerpana - albo zawsze, jesli zaznaczysz
                    opcje ponizej.
                </p>

                <label className="assistant-settings__field">
                    <span>Klucz API</span>
                    <input
                        type="password"
                        className="form-control"
                        value={apiKey}
                        autoComplete="off"
                        placeholder="np. klucz z Google AI Studio"
                        onChange={event => setApiKeyState(event.target.value)}
                    />
                </label>

                <label className="assistant-settings__field">
                    <span>Adres API (zgodne z OpenAI)</span>
                    <input
                        type="text"
                        className="form-control"
                        value={baseUrl}
                        placeholder={DEFAULT_BYOK_BASE_URL}
                        onChange={event => setBaseUrlState(event.target.value)}
                    />
                </label>

                <label className="assistant-settings__field">
                    <span>Model</span>
                    <input
                        type="text"
                        className="form-control"
                        value={model}
                        placeholder={DEFAULT_BYOK_MODEL}
                        onChange={event => setModelState(event.target.value)}
                    />
                </label>

                <label className="assistant-settings__check">
                    <input
                        type="checkbox"
                        checked={preferByok}
                        disabled={apiKey.trim() === ''}
                        onChange={event => setPreferByokState(event.target.checked)}
                    />
                    <span>Zawsze uzywaj mojego klucza (pomijaj wspolna pule)</span>
                </label>
            </div>
        </SubDialog>
    );
}
