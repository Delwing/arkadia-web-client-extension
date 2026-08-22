import Client from "../Client";
import { formatLabel } from "../functionalBind";

export default function initBinds(client: Client, aliases?: { pattern: RegExp; callback: Function }[]) {
    function printBinds() {
        const main = client.FunctionalBind.getLabel();
        const gatesLabel = client.FunctionalBind.getCategoryLabel('gates');
        const transportLabel = client.FunctionalBind.getCategoryLabel('transport');
        const lootLabel = client.FunctionalBind.getCategoryLabel('loot');
        const lamp = formatLabel(client.lampBind);
        const attack = formatLabel(client.attackBind);
        const support = formatLabel(client.supportBind);
        const moveMode = formatLabel(client.moveModeBind);
        const lines = [
            `Domy\u015Blny: ${main}`,
        ];
        if (gatesLabel !== main) {
            lines.push(`Wrota: ${gatesLabel}`);
        }
        if (transportLabel !== main) {
            lines.push(`Transport: ${transportLabel}`);
        }
        if (lootLabel !== main) {
            lines.push(`Zbieranie z cial: ${lootLabel}`);
        }
        lines.push(
            `Atakuj: ${attack}`,
            `Nape\u0142nij lamp\u0119: ${lamp}`,
            `Wesprzyj: ${support}`,
            `Tryb ruchu: ${moveMode}`,
        );
        (client.customBinds || []).forEach(cb => {
            lines.push(`${cb.command}: ${formatLabel(cb)}`);
        });
        client.println(lines.join("\n"));
    }

    if (aliases) {
        aliases.push({ pattern: /\/binds$/, callback: printBinds });
    }
}
