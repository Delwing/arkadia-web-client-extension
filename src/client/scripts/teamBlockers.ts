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
    /^Zbyt raptowanie probujesz znowu ruszyc na .*, przez co tylko jeszcze bardziej placzesz sobie nogi w gestwinie pajeczych sieci\.$/,
    /nie pozwoli ci zblizyc sie do drzwi\./
];

/**
 * Blockers the game also prints for commands that are not steps - a typo gets
 * "Nie ma takiej komendy" too - so the shadow queue only takes them as a refused
 * step when nothing else was sent since.
 */
const AMBIGUOUS_BLOCKERS = new Set<string>(["Nie ma takiej komendy. Wpisz"]);

function createBlockerHandler(client: Client, ambiguous = false) {
    return (line: AnsiAwareBuffer) => {
        // The shadow queue hears every blocker, not only the first since the last room.info,
        // and rejects the step itself - the map's step back is not news to it.
        client.Map.stepShadow.inStepWithMap(() => {
            if (client.Map.isBlockable) {
                client.Map.moveBack();
                client.Map.setBlockable(false);
            }
        });
        client.Map.stepShadow.reject('blokada', {ambiguous});
        return line;
    };
}

export default function initTeamBlockers(client: Client) {
    const handler = createBlockerHandler(client);
    const ambiguousHandler = createBlockerHandler(client, true);

    // Register team blocker patterns (RegExp)
    teamBlockerPatterns.forEach(pattern => {
        client.Triggers.registerTrigger(pattern, handler, 'blocker');
    });

    // Register blockers from blockers.json
    blockers.forEach(blocker => {
        const blockerPattern = blocker.type === "1" ? new RegExp(blocker.pattern) : blocker.pattern;
        client.Triggers.registerTrigger(blockerPattern, AMBIGUOUS_BLOCKERS.has(blocker.pattern) ? ambiguousHandler : handler, 'blocker');
    });
}
