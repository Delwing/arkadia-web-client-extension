import Client from "../Client";
import {AnsiAwareBuffer} from "@client/ansi/FormatState.ts";
import {createColorFormat} from "@modules/core/Colors.ts";
import {characterStorage} from "@modules/core/storage";
import {defaultSettings} from "@modules/core/defaultSettings";

type Domain = "Empire" | "Ishtar";
type SunEventType = "sunrise" | "sunset";

interface PendingSunEvent {
    domain: Domain;
    type: SunEventType;
    dayOfYear: number;
    observedHour: number;
    timestamp: number;
}

export interface ConfirmedSunEvent {
    id?: string;
    domain: Domain;
    type: SunEventType;
    dayOfYear: number;
    observedHour: number;
    confirmedAt: number;
}

interface MonthDef {
    sunrise: number;
    sunset: number;
    length: number;
}

const MONTHS: Record<string, MonthDef> = {
    Hexenstag:    { sunrise: 8, sunset: 17, length: 1 },
    Nachhexen:    { sunrise: 8, sunset: 17, length: 32 },
    Jahrdrung:    { sunrise: 7, sunset: 18, length: 33 },
    Mitterfruhl:  { sunrise: 7, sunset: 18, length: 1 },
    Pflugzeit:    { sunrise: 6, sunset: 19, length: 33 },
    Sigmarszeit:  { sunrise: 5, sunset: 20, length: 33 },
    Sommerzeit:   { sunrise: 5, sunset: 21, length: 33 },
    Sonnenstill:  { sunrise: 5, sunset: 22, length: 1 },
    Vorgeheim:    { sunrise: 4, sunset: 22, length: 33 },
    Geheimnistag: { sunrise: 5, sunset: 21, length: 1 },
    Nachgeheim:   { sunrise: 5, sunset: 21, length: 32 },
    Erntezeit:    { sunrise: 5, sunset: 20, length: 33 },
    Mitterherbst: { sunrise: 5, sunset: 20, length: 1 },
    Brauzeit:     { sunrise: 6, sunset: 19, length: 33 },
    Kaltezeit:    { sunrise: 6, sunset: 18, length: 33 },
    Ulrichszeit:  { sunrise: 7, sunset: 17, length: 33 },
    Mondstill:    { sunrise: 8, sunset: 16, length: 1 },
    Vorhexen:     { sunrise: 8, sunset: 16, length: 33 },
    Yule:     { sunrise: 8, sunset: 16, length: 45 },
    Imbaelk:  { sunrise: 7, sunset: 18, length: 45 },
    Birke:    { sunrise: 6, sunset: 19, length: 45 },
    Blathe:   { sunrise: 5, sunset: 21, length: 45 },
    Feainn:   { sunrise: 4, sunset: 20, length: 45 },
    Lammas:   { sunrise: 5, sunset: 20, length: 45 },
    Velen:    { sunrise: 7, sunset: 18, length: 45 },
    Saovine:  { sunrise: 6, sunset: 17, length: 45 },
};

export const MONTHS_ORDER: Record<Domain, string[]> = {
    Empire: [
        "Hexenstag", "Nachhexen", "Jahrdrung", "Mitterfruhl",
        "Pflugzeit", "Sigmarszeit", "Sommerzeit", "Sonnenstill",
        "Vorgeheim", "Geheimnistag", "Nachgeheim", "Erntezeit",
        "Mitterherbst", "Brauzeit", "Kaltezeit", "Ulrichszeit",
        "Mondstill", "Vorhexen"
    ],
    Ishtar: [
        "Yule", "Imbaelk", "Birke", "Blathe",
        "Feainn", "Lammas", "Velen", "Saovine"
    ]
};

export { MONTHS };

// IndexedDB helpers

const DB_NAME = "arkadia-sun-tracker";
const STORE_NAME = "confirmed-events";

function openDB(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, 1);
        request.onupgradeneeded = () => {
            const db = request.result;
            if (!db.objectStoreNames.contains(STORE_NAME)) {
                const store = db.createObjectStore(STORE_NAME, { keyPath: "id" });
                store.createIndex("domain", "domain", { unique: false });
            }
        };
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}

export async function storeConfirmedEvent(event: ConfirmedSunEvent): Promise<void> {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, "readwrite");
        const id = `${event.domain}_${event.dayOfYear}_${event.type}`;
        tx.objectStore(STORE_NAME).put({ ...event, id });
        tx.oncomplete = () => { db.close(); resolve(); };
        tx.onerror = () => { db.close(); reject(tx.error); };
    });
}

export async function getEventsForDomain(domain: Domain): Promise<ConfirmedSunEvent[]> {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, "readonly");
        const index = tx.objectStore(STORE_NAME).index("domain");
        const request = index.getAll(domain);
        request.onsuccess = () => { db.close(); resolve(request.result); };
        request.onerror = () => { db.close(); reject(request.error); };
    });
}

export async function clearEventsForDomain(domain: Domain): Promise<void> {
    const events = await getEventsForDomain(domain);
    if (events.length === 0) return;
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, "readwrite");
        const store = tx.objectStore(STORE_NAME);
        for (const e of events) {
            if (e.id) store.delete(e.id);
        }
        tx.oncomplete = () => { db.close(); resolve(); };
        tx.onerror = () => { db.close(); reject(tx.error); };
    });
}

export async function deleteEvent(domain: Domain, dayOfYear: number, type: SunEventType): Promise<void> {
    const id = `${domain}_${dayOfYear}_${type}`;
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, "readwrite");
        tx.objectStore(STORE_NAME).delete(id);
        tx.oncomplete = () => { db.close(); resolve(); };
        tx.onerror = () => { db.close(); reject(tx.error); };
    });
}

export async function getAllEvents(): Promise<ConfirmedSunEvent[]> {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, "readonly");
        const request = tx.objectStore(STORE_NAME).getAll();
        request.onsuccess = () => { db.close(); resolve(request.result); };
        request.onerror = () => { db.close(); reject(request.error); };
    });
}

export async function importEvents(events: ConfirmedSunEvent[]): Promise<number> {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, "readwrite");
        const store = tx.objectStore(STORE_NAME);
        let count = 0;
        for (const event of events) {
            const id = event.id ?? `${event.domain}_${event.dayOfYear}_${event.type}`;
            store.put({ ...event, id });
            count++;
        }
        tx.oncomplete = () => { db.close(); resolve(count); };
        tx.onerror = () => { db.close(); reject(tx.error); };
    });
}

// Sun tracker script

const CONFIRM_TIMEOUT = 105_000;
const SUNRISE_COLOR = createColorFormat('#ffd700');
const SUNSET_COLOR = createColorFormat('#6495ed');

export default function initSunTracker(client: Client) {
    let enabled = false;
    let pendingEvent: PendingSunEvent | null = null;
    let pendingTimer: number | null = null;
    function clearPending(): void {
        if (pendingTimer !== null) {
            clearTimeout(pendingTimer);
            pendingTimer = null;
        }
        pendingEvent = null;
    }

    function setPending(domain: Domain, type: SunEventType, dayOfYear: number, observedHour: number): void {
        clearPending();
        pendingEvent = { domain, type, dayOfYear, observedHour, timestamp: Date.now() };
        pendingTimer = window.setTimeout(() => {
            pendingEvent = null;
            pendingTimer = null;
        }, CONFIRM_TIMEOUT);
    }

    async function confirmPending(): Promise<void> {
        if (!pendingEvent) return;
        if (Date.now() - pendingEvent.timestamp > CONFIRM_TIMEOUT) {
            clearPending();
            return;
        }
        await storeConfirmedEvent({
            domain: pendingEvent.domain,
            type: pendingEvent.type,
            dayOfYear: pendingEvent.dayOfYear,
            observedHour: pendingEvent.observedHour,
            // When the event was observed. The two Date.now() calls above are a
            // correlation window between the sun line and the `czas` reply - both
            // endpoints shift together under replay, so the wall clock is right there.
            confirmedAt: client.now(),
        });
        const confirmedDomain = pendingEvent.domain;
        clearPending();
        client.sendEvent("sunTracker.updated", { domain: confirmedDomain });
    }

    function printSunMessage(type: SunEventType): void {
        const isSunrise = type === "sunrise";
        const color = isSunrise ? SUNRISE_COLOR : SUNSET_COLOR;
        const icon = isSunrise ? "\u2600" : "\u263E";
        const label = isSunrise ? "WSCHOD" : "ZACHOD";
        const inner = ` ${icon} ${label}  [czas] `;
        const border = "\u2550".repeat(inner.length + 1);

        const top = new AnsiAwareBuffer(`\u2554${border}\u2557`).colorWords(`\u2554${border}\u2557`, color);
        const mid = new AnsiAwareBuffer(`\u2551${inner}\u2551`).colorWords(`\u2551${inner}\u2551`, color);
        const bot = new AnsiAwareBuffer(`\u255A${border}\u255D`).colorWords(`\u255A${border}\u255D`, color);

        const iconStart = mid.text.indexOf(icon);
        if (iconStart !== -1) {
            mid.color([iconStart, iconStart + icon.length], { ...color, cssClass: "fixed-ch-2" });
        }

        const clickStart = mid.text.indexOf("[czas]");
        if (clickStart !== -1) {
            mid.createLink([clickStart, clickStart + 6], {
                onClick: () => client.sendCommand("czas"),
                title: "Kliknij aby potwierdzic obserwacje",
            });
        }

        client.print(top);
        client.print(mid);
        client.print(bot);
    }

    const initialSettings = characterStorage.get('settings');
    if (initialSettings) {
        const settings = (initialSettings ?? defaultSettings) as { sunTracker?: boolean };
        enabled = !!settings.sunTracker;
    }
    characterStorage.onChange('settings', (payload) => {
        const settings = (payload ?? defaultSettings) as { sunTracker?: boolean };
        enabled = !!settings.sunTracker;
    });

    client.on("reset", () => {
        clearPending();
    });

    client.on("client.disconnect", () => {
        clearPending();
    });

    client.on("clock.sunrise", (data) => {
        if (enabled) printSunMessage("sunrise");
        setPending(data.domain, "sunrise", data.dayOfYear, data.observedHour);
    });

    client.on("clock.sunset", (data) => {
        if (enabled) printSunMessage("sunset");
        setPending(data.domain, "sunset", data.dayOfYear, data.observedHour);
    });

    client.on("clock.parsedTime", (data) => {
        if (pendingEvent) {
            pendingEvent.observedHour = data.hour;
            pendingEvent.dayOfYear = data.dayOfYear;
            confirmPending();
        }
    });

    client.aliases.push({
        pattern: /^\/slonce$/,
        callback: () => {
            client.sendEvent("sunTracker.popup.open");
        }
    });

    // TEMP: test alias for sun/moon box alignment
    client.aliases.push({
        pattern: /^\/testbox$/,
        callback: () => {
            printSunMessage("sunrise");
            printSunMessage("sunset");
        }
    });
}
