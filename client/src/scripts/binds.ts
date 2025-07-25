import Client from "../Client";
import { formatLabel } from "./functionalBind";

export default function initBinds(client: Client, aliases?: { pattern: RegExp; callback: Function }[]) {
    function printBinds() {
        const main = client.FunctionalBind.getLabel();
        const lamp = formatLabel(client.lampBind);
        const attack = formatLabel(client.attackBind);
        const support = formatLabel(client.supportBind);
        const lines = [
            `Domy\u015Blny: ${main}`,
            `Nape\u0142nij lamp\u0119: ${lamp}`,
            `Atak /z: ${attack}`,
            `Wesprzyj: ${support}`,
        ];
        client.println(lines.join("\n"));
    }

    if (aliases) {
        aliases.push({ pattern: /\/binds$/, callback: printBinds });
    }
}
