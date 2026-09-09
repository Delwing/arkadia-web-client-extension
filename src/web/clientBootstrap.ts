import mudClient from "./MudClient.ts";
import Client from "@client/Client";
import { registerScripts } from "@client/main";
import { HelperConnection } from "@modules/helper/HelperConnection";
import { setupHelperResync } from "@modules/helper/helperResync";
import initSessionLogger from "./sessionLogger";
import initLogFileSaver from "./logFileSaver";
import { migrateNewlyCharacterScopedKeys } from "@modules/core/storage";
import {
    migrateButtonSizeMultiplier,
    migrateFooterComponentVisibility,
    migrateLayoutManagerState,
    migrateMobileButtonMacroField,
    migrateUiSettingsSplit,
    migrateZerknijButtonMacro,
    runAllSettingsMigrations,
} from "@modules/core/settingsMigrations";
import { bridgeSendCommand, bridgeNpcStore } from "./clientBootstrapBridges";
import { registerEnemyStatusFilter } from "./filters/enemyStatusFilter";

export interface GameClientBootstrap {
    client: Client;
    helperConnection: HelperConnection;
}

/**
 * Build the game client and wire the UI-agnostic startup concerns every browser
 * UI needs: settings migrations, feature scripts, session logging, Firebase sync,
 * the helper companion, and the sendCommand / NPC bridges.
 *
 * This is the shared seam between the stock UI (`src/web/main.ts`) and any forge UI
 * (`forge-ui/`). UI-specific wiring stays with the caller: port implementations are
 * injected via `installPorts` (run before `registerScripts`), and DOM-bound work
 * (the content-width measurer, output rendering, connect chrome) is done by the UI
 * after this returns. Seeding `uiSettings` is intentionally left to the caller so
 * the stock UI keeps its lazy-default behaviour.
 */
export function bootstrapGameClient(opts: { installPorts: () => void }): GameClientBootstrap {
    // Run migrations before constructing the client — `new Client`/`registerScripts`
    // read settings during setup, so they must see migrated data.
    migrateNewlyCharacterScopedKeys();
    migrateMobileButtonMacroField();
    // Split uiSettings into concern-scoped keys before runAllSettingsMigrations()
    // bumps the version counter past this migration's gate.
    migrateUiSettingsSplit();
    migrateZerknijButtonMacro();
    runAllSettingsMigrations();
    migrateButtonSizeMultiplier();
    migrateFooterComponentVisibility();
    void migrateLayoutManagerState();

    // Supply the UI's implementations of the client's injectable ports (tooltips,
    // context menu, plugin-host capabilities) before any script runs.
    opts.installPorts();

    const client = new Client(mudClient);
    registerScripts(client);

    // Ogluch / przelamana obrona highlighting. It only listens to client events and
    // writes to the UI-neutral objectListFilters registry, so it belongs here rather
    // than in a single UI's entry point — otherwise the flavors render it in the
    // stock UI and silently drop it everywhere else.
    registerEnemyStatusFilter(client);

    // A push pairing code arrives in the URL fragment, from a QR scanned on
    // another device. The cheap synchronous test comes first on purpose: this
    // is a no-op on every normal load, and gating the dynamic import behind it
    // keeps boot from fetching a chunk that virtually nobody needs.
    if (/[#&]push-pair=/.test(window.location.hash)) {
        void import('@modules/push/pushClient')
            .then(async ({ claimPairingFromLocation, isPushEnabled }) => {
                const claimed = await claimPairingFromLocation();
                // Say something either way. Claiming writes nothing the player
                // can see — the credential lands in storage and the code is
                // consumed server-side — so without this, a successful pairing
                // and an expired one look identical: nothing happens.
                if (!claimed) {
                    client.sendEvent('notify', {
                        text: 'Kod parowania wygasł lub został już użyty. Wygeneruj nowy na drugim urządzeniu.',
                        time: 10000,
                    });
                    return;
                }
                const alreadyReceiving = await isPushEnabled();
                client.sendEvent('notify', {
                    text: alreadyReceiving
                        ? 'Sparowano powiadomienia na tym urządzeniu.'
                        : 'Sparowano. Włącz odbieranie w Ustawieniach interfejsu → Powiadomienia.',
                    time: 10000,
                });
            })
            .catch(() => {});
    }

    // Session logging (sessionLogger first — logFileSaver imports its session name).
    initSessionLogger(mudClient).catch(err => console.error('Logger init failed', err));
    initLogFileSaver(mudClient).catch(err => console.error('File saver init failed', err));

    // Initialize Firebase sync services (skip on localhost):
    // - syncListener receives remote changes in realtime
    // - syncEngine watches local changes and uploads them (debounced)
    if (!(window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')) {
        import('@modules/firebase').then(({ loadFirebaseConfig, initializeFirebase, onAuthStateChanged, syncListener, syncEngine }) => {
            const config = loadFirebaseConfig();
            if (!config) return;
            initializeFirebase(config).then(() => {
                onAuthStateChanged((authState) => {
                    if (authState.isAuthenticated && authState.userId) {
                        syncListener.start(authState.userId);
                        syncEngine.start();
                    } else {
                        syncListener.stop();
                        syncEngine.stop();
                    }
                });
            }).catch(err => {
                console.warn('[Firebase] Failed to initialize at startup:', err);
            });
        }).catch(() => {
            // Firebase module not available
        });
    }

    // Helper connection (optional companion app).
    const helperConnection = new HelperConnection();
    client.keyBindingManager.setHelperConnection(helperConnection);

    // Re-push all helper-side session state (window match, binds) on every
    // (re)connect, so an auto-update restart or any reconnect fully restores it.
    setupHelperResync(helperConnection);

    // Auto-connect: probe first, launch if not running.
    if (localStorage.getItem('arkadia.helperAutoLaunch') === 'true') {
        helperConnection.probe().then(status => {
            if (status) {
                helperConnection.connect();
            } else {
                helperConnection.launch();
            }
        });
    }

    bridgeSendCommand(client);
    bridgeNpcStore(client);

    return { client, helperConnection };
}
