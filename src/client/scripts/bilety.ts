import Client from "../Client";

/**
 * A ticket purchase and hand-over for every teammate standing on the location - the core of the
 * /bilety alias, without the wem/wlm money wrap. Callers splice this into their own sequence:
 * the alias below wraps it itself, while the transport board bind already holds a wem...wlm pair
 * of its own and must not gain a second one.
 */
export function teamTicketCommands(client: Client): string[] {
    return client.TeamManager.getTeamObjectsOnLocation()
        .flatMap(t => ["kup bilet", `daj bilet ob_${t.num}`]);
}

export default function initBilety(
    client: Client,
    aliases?: { pattern: RegExp; callback: Function }[]
) {
    if (!aliases) return;

    aliases.push({
        pattern: /^\/bilety$/,
        callback: async () => {
            const tickets = teamTicketCommands(client);

            if (tickets.length === 0) {
                client.println("Brak czlonkow druzyny na lokacji.");
                return;
            }

            await client.sendCommand(["wem", ...tickets, "wlm"].join(";"));
        },
    });
}
