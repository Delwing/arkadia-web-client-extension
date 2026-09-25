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
import { getRealtimeDatabase } from "@modules/firebase/firebaseConfig.ts";
import { getDeviceId } from "@modules/firebase/firebaseTypes.ts";

/**
 * How long a tab may have been in the background and still vouch for its map.
 * Closing a tab hides it just before the page goes, and that has to count.
 */
const HIDDEN_GRACE_MS = 3_000;

let handoff: SessionHandoff | null = null;
let store: RtdbHandoffStore | null = null;
let storeUser: string | null = null;
let storeToken = 0;

function newSessionId(): string {
    const bytes = new Uint8Array(12);
    crypto.getRandomValues(bytes);
    return Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
}

export function installSessionHandoff(client: Client): void {
    if (handoff) return;

    let hiddenSince: number | null = document.visibilityState === 'visible' ? null : 0;
    document.addEventListener('visibilitychange', () => {
        hiddenSince = document.visibilityState === 'visible' ? null : Date.now();
    });

    const instance = new SessionHandoff({
        deviceId: getDeviceId(),
        newSessionId,
        isTrusted: () => hiddenSince === null || Date.now() - hiddenSince <= HIDDEN_GRACE_MS,
        apply: roomId => {
            client.sendEvent('map.setLocation', {roomId});
            client.println('Przejeto lokalizacje z poprzedniego urzadzenia.');
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
    // Closing the tab: the transaction is sent on the open connection straight
    // away, and may or may not land before the page is gone.
    window.addEventListener('pagehide', event => {
        if (!event.persisted) void instance.sessionEnded();
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
    if (!userId) return;
    void getRealtimeDatabase()
        .then(database => {
            if (!database || token !== storeToken) return;
            store = new RtdbHandoffStore(database.api, database.db, userId);
            handoff?.setStore(store);
        })
        .catch(error => console.warn('[SessionHandoff] Realtime Database unavailable:', error));
}
