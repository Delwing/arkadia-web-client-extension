import Client from "../Client";
import { AnsiAwareBuffer } from "../ansi/FormatState";

export default function initNoWeaponAlert(client: Client) {
    const tag = 'no-weapon-alert';
    const patterns = [
        /(Nie udaje ci sie trafic|Probujesz trafic|Ledwo muskasz|Lekko ranisz|Ranisz|Powaznie ranisz|Bardzo ciezko ranisz|Masakrujesz) (?<target>.+?) (lew\w+|praw\w+) (piescia|kolanem|stopa|lokciem|rekawica|butem)/,
        /^Wykonujesz zamach ((lewym|prawym) butem) mierzac w (?<target>.+?), lecz t(a|en) paruje go .*\.$/
    ];

    let timer: number | null = null;

    function alert(line: any) {
        if (timer !== null) {
            return line;
        }
        timer = window.setTimeout(() => {
            timer = null;
        }, 5000);
        const msg = new AnsiAwareBuffer();
        msg.insert(0, ` >> Walczysz bez broni!`, {
            foreground: { space: "hex", color: "#ff0000" },
            rapidBlink: true
        });
        client.println(msg);
        return line;
    }

    patterns.forEach(p => client.Triggers.registerTrigger(p, alert, tag));
}
