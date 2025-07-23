import Client from "../Client";
import { colorString, findClosestColor } from "../Colors";

const SLATE_BLUE = findClosestColor("#6a5acd");

export default function initGuildPostfix(client: Client) {
    const tag = "guildPostfix";
    function register(pattern: RegExp | string, guild: string) {
        client.Triggers.registerTrigger(pattern, (raw) => {
            return client.postfix(raw, colorString(` [${guild}]`, SLATE_BLUE));
        }, tag);
    }

    register(/^Na szyi ma zawiazana .* ze znakiem czarnego gryfa\.$/, "KG");
    register(/Jego brzuszek wyglada/, "ZH");
    register(/^ Na .* szyi, na skorzanym rzemieniu wisi .* elfi flet\.$/, "LE");
    register(/^Na biodrach ma zalozony .* krasnoludzki kilt .* klamra\.$/, "KGKS");
    register(/Jego bialy plaszcz symbolizuje przynaleznosc do Zakonu Rycerskiego Sigmara Mlotodzierzcy./, "ZS");
    register(/biala tunika zakonna symbolizuje/, "ZS");
    register(/Na zbroje ma narzucona zgrzebna szate zakonna./, "ZS");
    register(/na szyi nosi .* lancuch o najwiekszym ogniwie zwienczonym miniaturowa tarcza, na ktorej tle umieszczono skrzyzowany z waga kupiecka buzdygan\./, "GL");
    register(/pocieta jest .* wojownik/, "GL");
    register(/Przy pasie nosi bawoli rog/, "OHM");
    register(/ herb.* Rodziny Alderazzi/, "RA");
    register(/na ktorym wyryto otoczony czerwonymi rautami emblemat/, "WKS");
    register(/Klamre .* pasa zdobi/, "KM");
    register(/nieustepliwe niczym skelliganskie sztormy spojrzenie/, "KS");
    register(/Noszony.*pierscien.*Kupcow/, "CKN");
    register(/charakterystyczna dla mieszkancow Zajazdu/, "BK");
    register(/zamek ze znakiem Stowarzyszenia Gnomich Wynalazcow/, "SGW");
    register(/kubraczek, tradycyjny stroj Elfow z Gor Sinych/, "ES");
    register(/nosi piekna .* obrecz (?:wysadzana)?/, "OK");
    register(/^Nosi przypiety .* wiewiorczy ogon .* przynaleznosci do Komanda Scoia'tael\./, "SC");
}
