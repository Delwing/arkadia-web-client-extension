import Client from "../Client";
import { colorString, findClosestColor } from "../Colors";
import { getShortDir } from "../utils/directions";
import appEventBus from "../events/app-event-bus";

const ORANGE = findClosestColor('#ffa500');

export { getShortDir as toShort };

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

    appEventBus.on('settings', (settings) => {
        enabled = settings.shortenExits;
    });

    const callback = (_r: string, _l: string, m: RegExpMatchArray) => {
        if (!enabled) return undefined;
        const dirs = parseExitString(m[1]).map(getShortDir);
        if (dirs.length === 0) return undefined;
        const str = "-----:" + dirs.map(d => " " + d.toUpperCase()).join("");
        return colorString(str, ORANGE);
    };

    client.Triggers.registerTrigger(EXIT_PATTERNS, callback, 'shortExits');
}
