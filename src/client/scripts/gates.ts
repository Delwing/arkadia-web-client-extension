import Client from "../Client";
import {AnsiAwareBuffer} from "@client/ansi/FormatState.ts";

export default function initGates(client: Client) {
    const knock = () => {
        client.sendCommand("uderz we wrota");
    };
    client.FunctionalBind.setCategory('gates', null, knock);

    const showMessage = (line: AnsiAwareBuffer) => {
        client.FunctionalBind.setCategory('gates', "uderz we wrota", knock, false);
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

