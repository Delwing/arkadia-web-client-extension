import { useEffect, useState } from "react";
import { Button, Notice } from "@web-ui/primitives/index.ts";
import { detectBrowser, isPersisted, persistenceGuide, requestPersistence } from "./persistence";

/**
 * Shown where logs are managed while the browser has not agreed to keep the
 * data for good: what that risks, how this browser grants it, and a button to
 * ask again. Renders nothing once it is granted (or where it cannot be told).
 */
export function PersistenceNotice({ onChange }: { onChange?: (persisted: boolean) => void }) {
    const [persisted, setPersisted] = useState<boolean | null>(null);
    const [asking, setAsking] = useState(false);
    const [refused, setRefused] = useState(false);
    const [stepsOpen, setStepsOpen] = useState(false);

    useEffect(() => {
        let cancelled = false;
        void isPersisted().then((value) => {
            if (!cancelled) setPersisted(value);
        });
        return () => {
            cancelled = true;
        };
    }, []);

    if (persisted !== false) return null;

    const guide = persistenceGuide(detectBrowser(navigator.userAgent));
    const ask = async () => {
        setAsking(true);
        const granted = await requestPersistence();
        setAsking(false);
        setRefused(!granted);
        if (granted) {
            setPersisted(true);
            onChange?.(true);
        } else {
            setStepsOpen(true);
        }
    };

    return (
        <Notice variant="warning" className="persistence-notice">
            <p className="persistence-notice__text">
                <strong>Pamięć nietrwała.</strong> Gdy zabraknie miejsca na dysku, przeglądarka może usunąć dane klienta,
                łącznie z logami. Pobierz ważne logi albo poproś o trwałą pamięć.
            </p>
            <div className="persistence-notice__actions">
                <Button size="sm" variant="solid" id="persistence-request" disabled={asking} onClick={() => void ask()}>
                    {asking ? "Pytanie..." : "Poproś o trwałą pamięć"}
                </Button>
                <button type="button" className="persistence-notice__toggle" onClick={() => setStepsOpen((open) => !open)}>
                    {stepsOpen ? "Ukryj wskazówki" : `Jak to włączyć w: ${guide.browser}`}
                </button>
            </div>
            {refused ? (
                <p className="persistence-notice__text persistence-notice__refused">
                    Przeglądarka się nie zgodziła. Wykonaj kroki poniżej i spróbuj ponownie.
                </p>
            ) : null}
            {stepsOpen ? (
                <ol className="persistence-notice__steps">
                    {guide.steps.map((step) => (
                        <li key={step}>{step}</li>
                    ))}
                </ol>
            ) : null}
        </Notice>
    );
}
