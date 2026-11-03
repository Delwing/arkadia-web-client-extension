/**
 * Getting the browser to keep the client's data for good ("persistent
 * storage"), where it has not agreed to yet.
 *
 * Every browser decides differently, and none lets a page simply switch it on:
 * Chromium grants it silently from signals (the app installed, the page
 * bookmarked, notifications allowed), Firefox asks the player, Safari keeps
 * the data of an app added to the Dock or the home screen. So the client asks
 * once more (`requestPersistence`) and tells the player what their browser
 * wants (`persistenceGuide`).
 */

export type BrowserKind = "firefox" | "edge" | "opera" | "chrome" | "safari" | "other";

/** The browser, from its user agent: only to pick which steps to show. */
export function detectBrowser(userAgent: string): BrowserKind {
    if (/Firefox\//.test(userAgent)) return "firefox";
    if (/Edg\//.test(userAgent)) return "edge";
    if (/OPR\//.test(userAgent)) return "opera";
    if (/Chrome\/|CriOS\//.test(userAgent)) return "chrome";
    if (/Safari\//.test(userAgent)) return "safari";
    return "other";
}

export interface PersistenceGuide {
    /** The browser's name, as the player knows it. */
    browser: string;
    steps: string[];
}

const CHROMIUM_STEPS = (install: string) => [
    `Zainstaluj klienta jako aplikację: ${install}. To najpewniejszy sposób.`,
    "Albo dodaj tę stronę do zakładek (Ctrl+D) albo zezwól jej na powiadomienia.",
    "Potem kliknij „Poproś o trwałą pamięć”. Przeglądarka nie pyta: sama decyduje, czy się zgodzić.",
];

export function persistenceGuide(kind: BrowserKind): PersistenceGuide {
    switch (kind) {
        case "firefox":
            return {
                browser: "Firefox",
                steps: [
                    "Kliknij „Poproś o trwałą pamięć” i w okienku pod paskiem adresu wybierz „Zezwól”.",
                    "Jeśli wcześniej wybrano „Nie zezwalaj”: kliknij kłódkę w pasku adresu → Uprawnienia → „Przechowywanie danych w trwałej pamięci” i usuń blokadę, a potem kliknij przycisk jeszcze raz.",
                ],
            };
        case "edge":
            return { browser: "Edge", steps: CHROMIUM_STEPS("menu ⋯ → Aplikacje → Zainstaluj tę witrynę jako aplikację") };
        case "opera":
            return { browser: "Opera", steps: CHROMIUM_STEPS("ikona instalacji w pasku adresu, jeśli jest widoczna") };
        case "chrome":
            return { browser: "Chrome", steps: CHROMIUM_STEPS("ikona instalacji po prawej stronie paska adresu albo menu ⋮ → Przesyłaj, zapisuj i udostępniaj → Zainstaluj stronę jako aplikację") };
        case "safari":
            return {
                browser: "Safari",
                steps: [
                    "Dodaj klienta do Docka (Plik → Dodaj do Docka) albo, na iPhonie i iPadzie, do ekranu początkowego (Udostępnij → Do ekranu początkowego) i graj z tej ikony.",
                    "Potem kliknij „Poproś o trwałą pamięć”.",
                ],
            };
        default:
            return {
                browser: "ta przeglądarka",
                steps: [
                    "Kliknij „Poproś o trwałą pamięć”. Jeśli przeglądarka odmówi, zainstaluj klienta jako aplikację albo dodaj stronę do zakładek i spróbuj ponownie.",
                ],
            };
    }
}

/** Asks the browser to keep the data; true when it now does. */
export async function requestPersistence(): Promise<boolean> {
    if (typeof navigator === "undefined" || !navigator.storage?.persist) return false;
    try {
        if (await navigator.storage.persisted?.()) return true;
        return await navigator.storage.persist();
    } catch {
        return false;
    }
}

/** Whether the data is kept for good; null where the browser cannot tell. */
export async function isPersisted(): Promise<boolean | null> {
    if (typeof navigator === "undefined" || !navigator.storage?.persisted) return null;
    try {
        return await navigator.storage.persisted();
    } catch {
        return null;
    }
}
