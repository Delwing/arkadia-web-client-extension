import Client from "../Client";
import {AnsiAwareBuffer} from "@client/ansi/FormatState";
import {colorString, createColorFormat} from "@modules/core/Colors";

const TAG = "wyroznienie-options";
const OPTION_COLOR = createColorFormat("#87ceeb"); // light blue
const DISABLE_COLOR = createColorFormat("#ff6b6b"); // light red

export default function initWyroznienieOptions(client: Client) {
    // Match the header line: "Tytul zwiazany z WYROZNIENIEm:" followed by the current title
    const headerPattern = /^Tytul zwiazany z WYROZNIENIEm:\s+(.+)$/i;

    // Match "Do wyboru sa:" line
    const doWyboruPattern = /^Do wyboru sa:$/;

    // Match option lines (indented with 4 spaces or tab, containing text)
    const optionPattern = /^(?:\t|    )(.+)$/;

    let collectingOptions = false;
    let currentTitle: string | null = null;

    // Main trigger to detect header
    client.Triggers.registerTrigger(headerPattern, (_, matches) => {
        currentTitle = matches[1].trim();
        collectingOptions = false;

        // Make the line with current title clickable to disable
        const lineBuffer = new AnsiAwareBuffer();
        lineBuffer.append("Tytul zwiazany z WYROZNIENIEm:        ");

        const titleText = currentTitle;
        const titleBuffer = colorString(titleText, OPTION_COLOR);
        lineBuffer.appendBuffer(titleBuffer);

        // Add clickable disable option if not already "Niewidoczny"
        if (currentTitle.toLowerCase() !== "niewidoczny") {
            lineBuffer.append(" [ ", {});
            const disableText = "wylacz";
            const disableBuffer = new AnsiAwareBuffer();
            disableBuffer.append(disableText, DISABLE_COLOR);
            disableBuffer.createLink([0, disableText.length], {
                onClick: () => {
                    client.sendCommand("opcje wyroznienie niewidoczne");
                },
                title: "Wylacz wyroznienie"
            });
            lineBuffer.appendBuffer(disableBuffer);
            lineBuffer.append(" ]", {});
        }

        return lineBuffer;
    }, TAG);

    // Trigger for "Do wyboru sa:" line
    client.Triggers.registerTrigger(doWyboruPattern, (line) => {
        collectingOptions = true;
        return line;
    }, TAG);

    // Trigger for option lines
    client.Triggers.registerTrigger(optionPattern, (line, matches) => {
        if (!collectingOptions) {
            return line;
        }

        const optionText = matches[1].trim();

        // Skip empty lines or lines that don't look like options
        if (!optionText) {
            return line;
        }

        // Create clickable option line
        const lineBuffer = new AnsiAwareBuffer();
        lineBuffer.append("    "); // Keep indentation

        const clickableText = optionText;
        const optionBuffer = colorString(clickableText, OPTION_COLOR);
        optionBuffer.createLink([0, clickableText.length], {
            onClick: () => {
                client.sendCommand(`opcje wyroznienie ${optionText.toLowerCase()}`);
            },
            title: `Wybierz: ${optionText}`
        });
        lineBuffer.appendBuffer(optionBuffer);

        return lineBuffer;
    }, TAG);

    // Reset collecting state on empty line or other content
    client.Triggers.registerTrigger(/^$/, () => {
        collectingOptions = false;
        return null;
    }, TAG);
}
