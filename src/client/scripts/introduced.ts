import Client from "../Client";
import { createColorFormat, colorString } from "@modules/core/Colors";
import { AnsiAwareBuffer } from "@client/ansi/FormatState";
import { characterStorage } from "@modules/core/storage";

const STORAGE_KEY_REMEMBERED = "introduced_remembered";
const STORAGE_KEY_INTRODUCED = "introduced_presented";

const TRIGGER_TAG = "introduced";

const COUNT_COLOR = createColorFormat("#00ff7f"); // spring green
const DELETED_LABEL_COLOR = createColorFormat("#6a5acd"); // slate blue
const DELETED_NAMES_COLOR = createColorFormat("#ffff00"); // yellow

export default function initIntroduced(
    client: Client,
    aliases?: { pattern: RegExp; callback: Function }[]
) {
    let remembered: string[] = [];
    let previousRemembered: string[] = [];
    let introduced: string[] = [];
    const loaded = {remembered: false, introduced: false};

    // Load from storage
    const initialRemembered = characterStorage.get(STORAGE_KEY_REMEMBERED);
    if (initialRemembered) {
        const stored = Array.isArray(initialRemembered) ? initialRemembered : [];
        previousRemembered = stored;
        remembered = [...stored];
        loaded.remembered = true;
    }
    loaded.introduced = true;

    client.scope.onDispose(characterStorage.onChange(STORAGE_KEY_REMEMBERED, (newValue) => {
        const stored = Array.isArray(newValue) ? newValue : [];
        previousRemembered = stored;
        remembered = [...stored];
        loaded.remembered = true;
    }));

    const persistRemembered = () => {
        characterStorage.set(STORAGE_KEY_REMEMBERED, remembered);
    };

    const persistIntroduced = () => {
        characterStorage.set(STORAGE_KEY_INTRODUCED, introduced);
    };

    /**
     * Parse names from the response text.
     * Names are separated by ", " and the last name is preceded by " i ".
     * Example: "Adas, Bodas i Codas" -> ["Adas", "Bodas", "Codas"]
     */
    function parseNames(text: string): string[] {
        // Replace " i " with ", " then split by ", "
        return text
            .replace(/ i /g, ", ")
            .split(", ")
            .map(name => name.trim())
            .filter(name => name.length > 0);
    }

    /**
     * Find names that were in previous but are not in current
     */
    function findDeleted(previous: string[], current: string[]): string[] {
        const currentSet = new Set(current);
        return previous.filter(name => !currentSet.has(name));
    }

    /**
     * Process "zapamietani" response
     * Pattern: "Zapamietane przez ciebie imiona to (.*)\."
     */
    function processRemembered(line: AnsiAwareBuffer, matches: RegExpMatchArray): AnsiAwareBuffer {
        const namesText = matches[1];
        remembered = parseNames(namesText);

        // Show count prefix
        const text = line.text;
        const zapamietaneIndex = text.indexOf("Zapamietane");
        if (zapamietaneIndex >= 0) {
            const countPrefix = `[${remembered.length}] `;
            const prefixBuffer = colorString(countPrefix, COUNT_COLOR);
            line.replaceBuffer([zapamietaneIndex, zapamietaneIndex], prefixBuffer);
        }

        // Check for deleted names
        const deleted = findDeleted(previousRemembered, remembered);
        if (deleted.length > 0) {
            const deletedLine = new AnsiAwareBuffer("\n\n");
            deletedLine.appendBuffer(colorString("Osoby usuniete z zapamietanych: ", DELETED_LABEL_COLOR));
            deletedLine.appendBuffer(colorString(deleted.join(", "), DELETED_NAMES_COLOR));
            client.print(deletedLine);
        }

        // Update previous and persist
        previousRemembered = [...remembered];
        persistRemembered();

        client.print(new AnsiAwareBuffer("\n\n"));

        return line;
    }

    /**
     * Process "przedstawieni" response
     * Pattern: "Osoby, ktore zostaly ci ostatnio przedstawione, to (.*)\."
     */
    function processIntroduced(line: AnsiAwareBuffer, matches: RegExpMatchArray): AnsiAwareBuffer {
        const namesText = matches[1];
        introduced = parseNames(namesText);

        // Show count prefix
        const text = line.text;
        const osobyIndex = text.indexOf("Osoby");
        if (osobyIndex >= 0) {
            const countPrefix = `[${introduced.length}] `;
            const prefixBuffer = colorString(countPrefix, COUNT_COLOR);
            line.replaceBuffer([osobyIndex, osobyIndex], prefixBuffer);
        }

        // Create clickable links for people not in remembered list
        const rememberedSet = new Set(remembered);
        for (const name of introduced) {
            if (!rememberedSet.has(name)) {
                // Find position of the name in the line
                const nameIndex = line.text.indexOf(name);
                if (nameIndex >= 0) {
                    line.createLink([nameIndex, nameIndex + name.length], {
                        onClick: () => {
                            client.sendCommand(`zapamietaj imie ${name}`);
                        },
                        title: `zapamietaj imie ${name}`,
                    });
                }
            }
        }

        persistIntroduced();

        return line;
    }

    /**
     * Register one-time triggers when "zapamietani" command is detected
     */
    function onZapamietaniCommand() {
        client.Triggers.removeByTag(TRIGGER_TAG);

        client.Triggers.registerOneTimeTrigger(
            /^Zapamietane przez ciebie imiona to (.*)\.$/,
            (line, matches) => {
                if (!matches) return line;
                return processRemembered(line, matches);
            },
            TRIGGER_TAG
        );
    }

    /**
     * Register one-time triggers when "przedstawieni" command is detected
     */
    function onPrzedstawieniCommand() {
        client.Triggers.removeByTag(TRIGGER_TAG);

        client.Triggers.registerOneTimeTrigger(
            /^Osoby, ktore zostaly ci ostatnio przedstawione, to (.*)\.$/,
            (line, matches) => {
                if (!matches) return line;
                return processIntroduced(line, matches);
            },
            TRIGGER_TAG
        );
    }

    // Register command hook to detect zapamietani/przedstawieni commands
    client.registerCommandHook(
        "introduced-command-hook",
        (command) => {
            const trimmed = command.trim().toLowerCase();
            if (trimmed === "zapamietani") {
                onZapamietaniCommand();
            } else if (trimmed === "przedstawieni") {
                onPrzedstawieniCommand();
            }
            return undefined; // Don't modify the command
        },
        0
    );

    // Register alias for quick capture of both
    if (aliases) {
        aliases.push({
            pattern: /^\/przedstawieni$/,
            callback: () => {
                onZapamietaniCommand();
                onPrzedstawieniCommand();
                client.sendCommand("zapamietani");
                client.sendCommand("przedstawieni");
            },
        });
    }
}
