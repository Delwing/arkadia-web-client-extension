import Client from "../Client";
import { containerAction } from "./bagManager";
import { polishWordToNumber } from "./lib/polishNumberConverter";
import { characterStorage } from "@modules/core/storage";
import { defaultSettings } from "@modules/core/defaultSettings";

/**
 * Generate random delay to simulate human-like timing
 */
function randomDelay(multiplier: number, base: number): number {
    return (multiplier * Math.random() + base) * 1000;
}

/**
 * Cutting mode: 1 = wytnij (cut), 2 = wyrwij (tear)
 */
type CuttingMode = 1 | 2;

/**
 * State for cutting session
 */
interface CuttingState {
    mode: CuttingMode | null;
    countedBodies: number;
    currentlyProcessing: number;
    sessionTag: string;
}

/**
 * Initialize the cutting/tearing system
 */
export default function initCutting(
    client: Client,
    aliases?: { pattern: RegExp; callback: Function }[]
) {
    const state: CuttingState = {
        mode: null,
        countedBodies: 0,
        currentlyProcessing: 0,
        sessionTag: 'cutting-session',
    };

    let cuttingPreActions: string[] = [];
    let cuttingPostActions: string[] = [];

    // Listen for settings changes
    const applySettings = (settings: any) => {
        const st = (settings ?? defaultSettings) as any;

        // Parse pre-action commands (semicolon-separated)
        cuttingPreActions = typeof st.cuttingPreAction === 'string'
            ? st.cuttingPreAction.split(';').map((c: string) => c.trim()).filter(Boolean)
            : [];

        // Parse post-action commands (semicolon-separated)
        cuttingPostActions = typeof st.cuttingPostAction === 'string'
            ? st.cuttingPostAction.split(';').map((c: string) => c.trim()).filter(Boolean)
            : [];
    };
    applySettings(characterStorage.get('settings'));
    client.scope.onDispose(characterStorage.onChange('settings', (settings) => {
        applySettings(settings);
    }));

    /**
     * Execute pre-cutting actions (e.g., sheathe weapons, draw dagger)
     */
    async function executePreActions() {
        for (const command of cuttingPreActions) {
            await client.sendCommand(command);
            await sleep(randomDelay(0.5, 0.3));
        }
    }

    /**
     * Execute post-cutting actions (e.g., re-equip weapons)
     */
    async function executePostActions() {
        for (const command of cuttingPostActions) {
            await client.sendCommand(command);
            await sleep(randomDelay(0.5, 0.3));
        }
    }

    /**
     * Put scraps into bag
     */
    async function putScrapsInBag() {
        await sleep(randomDelay(0.81251, 0.4788152));
        containerAction(client, "other", "put", "wszystkie szczatki");
    }

    /**
     * Get cutting command based on mode and body number
     */
    function getCuttingCommand(bodyNumber: number | 'pierwszy'): string {
        const action = state.mode === 1 ? 'wytnij' : 'wyrwij';
        if (bodyNumber === 'pierwszy') {
            return `${action} wszystko z pierwszego ciala`;
        }
        return `${action} wszystko z ${bodyNumber}. ciala`;
    }

    /**
     * Process next body in sequence
     */
    async function processNextBody() {
        if (state.currentlyProcessing > state.countedBodies) {
            // All bodies processed
            await putScrapsInBag();
            await executePostActions();
            cleanupSession();
            return;
        }

        await sleep(randomDelay(1.172, 0.498468125));
        await client.sendCommand(getCuttingCommand(state.currentlyProcessing));
    }

    /**
     * Cleanup cutting session
     */
    function cleanupSession() {
        client.Triggers.removeByTag(state.sessionTag);
        state.mode = null;
        state.countedBodies = 0;
        state.currentlyProcessing = 0;
    }

    /**
     * Handle successful cut/tear
     */
    function handleSuccessfulCut() {
        state.currentlyProcessing++;
        processNextBody();
    }

    /**
     * Handle no body found or error
     */
    function handleNoBodies() {
        state.currentlyProcessing = 0;
        setTimeout(async () => {
            await sleep(randomDelay(1.1, 0.57231));
            await putScrapsInBag();
            await sleep(randomDelay(1.067523, 0.7125612));
            await executePostActions();
            cleanupSession();
        }, 0);
    }

    /**
     * Initiate cutting from all bodies
     */
    async function cutFromAllBodies(mode: CuttingMode) {
        state.mode = mode;

        // Execute pre-actions
        await executePreActions();

        // Register trigger for cutting results BEFORE starting
        registerCuttingTriggers();

        // Register trigger to capture body count
        client.Triggers.registerOneTimeTrigger(
            /^.*Doliczyl.s sie ([a-z ]+) sztuk(|i)\.$/,
            (line, matches) => {
                if (matches && matches[1]) {
                    const countWord = matches[1];
                    state.countedBodies = polishWordToNumber(countWord);

                    if (state.countedBodies === 0) {
                        client.println('Nie znaleziono zadnych cial do wyciecia.');
                        cleanupSession();
                        return line;
                    }

                    // Schedule async work
                    setTimeout(async () => {
                        // Wait before starting cutting
                        await sleep(randomDelay(1.012512, 0.18351));

                        // Start with first body
                        state.currentlyProcessing = 1;
                        await client.sendCommand(getCuttingCommand('pierwszy'));
                    }, 0);
                }
                return line;
            },
            state.sessionTag
        );

        // Send command to count bodies
        await client.sendCommand('policz wszystkie ciala');
    }

    /**
     * Initiate cutting from specific body number
     */
    async function cutFromSpecificBody(mode: CuttingMode, bodyNumber: number) {
        state.mode = mode;
        state.countedBodies = bodyNumber;
        state.currentlyProcessing = bodyNumber;

        // Execute pre-actions
        await executePreActions();

        // Register one-time trigger for single body result
        client.Triggers.registerOneTimeTrigger(
            /^.*(Wycinasz|Wyrywasz|Nie|Slucham).*$/,
            (line) => {
                // Schedule async work
                setTimeout(async () => {
                    await sleep(randomDelay(0.81251, 0.4788152));
                    await putScrapsInBag();
                    await sleep(randomDelay(1.067523, 0.7125612));
                    await executePostActions();
                    cleanupSession();
                }, 0);
                return line;
            },
            state.sessionTag
        );

        // Wait and send cutting command
        await sleep(1300);
        await client.sendCommand(getCuttingCommand(bodyNumber));
    }

    /**
     * Register triggers to listen for cutting results during processing
     */
    function registerCuttingTriggers() {
        // Success trigger: body was cut/torn
        client.Triggers.registerTrigger(
            [
                /.*Wycinasz.*/,
                /.*Nie jestes w stanie.*/,
                /.*Nie mozesz tego zrobic, gdyz.*/,
                /.*Wyrywasz.*/,
            ],
            (line) => {
                handleSuccessfulCut();
                return line;
            },
            state.sessionTag
        );

        // Error trigger: no body found or interrupted
        client.Triggers.registerTrigger(
            [
                /.*Nie widzisz nigdzie w okolicy takiego ciala\./,
                /.*Slucham\?/,
                /.*Nie widzisz tu niczego takiego\.$/,
                /.*Przestajesz wycinac .*/,
                /.*Jestes w trakcie walki - lepiej skoncentruj sie na niej.*/,
                /.*Przestajesz wyrywac .*/,
                /.*Nie mozesz tego tak po prostu wyrwac/
            ],
            (line) => {
                handleNoBodies();
                return line;
            },
            state.sessionTag
        );
    }

    /**
     * Sleep helper function
     */
    function sleep(ms: number): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    // Register aliases if provided
    if (aliases) {
        // /wyc or /wycinaj - cut from all bodies
        aliases.push({
            pattern: /^\/wyc(|inaj)$/,
            callback: () => {
                cutFromAllBodies(1);
            }
        });

        // /wyc [number] - cut from specific body
        aliases.push({
            pattern: /^\/wyc ([0-9]+)$/,
            callback: (matches: RegExpMatchArray) => {
                const bodyNumber = parseInt(matches[1], 10);
                cutFromSpecificBody(1, bodyNumber);
            }
        });

        // /wyr or /wyrywaj - tear from all bodies
        aliases.push({
            pattern: /^\/wyr(|ywaj)$/,
            callback: () => {
                cutFromAllBodies(2);
            }
        });

        // /wyr [number] - tear from specific body
        aliases.push({
            pattern: /^\/wyr ([0-9]+)$/,
            callback: (matches: RegExpMatchArray) => {
                const bodyNumber = parseInt(matches[1], 10);
                cutFromSpecificBody(2, bodyNumber);
            }
        });
    }
}
