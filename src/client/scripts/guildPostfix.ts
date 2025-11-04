import Client from "../Client";
import { colorString, findClosestColor } from "@modules/core/Colors";
import TriggerLine from "../triggers/TriggerLine";

const SLATE_BLUE = findClosestColor("#6a5acd");
const ENEMY_RED = findClosestColor("#ff0000");

type GuildColorMap = Record<string, number | undefined>;

export default function initGuildPostfix(client: Client) {
    const tag = "guildPostfix";
    let guildColors: GuildColorMap = {};
    let enemyGuilds = new Set<string>();

    client.on('settings', (payload) => {
        const detail = (payload ?? {}) as { guildColors?: Record<string, string | undefined>; enemyGuilds?: string[] };
        const colors: Record<string, string | undefined> = detail.guildColors || {};
        const enemies: string[] = detail.enemyGuilds || [];
        guildColors = {};
        enemyGuilds = new Set(enemies);
        Object.entries(colors).forEach(([g, hex]) => {
            if (hex) {
                guildColors[g] = findClosestColor(hex);
            }
        });
    });

    function register(pattern: RegExp | string, guild: string) {
        client.Triggers.registerTrigger(pattern, (triggerLine) => {
            const raw = triggerLine.toAnsiString();
            const color = enemyGuilds.has(guild) ? ENEMY_RED : guildColors[guild] ?? SLATE_BLUE;
            return new TriggerLine(client.postfix(raw, colorString(` [${guild}]`, color)));
        }, tag);
    }

    register(/^Na szyi ma zawiazana .* ze znakiem czarnego gryfa\.$/, "KG");
    register(/Jego brzuszek wyglada/, "ZH");
    register(/^Jest dumnym wlascicielem .* brzucha\.$/, "ZH");
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
