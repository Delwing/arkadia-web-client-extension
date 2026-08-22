import Client from "../Client";
import {level} from "./lib/comparisonUtils";
import {createColorFormat} from "@modules/core/Colors";

const positiveColor = createColorFormat("#ff0000"); // Red for positive values (you're weaker)
const negativeColor = createColorFormat("#00ff00"); // Green for negative values (you're stronger)
const neutralColor = createColorFormat("#ffff00"); // Yellow for 0 values (equal)

export default function initCompareInline(client: Client) {
    const triggerPattern = /^(?:Wydaje ci sie|Masz wrazenie), ze jestes (.+?) (?:niz|jak) (.+)\.$/m;

    client.Triggers.registerMultilineTrigger(triggerPattern, (line, matches) => {
        const descriptions = matches[1];

        // Sort level entries by description length (longest first) to match most specific first
        const sortedLevelEntries = Object.entries(level).sort((a, b) => b[0].length - a[0].length);

        // Track which positions we've already matched to avoid duplicates
        const matchedRanges: Array<{ start: number, end: number }> = [];
        const statsToInsert: Array<{ index: number, value: number, desc: string }> = [];

        // Find all stat descriptions and their values
        for (const [levelDesc, levelVal] of sortedLevelEntries) {
            // Use regex to find the pattern followed by word ending characters
            const pattern = new RegExp(levelDesc + '[a-z]*', 'g');
            let match: RegExpExecArray;
            while ((match = pattern.exec(descriptions)) !== null) {
                const matchStart = match.index;
                const matchEnd = match.index + match[0].length;

                // Check if this range overlaps with any already matched range
                const overlaps = matchedRanges.some(range =>
                    (matchStart >= range.start && matchStart < range.end) ||
                    (matchEnd > range.start && matchEnd <= range.end) ||
                    (matchStart <= range.start && matchEnd >= range.end)
                );

                if (!overlaps) {
                    const value = -levelVal; // Negative because "jestes X" means you are stronger
                    statsToInsert.push({
                        index: matchEnd,
                        value,
                        desc: match[0]
                    });
                    matchedRanges.push({start: matchStart, end: matchEnd});
                    break; // Only take the first match for this pattern
                }
            }
        }

        // Sort by index in reverse order (end to start) to avoid index shifting
        statsToInsert.sort((a, b) => b.index - a.index);

        // Find where descriptions start in the full line text
        const descriptionsStartIndex = line.text.indexOf(descriptions);

        // Insert the values after each description
        for (const stat of statsToInsert) {
            const insertPosition = descriptionsStartIndex + stat.index;
            const valueStr = stat.value > 0 ? `+${stat.value}` : `${stat.value}`;
            const color = stat.value === 0 ? neutralColor : (stat.value < 0 ? negativeColor : positiveColor);

            line.insert(insertPosition, ` (${valueStr})`, color);
        }

        return line;
    }, "compare-inline");
}
