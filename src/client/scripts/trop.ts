import Client from "../Client";

const POINTS_DOWN_PATTERN = /^\[?(.*)]? wskazuje na dol\.$/;

export default function initTropBind(client: Client) {
    const tag = "tropBind";

    client.Triggers.registerTrigger(POINTS_DOWN_PATTERN, (triggerLine) => {
        const matches = triggerLine.matches.matches;
        if (!matches) return triggerLine;
        const name = matches[1]?.trim();
        if (!name) {
            return triggerLine;
        }

        if (client.TeamManager.isInTeam(name)) {
            client.FunctionalBind.set("trop");
        }

        return triggerLine;
    }, tag);
}
