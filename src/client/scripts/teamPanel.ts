import Client from "../Client";

interface LocationObject {
    desc?: string;
    __category?: "player" | "team" | "rest" | "rest-noncombat";
}

/**
 * Returns the team members that are not present on the current location.
 * A member counts as present if they appear as a "team" object, or as the
 * player themselves ("player" category).
 */
export function computeMissingMembers(teamMembers: string[], objects: LocationObject[]): string[] {
    const teamObjects = objects.filter(o => o.__category === "team");
    const missing: string[] = [];
    for (const memberName of teamMembers) {
        const lower = memberName.toLowerCase();
        const isPresent = teamObjects.some(o => o.desc?.toLowerCase().includes(lower));
        const isSelf = objects.some(o => o.__category === "player" && o.desc?.toLowerCase().includes(lower));
        if (!isPresent && !isSelf) {
            missing.push(memberName);
        }
    }
    return missing;
}

/**
 * Computes team presence on the current location and pushes it to the
 * TeamPanel footer component via the "teamPanelStatus" event. The footer
 * element itself (visibility / order) is managed through the UI footer
 * component settings ("Interfejs - elementy stopki"); this script only
 * supplies the data. Ported from the standalone mc plugin.
 */
export default function initTeamPanel(client: Client) {
    let lastSignature = "";

    const update = () => {
        const teamMembers = client.TeamManager.getTeamMembers();
        const teamSize = teamMembers.length;
        const missing = teamSize === 0
            ? []
            : computeMissingMembers(teamMembers, client.ObjectManager.getObjectsOnLocation());

        const signature = `${teamSize}|${missing.join(",")}`;
        if (signature === lastSignature) {
            return;
        }
        lastSignature = signature;
        client.sendEvent("teamPanelStatus", { teamSize, missing });
    };

    client.on("gmcp.objects.nums", update);
    client.on("gmcp.objects.data", update);
    client.on("teamChange", update);

    client.on("client.disconnect", () => {
        lastSignature = "";
        client.sendEvent("teamPanelStatus", { teamSize: 0, missing: [] });
    });

    update();
}
