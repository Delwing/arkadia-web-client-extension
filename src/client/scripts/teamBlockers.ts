import Client from "../Client";
import blockers from '../blockers.json'
import {AnsiAwareBuffer} from "@client/ansi/FormatState.ts";

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

    // Register team blocker patterns (RegExp)
    teamBlockerPatterns.forEach(pattern => {
        client.Triggers.registerTrigger(pattern, handler, 'blocker');
    });

    // Register blockers from blockers.json
    blockers.forEach(blocker => {
        const blockerPattern = blocker.type === "0" ? blocker.pattern : new RegExp(blocker.pattern);
        client.Triggers.registerTrigger(blockerPattern, handler, 'blocker');
    });
}
