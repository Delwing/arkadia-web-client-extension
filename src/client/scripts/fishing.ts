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

// Fish color descriptions to fish names mapping
const FISH_HINTS: Record<string, string> = {
    'zlocistobrazow': 'Amarel',
    'ciemnozielon': 'Amur/Sandacz/Szczupak',
    'czerwonaw': 'Antias/Skalnik',
    'jasnopomaranczow': 'Apogon',
    'zielonkaw': 'Ateryna',
    'zielonkawobrazow': 'Barrakuda/Brama/Makrelosz',
    'brazowoczerwon': 'Barwena',
    'ciemnoniebieski': 'Belona',
    'ciemnoczerwon': 'Beryks',
    'jasnomiedzian': 'Bielmik',
    'blekitnaw': 'Bolen',
    'czarn': 'Bulawik/Topornik',
    'srebrzyst': 'Certa/Kielec/Labraks/Salpa/Sieja',
    'zielonkawoszar': 'Chelon/Glowacica',
    'brazow': 'Chromis/Sajka',
    'mosieznozlot': 'Czarniak',
    'metaliczn': 'Dorada',
    'jasnoszar': 'Dorsz',
    'pasiast': 'Drum',
    'srebrzystoszar': 'Dubiel/Kulbin',
    'szar': 'Glowacz',
    'plamist': 'Granik/Nawaga',
    'czarnoniebieski': 'Gromadnik',
    'brazowaw': 'Iglik/Karas/Mietus/Rdzawiec',
    'czerwonobrazow': 'Jaskron/Kaprosz/Mostelka',
    'oliwkowozielon': 'Jazgarz',
    'stalowoszar': 'Jelec',
    'brazowoszar': 'Jesiotr',
    'purpurow': 'Kabryl',
    'okraglaw': 'Kantar',
    'szarobrazow': 'Karp',
    'czerwonozlot': 'Karpienczyk',
    'niebieskawobrazow': 'Kielb',
    'zoltaw': 'Kolen/Murena/Piotrosz',
    'wezowat': 'Konger/Wegorz',
    'blekitnawozielon': 'Koryfena',
    'niebieskoszar': 'Kosogon',
    'ciemnoszar': 'Lamna',
    'zielonobrunatn': 'Lin',
    'srebrzystobial': 'Lipien',
    'oliwkowosrebrzyst': 'Losos/Makrelosz',
    'plask': 'Makrela',
    'prazkowan': 'Mauryk',
    'rozowaw': 'Morlesz',
    'szarosrebrzyst': 'Oblada/Pagrus',
    'marmurkow': 'Ogak',
    'pregowan': 'Okon',
    'zielononiebieski': 'Ostrobok',
    'zoltobrazow': 'Ostrosz/Pilczyk/Wezyna',
    'ciemnobrazow': 'Piskorz',
    'niebieskozielon': 'Plotka',
    'nakrapian': 'Pstrag',
    'sardynk': 'Sardynka',
    'srebrnolusk': 'Sardynka',
    'niebieskosrebrzyst': 'Seriola',
    'niebieskaw': 'Sierpnik/Szprot',
    'srebrzystozielon': 'Sledz',
    'wylupiastook': 'Sola',
    'fioletowoniebiesk': 'Strojnik',
    'wzorzyst': 'Strzepiel',
    'wasat': 'Sum',
    'olowianoszar': 'Tolpyga',
    'stalowoblekitn': 'Tunczyk',
    'szarozielon': 'Ukleja',
    'barwn': 'Widlak',
    'brazowozielon': 'Wzdrega',
};

// Function to find fish name hint based on color description
function findFishHint(colorDesc: string): string | null {
    const normalized = colorDesc.toLowerCase();
    // Sort keys by length (longest first) to match most specific color first
    const sortedKeys = Object.keys(FISH_HINTS).sort((a, b) => b.length - a.length);
    for (const key of sortedKeys) {
        if (normalized.startsWith(key)) {
            return FISH_HINTS[key];
        }
    }
    return null;
}

// Matches a fish color description followed by the noun "ryba"/"ryby"/"ryb"
// (e.g. "brazowoszara ryba", "brazowoszare ryby", "brazowoszarych ryb").
const FISH_DESC_PATTERN_SOURCE = '(\\w+) (ryb[aey]|ryb)\\b';

export interface FishHintMatch {
    hint: string;
    start: number;
    end: number;
}

// Find the first fish color description in `text` that maps to a known fish
// hint. Shared by the in-game line trigger and the pretty-container filter.
export function matchFishHint(text: string): FishHintMatch | null {
    const regex = new RegExp(FISH_DESC_PATTERN_SOURCE, 'gi');
    let match: RegExpExecArray | null;
    while ((match = regex.exec(text)) !== null) {
        const hint = findFishHint(match[1]);
        if (hint) {
            return { hint, start: match.index, end: match.index + match[0].length };
        }
    }
    return null;
}

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
        client.sendEvent("sound:category", "fishing");
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

    // Trigger: Rod dragged underwater - "Nagle prosta leszczynowa wedka zostaje wciagnieta pod wode!"
    const rodDraggedPattern = /^Nagle .+ wedka zostaje wciagnieta pod wode!$/;

    client.Triggers.registerTrigger(rodDraggedPattern, (line) => {
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

    // Trigger: Fish hint - match fish color descriptions and add hint on hover
    // Matches patterns like "brazowoszara ryba", "brazowoszare ryby", "brazowoszarych ryb"
    const fishDescPattern = new RegExp(FISH_DESC_PATTERN_SOURCE, 'gi');

    client.Triggers.registerTrigger(fishDescPattern, (line) => {
        const text = line.text;

        // Find all fish descriptions and add hover hints
        let match;
        const regex = new RegExp(FISH_DESC_PATTERN_SOURCE, 'gi');
        while ((match = regex.exec(text)) !== null) {
            const colorDesc = match[1];
            const hint = findFishHint(colorDesc);
            if (hint) {
                const start = match.index;
                const end = match.index + match[0].length;
                line.applyFormat([start, end], {
                    hyperlink: { title: hint }
                });
            }
        }
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
