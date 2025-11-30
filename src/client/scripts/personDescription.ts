import Client from "../Client";
import {createColorFormat} from "@modules/core/Colors";

// Description color with bold
const descriptionFormat = {
    ...createColorFormat("#ffcc99"), // Very light orange
    bold: true
};

export default function initPersonDescription(client: Client) {
    // Pattern matches: "Jest/Jestes <description words>, znanym/znana jako:"
    // followed by the name on the next line (ending with period)
    // Uses [\s\S] to match across newlines
    // Captures: 1=Jest/Jestes, 2=description words, 3=znanym/znana, 4=name line (until period)
    const triggerPattern = /^(Jest(?:es)?)\s+((?:\w+\s+){0,5}\w+),\s+(znanym|znana)\s+jako:\n(\w+).*\./m;

    client.Triggers.registerMultilineTrigger(triggerPattern, (line, matches) => {
        const jestWord = matches[1]; // "Jest" or "Jestes"
        const description = matches[2];
        const name = matches[4].trim();

        // Find where the description starts in the line
        const jestIndex = line.text.indexOf(jestWord + " ");
        if (jestIndex === -1) return line;

        const descriptionStartIndex = jestIndex + jestWord.length + 1; // "Jest " or "Jestes " length
        const descriptionEndIndex = descriptionStartIndex + description.length;

        // Color and bold the description text (use color which overwrites existing format including bold)
        line.color([descriptionStartIndex, descriptionEndIndex], descriptionFormat);

        // Find the name after the newline (it's on the second line)
        const newlineIndex = line.text.indexOf("\n");
        if (newlineIndex !== -1) {
            const nameIndex = line.text.indexOf(name, newlineIndex);
            if (nameIndex !== -1) {
                const currentState = line.getStateAt(nameIndex) || {};
                line.color([nameIndex, nameIndex + name.length], { ...currentState, bold: true });
            }
        }

        return line;
    }, "person-description");
}
