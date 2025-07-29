import Client from "../Client";
import { colorString, findClosestColor } from "../Colors";

export default function initNoWeaponAlert(client: Client) {
    const tag = 'no-weapon-alert';
    const RED = findClosestColor("#ff0000");
    const patterns = [
        /(Nie udaje ci sie trafic|Probujesz trafic|Ledwo muskasz|Lekko ranisz) (?<target>.+?) (lew\w+|praw\w+) (piescia|kolanem|stopa|lokciem|rekawica|butem)/,
        /^Wykonujesz zamach ((lewym|prawym) butem) mierzac w (?<target>.+?), lecz t(a|en) paruje go .*\.$/
    ];

    let timer: number | null = null;

    function alert(_r: string, _l: string, m: RegExpMatchArray): undefined {
        if (timer !== null) {
            return;
        }
        timer = window.setTimeout(() => {
            timer = null;
        }, 5000);
        const target = m.groups?.target ? ` ${m.groups.target}` : '';
        const msg = colorString(` >> Walczysz bez broni${target ? ` z${target}` : ''}!`, RED);
        client.println(msg);
        return;
    }

    patterns.forEach(p => client.Triggers.registerTrigger(p, alert, tag));
}
