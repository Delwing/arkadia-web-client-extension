import Client from "../Client";
import { FormatStateSnapshot } from "@client/ansi/FormatState";

export default function initTideWarningHighlight(client: Client) {
    const FORMAT: FormatStateSnapshot = {
        foreground: {space: "hex", color: "#ffffaa"},
        dim: {startOpacity: 1, endOpacity: 0.5, duration: 2000, easing: 'ease-in-out'},
    };
    const patterns = [
        /^[ >]*Poziom wody powoli sie podnosi\. Coraz bardziej zbliza sie przyplyw\.$/,
        /^[ >]*Poziom wody coraz gwaltowniej sie podnosi\. Fale przyplywu moga nadejsc w kazdej chwili!$/,
    ];
    patterns.forEach(p => {
        client.Triggers.registerTrigger(p, (line) => {
            line.color([0, line.length], FORMAT);
            return line;
        }, "tide-warning-highlight");
    });
}
