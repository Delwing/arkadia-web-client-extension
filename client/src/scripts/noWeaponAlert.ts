import Client from "../Client";

export default function initNoWeaponAlert(client: Client) {
    const tag = 'no-weapon-alert';
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
        client.playSound('beep');
        client.println(` >> Walczysz bez broni${target ? ` z${target}` : ''}!`);
        return;
    }

    patterns.forEach(p => client.Triggers.registerTrigger(p, alert, tag));
}
