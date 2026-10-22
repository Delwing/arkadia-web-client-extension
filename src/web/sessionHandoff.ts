/**
 * Browser wiring for the session handoff (see @modules/sessionHandoff/sessionHandoff).
 *
 * Feeds it the game's session events and, once a user is signed in to Firebase, a
 * Realtime Database store. Signed out, it does nothing.
 */

import type Client from "@client/Client";
import mudClient from "./MudClient.ts";
import { shouldReattachAfterClose } from "./proxySession.ts";
import { SessionHandoff } from "@modules/sessionHandoff/sessionHandoff.ts";
import { RtdbHandoffStore } from "@modules/sessionHandoff/rtdbHandoffStore.ts";
import { descriptionPrint } from "@modules/sessionHandoff/handoffRecord.ts";
import type { AnsiAwareBuffer } from "@client/ansi/FormatState.ts";
import { stripAnsiCodes } from "@client/stripAnsiCodes.ts";
import { getFirebaseAuth, getRealtimeDatabase } from "@modules/firebase/firebaseConfig.ts";
import { getDeviceId, loadFirebaseSettings } from "@modules/firebase/firebaseTypes.ts";

/** What the game tells the device being left when a login elsewhere takes the character. */
const TAKEN_OVER = /^[ >]*Nowe interaktywne polaczenie do twej postaci\./;

/**
 * How long a tab may have been in the background and still vouch for its map.
 * Closing a tab hides it just before the page goes, and that has to count.
 */
const HIDDEN_GRACE_MS = 3_000;

let handoff: SessionHandoff | null = null;
let store: RtdbHandoffStore | null = null;
let storeUser: string | null = null;
let storeToken = 0;
let idToken: string | null = null;
let stopIdToken: (() => void) | null = null;
let enabled = true;

function newSessionId(): string {
    const bytes = new Uint8Array(12);
    crypto.getRandomValues(bytes);
    return Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
}

export function installSessionHandoff(client: Client): void {
    if (handoff) return;
    enabled = loadFirebaseSettings().locationHandoffEnabled;

    let hiddenSince: number | null = document.visibilityState === 'visible' ? null : 0;
    document.addEventListener('visibilitychange', () => {
        hiddenSince = document.visibilityState === 'visible' ? null : Date.now();
        // The last chance to speak for the map before the tab may be frozen.
        if (hiddenSince !== null) void handoff?.park();
    });

    const instance = new SessionHandoff({
        deviceId: getDeviceId(),
        newSessionId,
        isTrusted: () => hiddenSince === null || Date.now() - hiddenSince <= HIDDEN_GRACE_MS,
        startTracking: () => client.Map.startJournal(),
        stopTracking: () => client.Map.stopJournal(),
        placedSinceLogin: () => client.Map.placedSinceJournal,
        apply: (roomId, verified) => {
            // Without a journal - the map was not ready at login - just the room.
            if (!client.Map.replayJournal(roomId, !verified)) {
                client.sendEvent('map.setLocation', {roomId, uncertain: !verified});
            }
            client.sendEvent('notify', verified
                ? {text: 'Przejęto lokalizację z poprzedniego urządzenia.', source: 'map', key: 'map.handoff'}
                : {
                    text: 'Przejęto lokalizację z poprzedniego urządzenia, ale opis lokacji się nie zgadza - sprawdź pozycję na mapie.',
                    level: 'warning', source: 'map', key: 'map.handoff',
                });
        },
        setTimer: (fn, ms) => {
            const id = window.setTimeout(fn, ms);
            return () => window.clearTimeout(id);
        },
    });
    handoff = instance;

    // A proxy reattach picks up the same game session, not a new login, even
    // though the game's replay may carry a Char.Info that looks like one.
    let resumed = false;
    let endedByGame = false;

    client.on('client.connect', () => {
        resumed = false;
        endedByGame = false;
        instance.connected();
    });
    client.on('proxy.session', info => {
        if (info?.upstreamClosed) {
            endedByGame = true;
            void instance.sessionEnded();
        } else if (info?.resumed) {
            resumed = true;
        }
    });
    client.on('player.character', name => {
        if (!resumed) instance.sessionStarted(name);
    });
    // Registered after the client's own scripts, so this runs once the map has
    // restored its stored room for the login - and before a GMCP fix arriving in
    // the same frame, which must count as the map being placed.
    client.on('gmcp.char.info', info => {
        const num = Number(info?.object_num);
        instance.charInfoHandled(Number.isInteger(num) && num > 0 ? num : null);
    });
    // The room's exits as the game describes them, from the raw messages rather
    // than the lines on screen, which scripts may have shortened or recoloured. A
    // message split into several lines comes once per line, all with the same text.
    let exits: string[] = [];
    const startDescription = () => {
        exits = [];
    };
    client.on('gmcp_msg.room.short', startDescription);
    client.on('gmcp_msg.room.long', startDescription);
    client.on('gmcp_msg.room.exits', (part: AnsiAwareBuffer) => {
        const text = stripAnsiCodes(part.originalText ?? part);
        if (exits[exits.length - 1] === text) return;
        exits.push(text);
        instance.roomDescribed(descriptionPrint(exits));
    });
    client.Triggers.registerTrigger(TAKEN_OVER, (line) => {
        void instance.sessionEnded();
        return line;
    }, 'sessionHandoff');
    client.on('enterLocation', location => instance.roomChanged(location.id));
    client.on('mapPositionLost', state => instance.lostChanged(state.lost));
    client.on('client.disconnect', () => {
        const willResume = shouldReattachAfterClose({
            usesSessionProxy: mudClient.usesSessionProxy(),
            closedByUser: mudClient.lastCloseCause === 'user',
            sessionEndedByGame: endedByGame,
        });
        if (!willResume) void instance.sessionEnded();
        instance.disconnected();
    });
    // Closing the tab: the transaction will not land before the page is gone,
    // so the room also goes out in a request that outlives it.
    window.addEventListener('pagehide', event => {
        if (!event.persisted) void instance.sessionEnded(true);
    });
}

/** The signed-in Firebase user, or null. Call after Firebase is initialized. */
export function setSessionHandoffUser(userId: string | null): void {
    if (userId === storeUser) return;
    storeUser = userId;
    const token = ++storeToken;
    const previous = store;
    store = null;
    handoff?.setStore(null);
    previous?.dispose();
    stopIdToken?.();
    stopIdToken = null;
    idToken = null;
    if (!userId) return;
    void getRealtimeDatabase()
        .then(database => {
            if (!database || token !== storeToken) return;
            store = new RtdbHandoffStore(database.api, database.db, userId, () => idToken);
            if (enabled) handoff?.setStore(store);
            console.info('[SessionHandoff] ready, Realtime Database', database.url ?? '(SDK default URL)');
        })
        .catch(error => console.warn('[SessionHandoff] Realtime Database unavailable:', error));
    keepIdToken(token).catch(error => console.warn('[SessionHandoff] ID token unavailable:', error));
}

/**
 * Keep the user's ID token at hand: a closing page has no time to ask for one.
 * The SDK refreshes it before it expires, and says so here.
 */
async function keepIdToken(token: number): Promise<void> {
    const auth = getFirebaseAuth();
    if (!auth) return;
    const { onIdTokenChanged } = await import('firebase/auth');
    if (token !== storeToken) return;
    stopIdToken = onIdTokenChanged(auth, user => {
        if (!user) {
            idToken = null;
            return;
        }
        user.getIdToken()
            .then(value => {
                if (token === storeToken) idToken = value;
            })
            .catch(() => undefined);
    });
}

/** The player's opt-out from the Synchronizacja tab. Off, nothing is read or written. */
export function setSessionHandoffEnabled(value: boolean): void {
    if (value === enabled) return;
    enabled = value;
    handoff?.setStore(enabled ? store : null);
}
