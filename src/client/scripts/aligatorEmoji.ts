import Client from "../Client";
import {FormatStateSnapshot, HexColor} from "@client/ansi/FormatState";

export default function initAligatorEmoji(client: Client) {
    const tag = "aligator-emoji";
    const patterns = [
        /Dostrzegasz jakis ruch w pobliskich szuwarach\. Cos zbliza sie do [A-Za-z]+!$/,
        /Cos zbliza sie do ciebie przez pobliskie szuwary!$/
    ];
    const LIGHT_GREEN_BOLD: FormatStateSnapshot = {
        foreground: {space: "hex", color: "#2ffb2f"} as HexColor,
        dim: {duration: 1000, startOpacity: 1, endOpacity: 0.5},
    };

    patterns.forEach(pattern => {
        client.Triggers.registerTrigger(pattern, (line) => {
            return line.color([0, line.length], LIGHT_GREEN_BOLD).suffix(" \u{1F40A}");
        }, tag);
    });
}
