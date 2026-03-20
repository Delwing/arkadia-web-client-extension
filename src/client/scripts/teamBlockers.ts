import Client from "../Client";
import blockers from '../blockers.json'
import {AnsiAwareBuffer} from "@client/ansi/FormatState.ts";
import {isDirection} from "@shared/map/directions";
import {stripPolishCharacters} from "../stripPolishCharacters";

const MOVE_DEPENDENT_BLOCKERS = new Set([
    "nie pozwoli ci zblizyc sie do drzwi.",
]);

const teamBlockerPatterns: RegExp[] = [
    /^Probujesz sie ruszyc na .*, jednak pajecze sieci, w ktore sie w miedzyczasie zaplatal.s, uniemozliwiaja ci to\.$/,
    /^Probujesz sie ruszyc przed siebie, jednak pajecze sieci, w ktore sie w miedzyczasie zaplatales, uniemozliwiaja ci to\.$/,
    /^Ruszasz razno na .+, lecz geste pajeczyny zagradzaja ci droge\.$/,
    /^Ogromne stwory przysiadaja przed brama, blokujac do niej dostepu\.$/,
    /^Ruszasz w dalsza droge ale nagle stajesz w pol kroku\. Masz dziwne odczucie, ze w tym miejscu grozi ci jakies niebezpieczenstwo\.$/,
    /^Nagle czujesz, ze cos oplata twa noge\.\.\. ziemia w zawrotnym tepie zamienia sie miejscami z niebem\. Zwisasz teraz, przywiazany za noge rzemieniem, dyndajac jak kukielka\.$/,
    /^Probujesz otworzyc polyskujace wrota, ale nie udaje ci sie to\.$/,
    /^Probujesz isc naprzod, ale sliski lod sprawia, ze wywracasz sie na nim\.$/,
    /^Zbyt raptowanie probujesz znowu ruszyc na .*, przez co tylko jeszcze bardziej placzesz sobie nogi w gestwinie pajeczych sieci\.$/
];

function createBlockerHandler(client: Client) {
    return (line: AnsiAwareBuffer) => {
        if (!client.TeamManager.isInAnyTeam()) {
            client.Map.moveBack();
            return line;
        }
        if (client.TeamManager.isLeader()) {
            client.Map.moveBack();
            return line;
        }
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

    let lastCommandWasMove = false;

    client.registerCommandHook("teamBlockers", (command) => {
        let cmd = stripPolishCharacters(command);
        if (cmd.startsWith('przemknij z druzyna ')) cmd = cmd.substring(20);
        else if (cmd.startsWith('przemknij ')) cmd = cmd.substring(10);
        else if (cmd.startsWith('jedz na ')) cmd = cmd.substring(8);
        lastCommandWasMove = isDirection(cmd);
        return undefined;
    });

    // Register team blocker patterns (RegExp)
    teamBlockerPatterns.forEach(pattern => {
        client.Triggers.registerTrigger(pattern, handler, 'blocker');
    });

    // Register blockers from blockers.json
    blockers.forEach(blocker => {
        if (MOVE_DEPENDENT_BLOCKERS.has(blocker.pattern)) return;
        const blockerPattern = blocker.type === "1" ? new RegExp(blocker.pattern) : blocker.pattern;
        client.Triggers.registerTrigger(blockerPattern, handler, 'blocker');
    });

    // Move-dependent blockers: only moveBack if preceded by a direction command
    for (const pattern of MOVE_DEPENDENT_BLOCKERS) {
        client.Triggers.registerTrigger(pattern, (line: AnsiAwareBuffer) => {
            if (lastCommandWasMove) {
                return handler(line);
            }
            return line;
        }, 'blocker');
    }
}
