import { useState } from "react";
import { Button, Field, TextArea } from "@web-ui/primitives/index.ts";
import {
    DEFAULT_FIREBASE_CONFIG,
    type FirebaseUserConfig,
    isDefaultFirebaseConfig,
    loadFirebaseConfig,
    parseFirebaseConfig,
    saveFirebaseConfig,
} from "@modules/firebase";

interface FirebaseProjectSectionProps {
    /** Runs before the switch, e.g. to sign out of the current project. */
    onBeforeSwitch?: () => Promise<void>;
}

const CONFIG_PLACEHOLDER = `const firebaseConfig = {
  apiKey: "...",
  authDomain: "moj-projekt.firebaseapp.com",
  databaseURL: "https://moj-projekt-default-rtdb.europe-west1.firebasedatabase.app",
  projectId: "moj-projekt",
  appId: "1:...:web:..."
};`;

/**
 * Lets the user keep sync data and session handoff in a Firebase project of
 * their own instead of the shared one. Everything holding the old project
 * (auth listeners, sync, handoff) was wired at startup, so a switch reloads.
 */
function FirebaseProjectSection({ onBeforeSwitch }: FirebaseProjectSectionProps) {
    const current = loadFirebaseConfig();
    const isDefault = isDefaultFirebaseConfig(current);
    const [editing, setEditing] = useState(false);
    const [text, setText] = useState(() => (isDefault || !current ? '' : JSON.stringify(current, null, 2)));
    const [error, setError] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);

    const switchTo = async (config: FirebaseUserConfig) => {
        setBusy(true);
        try {
            await onBeforeSwitch?.();
        } catch (err) {
            console.warn('[Firebase] Sign out before project switch failed', err);
        }
        saveFirebaseConfig(config);
        window.location.reload();
    };

    const handleSave = () => {
        const config = parseFirebaseConfig(text);
        if (!config) {
            setError('Nie rozpoznano konfiguracji. Wymagane pola: apiKey, authDomain, projectId, appId.');
            return;
        }
        setError(null);
        void switchTo(config);
    };

    return (
        <section className="character-settings-section firebase-project">
            <h5 className="character-settings-section-title">Projekt Firebase</h5>
            <div className="popup-muted popup-small">
                {isDefault ? (
                    <>Używasz wspólnego projektu klienta (<code>{DEFAULT_FIREBASE_CONFIG.projectId}</code>).</>
                ) : (
                    <>Używasz własnego projektu: <code className="firebase-project__id">{current?.projectId}</code>.</>
                )}
                {' '}Własny projekt trzyma ustawienia i przejęcie sesji (z lokacją) wyłącznie na Twoim koncie
                Firebase. Konfiguracja nie jest synchronizowana — wklej ją na każdym urządzeniu.
            </div>

            {editing ? (
                <div className="popup-stack">
                    <Field
                        label="Konfiguracja aplikacji webowej"
                        htmlFor="firebase-project-config"
                        hint="Wklej obiekt firebaseConfig z konsoli Firebase (Ustawienia projektu → Twoje aplikacje) albo JSON."
                        error={error ?? undefined}
                    >
                        <TextArea
                            id="firebase-project-config"
                            mono
                            rows={8}
                            value={text}
                            placeholder={CONFIG_PLACEHOLDER}
                            onChange={e => { setText(e.target.value); setError(null); }}
                            disabled={busy}
                        />
                    </Field>
                    <div className="popup-row">
                        <Button variant="solid" size="sm" onClick={handleSave} disabled={busy || !text.trim()}>
                            Zapisz i przeładuj
                        </Button>
                        <Button size="sm" onClick={() => { setEditing(false); setError(null); }} disabled={busy}>
                            Anuluj
                        </Button>
                    </div>
                    <div className="popup-muted popup-small">
                        Strona zostanie przeładowana, a Ty wylogowany z obecnego projektu.
                    </div>
                </div>
            ) : (
                <div className="popup-row">
                    <Button size="sm" onClick={() => setEditing(true)} disabled={busy}>
                        {isDefault ? 'Użyj własnego projektu' : 'Zmień konfigurację'}
                    </Button>
                    {!isDefault && (
                        <Button size="sm" onClick={() => void switchTo(DEFAULT_FIREBASE_CONFIG)} disabled={busy}>
                            Przywróć wspólny projekt
                        </Button>
                    )}
                </div>
            )}
        </section>
    );
}

export default FirebaseProjectSection;
