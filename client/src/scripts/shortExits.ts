import Client from "../Client";
import { SKIP_LINE } from "../ControlConstants";
import { colorString, findClosestColor } from "../Colors";

const ORANGE = findClosestColor('#ffa500');

const polishToEnglish: Record<string, string> = {
    polnoc: "north",
    poludnie: "south",
    wschod: "east",
    zachod: "west",
    "polnocny-wschod": "northeast",
    "polnocny-zachod": "northwest",
    "poludniowy-wschod": "southeast",
    "poludniowy-zachod": "southwest",
    dol: "down",
    gora: "up",
    gore: "up",
};

const longToShort: Record<string, string> = {
    north: "n",
    south: "s",
    east: "e",
    west: "w",
    northeast: "ne",
    northwest: "nw",
    southeast: "se",
    southwest: "sw",
    up: "u",
    down: "d",
};

export function toShort(dir: string): string {
    const long = polishToEnglish[dir] ?? dir.toLowerCase();
    return longToShort[long] ?? dir;
}

export function parseExitString(str: string): string[] {
    return str
        .replace(/(?: i | oraz | albo | lub )/g, ",")
        .split(/,\s*/)
        .map(s => s.trim())
        .filter(Boolean);
}

const EXIT_PATTERNS: RegExp[] = [
    /^(?:Jest|Sa) tutaj .* widoczn(?:e|ych) wyjsc(?:|ia|ie): (.*)\.$/,
    /^W gestych ciemnosciach dostrzegasz .* (?:wiodacy|rozwidlajacy sie) na (.*)\.$/,
    /^Korytarze jaskini ciagna sie na (.*)\.$/,
    /^Trakt wiedzie na ([^.]+)\.$/,
    /[tT]rakt rozgalezia sie na (.*)\.$/,
    /^(?:Szlak|Sciezka) prowadzi tutaj w .* kieru.*: (.*)\.$/,
    /^Linia brzegowa ciagnie sie na (.*)\.$/,
    /^Wedrowke (?:skrajem lasu|po karczowisku|po lesie|przez rozlegle laki) mozesz kontynuowac udajac sie na (.*)\.$/,
    /^Wijaca sie miedzy skalami, gorska sciezka prowadzi na (.*)\.$/,
    /^Wydeptane w kukurydzy sciezki prowadza na (.*)\.$/,
    /^Wyjscia prowadza tutaj w .* kierunkach: (.*)\.$/,
    /^Wykopany w ziemi tunel rozgalezia sie tutaj, zas jego odnogi wioda na (.*)\.$/,
    /^Wykopany w ziemi tunel wiedzie w dwoch kierunkach: (.*)\.$/,
    /^Mozesz sie stad udac na (.*)\.$/,
    /^Mozesz skierowac lodz na (.*)\.$/,
    /^Trakt jest zasypany glazami i mozna podazac nim tylko w jednym kierunku, na (.*)\.$/,
    /^Mozesz podazac traktem na (.*), w strone fortu\.$/,
    /^Mozesz stad poplynac na (.*)\.$/,
    /^W mroku nocy dostrzegasz .* widoczne wyjsci.: (.*)\.$/,
    /^Tunel ciagnie sie na (.*)\.$/,
    /^Jaskinie ciagna sie na (.*)\.$/,
    /^Tunele ciagna sie na (.*)\.$/,
    /^Rozpadlina ciagnie sie na (.*)\.$/,
    /^W gestych ciemnosciach dostrzegasz sciezke wiodaca na (.*)\.$/,
    /^Ulice krzyzuja sie tutaj, prowadzac w trzech kierunkach: (.*)\.$/,
    /^Ulica prowadzi na (.*)\.$/,
    /^Wykop konczy sie tutaj, zas jedyne widoczne przejscie prowadzi na (.*)\.$/,
    /^Wykopany w ziemi tunel rozgalezia sie tutaj, zas jego odnogi wioda na (.*)\.$/,
];

export default function initShortExits(client: Client) {
    let enabled = false;

    client.addEventListener('settings', (event: CustomEvent) => {
        const settings = event.detail || {};
        enabled = !!settings.shortenExits;
    });

    const callback = (_r: string, _l: string, m: RegExpMatchArray) => {
        if (!enabled) return undefined;
        const dirs = parseExitString(m[1]).map(toShort);
        if (dirs.length === 0) return undefined;
        const str = "\n-----:" + dirs.map(d => " " + d.toUpperCase()).join("") + "\n";
        client.println(colorString(str, ORANGE));
        return SKIP_LINE;
    };

    client.Triggers.registerTrigger(EXIT_PATTERNS, callback, 'shortExits');
}
