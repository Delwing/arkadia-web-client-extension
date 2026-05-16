import Client from "../Client";

export default function initBilety(
    client: Client,
    aliases?: { pattern: RegExp; callback: Function }[]
) {
    if (!aliases) return;

    aliases.push({
        pattern: /^\/bilety$/,
        callback: async () => {
            const teammates = client.TeamManager.getTeamObjectsOnLocation();

            if (teammates.length === 0) {
                client.println("Brak czlonkow druzyny na lokacji.");
                return;
            }

            const parts: string[] = ["wem"];
            for (const t of teammates) {
                parts.push("kup bilet");
                parts.push(`daj bilet ob_${t.num}`);
            }
            parts.push("wlm");

            await client.sendCommand(parts.join(";"));
        },
    });
}
