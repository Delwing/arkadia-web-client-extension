import Client from "../Client";
import {createColorFormat} from "@modules/core/Colors";

const descriptionColor = createColorFormat("#ffcc99"); // Very light orange

export default function initPersonDescription(client: Client) {
    // Pattern matches: "Jest <description words>, znanym jako:"
    // Captures the description words between "Jest " and ", znanym"
    const triggerPattern = /^Jest ((?:\w+\s+){0,2}\w+), znanym jako:/m;

    client.Triggers.registerMultilineTrigger(triggerPattern, (line, matches) => {
        const description = matches[1];

        // Find where the description starts in the line
        const jestIndex = line.text.indexOf("Jest ");
        if (jestIndex === -1) return line;

        const descriptionStartIndex = jestIndex + 5; // "Jest ".length
        const descriptionEndIndex = descriptionStartIndex + description.length;

        // Color the description text
        line.color([descriptionStartIndex, descriptionEndIndex], descriptionColor);

        return line;
    }, "person-description");
}
