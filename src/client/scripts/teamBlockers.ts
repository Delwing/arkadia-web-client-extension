import Client from "../Client";

const teamBlockerPatterns: RegExp[] = [
    /^Probujesz sie ruszyc na .*, jednak pajecze sieci, w ktore sie w miedzyczasie zaplatal.s, uniemozliwiaja ci to\.$/,
    /^Ogromne stwory przysiadaja przed brama, blokujac do niej dostepu\.$/,
    /^Ruszasz w dalsza droge ale nagle stajesz w pol kroku\. Masz dziwne odczucie, ze w tym miejscu grozi ci jakies niebezpieczenstwo\.$/,
    /^Nagle czujesz, ze cos oplata twa noge\.\.\. ziemia w zawrotnym tepie zamienia sie miejscami z niebem\. Zwisasz teraz, przywiazany za noge rzemieniem, dyndajac jak kukielka\.$/,
    /^Probujesz otworzyc polyskujace wrota, ale nie udaje ci sie to\.$/,
    /^Probujesz isc naprzod, ale sliski lod sprawia, ze wywracasz sie na nim\.$/,
    /^Zbyt raptowanie probujesz znowu ruszyc na .*, przez co tylko jeszcze bardziej placzesz sobie nogi w gestwinie pajeczych sieci\.$/
];

export default function initTeamBlockers(client: Client) {
    teamBlockerPatterns.forEach(pattern => {
        client.Triggers.registerTrigger(pattern, (line) => {
            if (!client.TeamManager.isInAnyTeam()) {
                return line;
            }
            if (client.TeamManager.isLeader()) {
                return line;
            }
            if (!client.Map.isBlockable) {
                return line;
            }
            client.Map.moveBack();
            client.Map.setBlockable(false);
            return line;
        }, 'blocker');
    });
}
