import Client from "../Client";
import blockers from '../blockers.json'
import {AnsiAwareBuffer} from "@client/ansi/FormatState.ts";
import teamBlockerUpstream from "./team_blocker_patterns.json";
import {upstreamPatterns, type UpstreamTrigger} from "./upstreamTriggers";

const teamBlockerPatterns: (string | RegExp)[] = [
    // Generated from upstream Arkadia.xml by scripts/extract-upstream-triggers.mjs.
    ...upstreamPatterns(teamBlockerUpstream as UpstreamTrigger[], "trigger_func_mapper_blockers_blocker_team_dependent"),
    // Client-only additions, not in upstream's team-dependent blocker.
    /^Probujesz sie ruszyc przed siebie, jednak pajecze sieci, w ktore sie w miedzyczasie zaplatales, uniemozliwiaja ci to\.$/,
    /^Ruszasz razno na .+, lecz geste pajeczyny zagradzaja ci droge\.$/,
    /nie pozwoli ci zblizyc sie do drzwi\./
];

function createBlockerHandler(client: Client) {
    return (line: AnsiAwareBuffer) => {
        if (!client.Map.isBlockable) {
            return line;
        }
        client.Map.moveBack();
        client.Map.setBlockable(false);
        return line;
    };
}

export default function initTeamBlockers(client: Client) {
    const handler = createBlockerHandler(client);

    // Register team blocker patterns (RegExp)
    teamBlockerPatterns.forEach(pattern => {
        client.Triggers.registerTrigger(pattern, handler, 'blocker');
    });

    // Register blockers from blockers.json
    blockers.forEach(blocker => {
        const blockerPattern = blocker.type === "1" ? new RegExp(blocker.pattern) : blocker.pattern;
        client.Triggers.registerTrigger(blockerPattern, handler, 'blocker');
    });
}
