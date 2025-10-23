import Client from "../Client";

const POINTS_DOWN_PATTERN = /^\[?(.*)\]? wskazuje na dol\.$/;

export default function initTropBind(client: Client) {
    const tag = "tropBind";

    client.Triggers.registerTrigger(POINTS_DOWN_PATTERN, (_raw, _line, matches) => {
        const name = matches[1]?.trim();
        if (!name) {
            return undefined;
        }

        if (client.TeamManager.isInTeam(name)) {
            client.FunctionalBind.set("trop");
        }

        return undefined;
    }, tag);
}
