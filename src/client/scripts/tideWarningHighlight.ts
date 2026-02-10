import Client from "../Client";
import { FormatStateSnapshot } from "@client/ansi/FormatState";

export default function initTideWarningHighlight(client: Client) {
    const FORMAT: FormatStateSnapshot = {
        foreground: {space: "hex", color: "#ffffaa"},
        dim: {startOpacity: 1, endOpacity: 0.5, duration: 2000, easing: 'ease-in-out'},
    };
    const patterns = [
        /^[ >]*Pod twoimi stopami wzbieraja coraz wieksze strumyki, a po chwili czujesz, ze poziom wody zaczyna sie powoli podnosic\. Wkrotce zacznie sie przyplyw\.$/,
        /^[ >]*Poziom wody powoli sie podnosi\. Coraz bardziej zbliza sie przyplyw\.$/,
        /^[ >]*Poziom wody coraz gwaltowniej sie podnosi\. Fale przyplywu moga nadejsc w kazdej chwili!$/,
        /^[ >]*Poziom wody wyraznie opada\. Coraz bardziej zbliza sie pora odplywu\.$/,
        /^[ >]*Poziom wody coraz gwaltowniej opada\. Morskie fale moga sie cofnac niemal w kazdej chwili!$/,
        /^[ >]*Falujace morze wolno, acz systematycznie obniza swoj poziom, oddajac swiatu zagarniety lad\.$/,
    ];
    patterns.forEach(p => {
        client.Triggers.registerTrigger(p, (line) => {
            line.color([0, line.length], FORMAT);
            return line;
        }, "tide-warning-highlight");
    });
}


// Szczyt fali chwile balansuje, a nastepnie z duza szybkoscia przechyla sie, zalewajac wszystko w dole, w tym rowniez ciebie.
// Poziom morza gwaltownie opada. Fale gniewnie pienia sie bryzgajac dookola kropelkami wody. Pod powierzchnia widac, jak wszystkie wodorosty, kawalki drewna, a nawet wieksze kamienie sa ciagniete w jednym kierunku - na zachod.