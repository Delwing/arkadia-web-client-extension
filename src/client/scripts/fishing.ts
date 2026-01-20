import Client from "@client/Client.ts";
import eventBus from "@modules/core/eventBus.ts";
import { createColorFormat } from "@modules/core/Colors.ts";

export type FishingState = 'idle' | 'fishing' | 'biting' | 'pulling';

export type BaitType = 'kulke' | 'rybke' | 'robaka';

export const BAIT_OPTIONS: { value: BaitType; label: string }[] = [
    { value: 'kulke', label: 'Kulka chlebowa' },
    { value: 'rybke', label: 'Rybka' },
    { value: 'robaka', label: 'Robak' },
];

// Colors for fishing lines
const COLOR_CAST = createColorFormat("#60a5fa");      // Blue - casting rod
const COLOR_BITING = createColorFormat("#fbbf24");    // Yellow/amber - fish biting (urgent)
const COLOR_PULLING = createColorFormat("#34d399");   // Green - pulling fish
const COLOR_CAUGHT = createColorFormat("#22c55e");    // Bright green - fish caught
const COLOR_BROKEN = createColorFormat("#ef4444");    // Red - rod broken

export interface FishingStatePayload {
    state: FishingState;
    castTimestamp: number | null;
}

export default function initFishing(client: Client, aliases: { pattern: RegExp; callback: Function }[]) {
    let currentState: FishingState = 'idle';
    let castTimestamp: number | null = null;

    const setState = (state: FishingState) => {
        currentState = state;
        if (state === 'idle') {
            castTimestamp = null;
        }
        eventBus.emit("fishing.state", { state, castTimestamp });
    };

    // Trigger: Start fishing - "Bierzesz prowizoryczna wedka zamach i zarzucasz ja daleko w wode."
    // Using wildcard for "prowizoryczna" as the rod name can vary
    const castRodPattern = /^Bierzesz .+ zamach i zarzucasz ja daleko w wode\.$/;

    client.Triggers.registerTrigger(castRodPattern, (line) => {
        castTimestamp = Date.now();
        setState('fishing');
        line.color([0, line.length], COLOR_CAST);
        return line;
    }, 'fishing');

    // Trigger: Fish biting - "Nagle dostrzegasz, ze zanurzony w wodzie sznurek prowizorycznej wedki napina sie!"
    // Using wildcard for "prowizorycznej" as it can vary
    const fishBitingPattern = /^Nagle dostrzegasz, ze zanurzony w wodzie sznurek .* wedki napina sie!$/;

    client.Triggers.registerTrigger(fishBitingPattern, (line) => {
        setState('biting');
        // Set functional bind to strike the fish
        client.FunctionalBind.set("zatnij rybe na wedce", undefined, true);
        // Play beep sound
        client.sendEvent("sound:play", { key: "beep" });
        line.color([0, line.length], COLOR_BITING);
        return line;
    }, 'fishing');

    // Trigger: Started pulling fish - "Energicznym ruchem pociagasz za napieta prowizoryczna wedke, zacinajac zlapana na haczyk rybe i rozpoczynajac z nia walke."
    // Using wildcard for "prowizoryczna" as it can vary
    const startPullingPattern = /^Energicznym ruchem pociagasz za napieta .* wedke, zacinajac zlapana na haczyk rybe i rozpoczynajac z nia walke\.$/;

    client.Triggers.registerTrigger(startPullingPattern, (line) => {
        setState('pulling');
        client.FunctionalBind.clear();
        line.color([0, line.length], COLOR_PULLING);
        return line;
    }, 'fishing');

    // Trigger: Fish caught - "Wyciagasz zlapana rybe na powierzchnie."
    const fishCaughtPattern = /^Wyciagasz zlapana rybe na powierzchnie\.$/;

    client.Triggers.registerTrigger(fishCaughtPattern, (line) => {
        setState('idle');
        client.FunctionalBind.clear();
        line.color([0, line.length], COLOR_CAUGHT);
        return line;
    }, 'fishing');

    // Trigger: Pull rod without fish (optional - reset to idle if pulling rod manually)
    // "Wyciagasz prowizoryczna wedke z wody."
    const pullRodPattern = /^Wyciagasz .+ z wody\.$/;

    client.Triggers.registerTrigger(pullRodPattern, (line) => {
        setState('idle');
        client.FunctionalBind.clear();
        return line;
    }, 'fishing');

    // Trigger: Grab and pull rod - "Chwytasz za prowizoryczna wedke i wyciagasz ja z wody."
    const grabPullRodPattern = /^Chwytasz za .+ i wyciagasz ja z wody\.$/;

    client.Triggers.registerTrigger(grabPullRodPattern, (line) => {
        setState('idle');
        client.FunctionalBind.clear();
        return line;
    }, 'fishing');

    // Trigger: Rod broken - "Slyszysz suchy trzask i dostrzegasz, ze zdobycz zerwala sie z prowizorycznej wedki, lamiac ja przy tym."
    const rodBrokenPattern = /^Slyszysz suchy trzask i dostrzegasz, ze zdobycz zerwala sie z .+ wedki, lamiac ja przy tym\.$/;

    client.Triggers.registerTrigger(rodBrokenPattern, (line) => {
        setState('idle');
        client.FunctionalBind.clear();
        line.color([0, line.length], COLOR_BROKEN);
        return line;
    }, 'fishing');

    // Trigger: Fish escaped - "Sznurek prostej leszczynowej wedki opada swobodnie na wode, zapewne zlapanej nan rybie udalo sie zerwac."
    const fishEscapedPattern = /^Sznurek .+ wedki opada swobodnie na wode, zapewne zlapanej nan rybie udalo sie zerwac\.$/;

    client.Triggers.registerTrigger(fishEscapedPattern, (line) => {
        setState('idle');
        client.FunctionalBind.clear();
        line.color([0, line.length], COLOR_BROKEN);
        return line;
    }, 'fishing');

    // Trigger: Rod not cast - "Prosta leszczynowa wedka nie jest zarzucona."
    const rodNotCastPattern = /^.+ wedka nie jest zarzucona\.$/;

    client.Triggers.registerTrigger(rodNotCastPattern, (line) => {
        setState('idle');
        client.FunctionalBind.clear();
        return line;
    }, 'fishing');

    // Alias to open the fishing popup
    aliases.push({
        pattern: /^\/wedka$/,
        callback: () => {
            eventBus.emit("fishing.popup.open", { state: currentState, castTimestamp });
        },
    });

    // Listen for popup commands
    eventBus.on("fishing.cast", (payload: { bait: BaitType }) => {
        const bait = payload?.bait || 'kulke';
        client.sendCommand(`zawies ${bait} na wedce;zarzuc wedke`);
    });

    eventBus.on("fishing.pull", () => {
        client.sendCommand("wyciagnij wedke");
    });

    eventBus.on("fishing.strike", () => {
        client.sendCommand("zatnij rybe na wedce");
    });

    return {
        getState: () => currentState,
        setState,
    };
}
