import Client from "../Client";
import {AnsiAwareBuffer} from "@client/ansi/FormatState.ts";

export default function initGates(client: Client) {
    const knock = () => {
        client.sendCommand("zastukaj we wrota");
    };
    client.FunctionalBind.set(null, knock);

    const showMessage = (line: AnsiAwareBuffer) => {
        client.FunctionalBind.set("zastukaj we wrota", knock);
        return line;
    };

    const patterns = [
        /^Probujesz otworzyc .*wrota.*/,
        /^Probujesz otworzyc .*drzwiczki.*/,
        /^Probujesz otworzyc .*krate.*/,
        /^Probujesz otworzyc .*brame.*/,
        /^Probujesz otworzyc niewielka furtke.*/,
    ];

    patterns.forEach(p => client.Triggers.registerTrigger(p, showMessage, "gates"));
}

