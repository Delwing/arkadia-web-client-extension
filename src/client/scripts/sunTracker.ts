import Client from "../Client";
import {characterStorage} from "@modules/core/storage";
import {AnsiAwareBuffer} from "@client/ansi/FormatState.ts";
import {createColorFormat} from "@modules/core/Colors.ts";
import {defaultSettings, type SunAnnouncement} from "@modules/core/defaultSettings";

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

/** Calendar shape only - sunrise and sunset come from the grids in `sunModel`. */
interface MonthDef {
    length: number;
}

const MONTHS: Record<string, MonthDef> = {
    Hexenstag:    { length: 1 },
    Nachhexen:    { length: 32 },
    Jahrdrung:    { length: 33 },
    Mitterfruhl:  { length: 1 },
    Pflugzeit:    { length: 33 },
    Sigmarszeit:  { length: 33 },
    Sommerzeit:   { length: 33 },
    Sonnenstill:  { length: 1 },
    Vorgeheim:    { length: 33 },
    Geheimnistag: { length: 1 },
    Nachgeheim:   { length: 32 },
    Erntezeit:    { length: 33 },
    Mitterherbst: { length: 1 },
    Brauzeit:     { length: 33 },
    Kaltezeit:    { length: 33 },
    Ulrichszeit:  { length: 33 },
    Mondstill:    { length: 1 },
    Vorhexen:     { length: 33 },
    Yule:     { length: 45 },
    Imbaelk:  { length: 45 },
    Birke:    { length: 45 },
    Blathe:   { length: 45 },
    Feainn:   { length: 45 },
    Lammas:   { length: 45 },
    Velen:    { length: 45 },
    Saovine:  { length: 45 },
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
const DOMAIN_NAMES: Record<Domain, string> = { Empire: "Imperium", Ishtar: "Ishtar" };

export default function initSunTracker(client: Client) {
    let mode: SunAnnouncement = "off";
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

    function notifySun(domain: Domain, type: SunEventType): void {
        const isSunrise = type === "sunrise";
        client.sendEvent("notify", {
            key: `clock.${type}`,
            source: "clock",
            icon: isSunrise ? "sun" : "moon",
            title: isSunrise ? "Wschód słońca" : "Zachód słońca",
            text: DOMAIN_NAMES[domain],
        });
    }

    function printSunMessage(type: SunEventType): void {
        const isSunrise = type === "sunrise";
        const color = isSunrise ? SUNRISE_COLOR : SUNSET_COLOR;
        const icon = isSunrise ? "☀" : "☾";
        const label = isSunrise ? "WSCHOD" : "ZACHOD";
        const inner = ` ${icon} ${label}  [czas] `;
        const border = "═".repeat(inner.length + 1);

        const top = new AnsiAwareBuffer(`╔${border}╗`).colorWords(`╔${border}╗`, color);
        const mid = new AnsiAwareBuffer(`║${inner}║`).colorWords(`║${inner}║`, color);
        const bot = new AnsiAwareBuffer(`╚${border}╝`).colorWords(`╚${border}╝`, color);

        const iconStart = mid.text.indexOf(icon);
        if (iconStart !== -1) {
            mid.color([iconStart, iconStart + icon.length], { ...color, cssClass: "fixed-ch-2" });
        }

        const clickStart = mid.text.indexOf("[czas]");
        if (clickStart !== -1) {
            mid.createLink([clickStart, clickStart + 6], {
                onClick: () => client.sendCommand("czas"),
                title: "Kliknij aby potwierdzić obserwację",
            });
        }

        client.print(top);
        client.print(mid);
        client.print(bot);
    }

    const applySettings = (payload: unknown) => {
        const settings = (payload ?? defaultSettings) as { sunAnnouncement?: SunAnnouncement; sunTracker?: boolean };
        // `sunTracker` is what settings synced from a device not yet migrated still say.
        mode = settings.sunAnnouncement ?? (settings.sunTracker ? "frame" : "off");
    };
    applySettings(characterStorage.get('settings'));
    characterStorage.onChange('settings', applySettings);

    client.on("reset", () => {
        clearPending();
    });

    client.on("client.disconnect", () => {
        clearPending();
    });

    client.on("clock.daylightChange", ({ domain, type }) => {
        if (mode === "notification") notifySun(domain, type);
        else if (mode === "frame") printSunMessage(type);
    });

    // The clock speaks once it can place the flip - possibly only after a
    // later `czas` - and that opens the observation.
    client.on("clock.sunrise", (data) => {
        setPending(data.domain, "sunrise", data.dayOfYear, data.observedHour);
    });

    client.on("clock.sunset", (data) => {
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
}
