import Client from "../Client";
import { colorString, createColorFormat } from "@modules/core/Colors";
import { getShortDir } from "@shared/map";
import {AnsiAwareBuffer} from "../ansi/FormatState";
import { characterStorage } from "@modules/core/storage";
import { defaultSettings } from "@modules/core/defaultSettings";

export { getShortDir as toShort };

export function parseExitString(str: string): string[] {
    return str
        .replace(/ i | oraz | albo | lub /g, ",")
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
    let exitsPrefix = defaultSettings.shortExitsPrefix ?? '-----:';
    let exitsSeparator = defaultSettings.shortExitsSeparator ?? ' ';
    let exitsColor: any = createColorFormat(defaultSettings.shortExitsColor ?? '#ffa500');
    let exitsBackgroundColor = defaultSettings.shortExitsBackgroundColor ?? 'transparent';

    const createExitsFormat = (fgHex: string, bgHex: string) => {
        const format: any = {
            foreground: { space: 'hex', color: fgHex },
        };
        if (bgHex && bgHex !== 'transparent') {
            format.background = { space: 'hex', color: bgHex };
        }
        return format;
    };

    const applySettings = (settings: any) => {
        const detail = settings ?? defaultSettings;
        enabled = !!detail.shortenExits;
        exitsPrefix = detail.shortExitsPrefix ?? defaultSettings.shortExitsPrefix ?? '-----:';
        exitsSeparator = detail.shortExitsSeparator ?? defaultSettings.shortExitsSeparator ?? ' ';
        exitsBackgroundColor = detail.shortExitsBackgroundColor ?? defaultSettings.shortExitsBackgroundColor ?? 'transparent';
        exitsColor = createExitsFormat(
            detail.shortExitsColor ?? defaultSettings.shortExitsColor ?? '#ffa500',
            exitsBackgroundColor,
        );
    };

    const initialSettings = characterStorage.get('settings');
    if (initialSettings) {
        applySettings(initialSettings);
    }

    characterStorage.onChange('settings', applySettings);

    const callback = (line: AnsiAwareBuffer, matches: RegExpMatchArray) => {
        if (!enabled) return line;
        if (!matches) return line;
        const dirs: string[] = parseExitString(matches[1]).map(getShortDir);
        if (dirs.length === 0) return line;
        const str = exitsPrefix + dirs.map(d => exitsSeparator + d.toUpperCase()).join('');
        return colorString(str, exitsColor);
    };

    client.Triggers.registerTrigger(EXIT_PATTERNS, callback, 'shortExits');
}
