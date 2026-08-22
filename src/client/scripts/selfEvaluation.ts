import Client from "../Client";
import {colorString, createColorFormat} from "@modules/core/Colors";
import {AnsiAwareBuffer} from "@client/ansi/FormatState";
import {getWearValue} from "./wearUsed";

export default function initSelfEvaluation(
    client: Client,
    aliases?: { pattern: RegExp; callback: Function }[]
) {
    const tag = "self-evaluation";
    let current = "";
    let summary: { name: string; state: string }[] = [];
    let timer: ReturnType<typeof setTimeout> | undefined;
    let fallback: ReturnType<typeof setTimeout> | undefined;

    // suppressItemEvaluation mutes weaponEvaluation, armorEvaluation and
    // parryShieldEvaluation for the duration of a bulk /ocena read-out. It is a
    // latch, so stopping mid-read would leave all three muted for good.
    client.scope.onDispose(() => {
        client.suppressItemEvaluation = false;
    });

    const GREEN = createColorFormat("#00ff00");
    const YELLOW = createColorFormat("#ffff00");
    const RED = createColorFormat("#ff0000");

    // Map condition phrases to state values (without brackets - colorState adds them)
    const conditionMap: Record<string, string> = {
        "w znakomitym stanie": "max",
        "lekko podniszczony": "4/5",
        "lekko podniszczona": "4/5",
        "lekko podniszczone": "4/5",
        "w kiepskim stanie": "3/5",
        "w oplakanym stanie": "2/5",
        "gotowy sie rozpasc": "1/5",
        "gotowa sie rozpasc": "1/5",
        "gotowe sie rozpasc": "1/5",
        "w dobrym stanie": "6/7",
        "w zlym stanie": "4/7",
        "w bardzo zlym stanie": "3/7",
    };

    function matchCondition(text: string): string | null {
        const lower = text.toLowerCase().trim();
        // Direct match
        if (conditionMap[lower]) {
            return conditionMap[lower];
        }
        // Pattern matches
        if (/liczne walki wyryly.*swoje pietno/.test(lower)) {
            return "5/7";
        }
        if (/wymaga.{0,2} natychmiastowej konserwacji/.test(lower)) {
            return "2/7";
        }
        if (/moze peknac w kazdej chwili/.test(lower)) {
            return "1/7";
        }
        return null;
    }

    function colorState(state: string) {
        let color = RED;
        if (state === "max") {
            color = GREEN;
        } else {
            const m = state.match(/^(\d+)\/(\d+)$/);
            if (m) {
                const num = parseInt(m[1], 10);
                const den = parseInt(m[2], 10);
                if ((den === 7 && num >= 6) || (den === 5 && num === 5)) {
                    color = GREEN;
                } else if ((den === 7 && num === 5) || (den === 5 && num === 4)) {
                    color = YELLOW;
                }
            }
        }
        return colorString(`[${state}]`, color);
    }

    function startTimer() {
        if (timer) return;
        timer = setTimeout(() => {
            client.Triggers.removeByTag(tag);
            if (summary.length > 0) {
                const max = Math.max(...summary.map(s => s.name.length));
                const lines = summary.map(({name, state}) => {
                    const dots = ".".repeat(Math.max(1, max - name.length + 3));
                    const buffer = new AnsiAwareBuffer(`${name} ${dots} `);
                    buffer.appendBuffer(colorState(state));
                    return buffer;
                });
                client.print("\n")
                lines.forEach((line) => {
                    client.print(line);
                })
                client.print("\n")
            }
            summary = [];
            current = "";
            client.suppressItemEvaluation = false;
            timer = undefined;
        }, 250);
    }

    function run() {
        summary = [];
        current = "";
        client.suppressItemEvaluation = true;

        const parent = client.Triggers.registerTrigger(
            /^Oceniasz [^,]+? ([^.]+)\.$/,
            (_line, matches) => {
                if (fallback) {
                    clearTimeout(fallback);
                    fallback = undefined;
                }
                current = matches[1].trim();
                startTimer();
                return null;
            },
            tag,
            {stayOpenLines: 50}
        );

        parent.registerChild(
            /^Wyglada na to, ze (?:sa |jest )?(.+)\.$/,
            (line, matches) => {
                if (current) {
                    if (matches) {
                        const conditionPhrase = matches[1];
                        const state = matchCondition(conditionPhrase);
                        if (state) {
                            summary.push({name: current, state});
                            current = "";
                        }
                    }
                }
                startTimer();
                return line.markAsDeleted()
            },
            tag
        );

        parent.registerChild(
            /^.*$/,
            () => {
                startTimer();
                return null;
            },
            tag
        );

        client.sendCommand("ocen swoje bronie");
        client.sendCommand("ocen swoje zbroje");

        fallback = setTimeout(() => {
            client.Triggers.removeByTag(tag);
            client.suppressItemEvaluation = false;
            summary = [];
            current = "";
        }, 5000);
    }

    // Clothing evaluation
    const clothingTag = "clothing-evaluation";
    let clothingCurrent = "";
    let clothingSummary: { name: string; state: string }[] = [];
    let clothingTimer: ReturnType<typeof setTimeout> | undefined;
    let clothingFallback: ReturnType<typeof setTimeout> | undefined;

    function startClothingTimer() {
        if (clothingTimer) return;
        clothingTimer = setTimeout(() => {
            client.Triggers.removeByTag(clothingTag);
            if (clothingSummary.length > 0) {
                const maxName = Math.max(...clothingSummary.map(s => s.name.length));
                const lines = clothingSummary.map(({name, state}) => {
                    const dots = ".".repeat(Math.max(1, maxName - name.length + 3));
                    const buffer = new AnsiAwareBuffer(`${name} ${dots} `);
                    buffer.appendBuffer(colorState(state));
                    return buffer;
                });
                client.print("\n");
                lines.forEach((line) => {
                    client.print(line);
                });
                client.print("\n");
            }
            clothingSummary = [];
            clothingCurrent = "";
            client.suppressItemEvaluation = false;
            clothingTimer = undefined;
        }, 250);
    }

    function runClothing() {
        clothingSummary = [];
        clothingCurrent = "";
        client.suppressItemEvaluation = true;

        const parent = client.Triggers.registerTrigger(
            /^Oceniasz starannie ([^.]+)\.$/,
            (_line, matches) => {
                if (clothingFallback) {
                    clearTimeout(clothingFallback);
                    clothingFallback = undefined;
                }
                clothingCurrent = matches[1].trim();
                startClothingTimer();
                return null;
            },
            clothingTag,
            {stayOpenLines: 50}
        );

        // Match: "Ubranie to zostalo wykonane z welny i wyglada na w miare nowe."
        parent.registerChild(
            /^Ubranie to zostalo wykonane z .+ i wyglada na (.+)\.$/,
            (line, matches) => {
                if (clothingCurrent && matches) {
                    const conditionText = matches[1].trim() + ".";
                    const wearValue = getWearValue(conditionText);
                    if (wearValue != null) {
                        clothingSummary.push({name: clothingCurrent, state: `${wearValue}/5`});
                    }
                    clothingCurrent = "";
                }
                startClothingTimer();
                return line.markAsDeleted();
            },
            clothingTag
        );

        parent.registerChild(
            /^.*$/,
            () => {
                startClothingTimer();
                return null;
            },
            clothingTag
        );

        client.sendCommand("ocen ubrania");

        clothingFallback = setTimeout(() => {
            client.Triggers.removeByTag(clothingTag);
            client.suppressItemEvaluation = false;
            clothingSummary = [];
            clothingCurrent = "";
        }, 5000);
    }

    if (aliases) {
        aliases.push({pattern: /^\/ocen$/, callback: run});
        aliases.push({pattern: /^\/sprzet$/, callback: run});
        aliases.push({pattern: /^\/ubrania$/, callback: runClothing});
    }
}
