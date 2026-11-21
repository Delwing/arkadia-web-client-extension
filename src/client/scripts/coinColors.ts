import Client from "../Client";
import {colorStringInLine} from "@client/Colors.ts";
import {COPPER_COLOR, GOLD_COLOR, MITHRIL_COLOR, SILVER_COLOR} from "../constants/colors";
import {FormatStateSnapshot} from "@client/ansi/FormatState.ts";

const alt = (words: string[]) => `(?:${words.join("|")})`;

// Nominative/accusative and genitive ("dwie zlote", "z pieciu zlotych")
const UNITS = alt([
    "jeden", "jedna", "jedno", "jednej", "jednego",
    "dwa", "dwie", "dwoch", "trzy", "trzech", "cztery", "czterech",
    "piec", "pieciu", "szesc", "szesciu", "siedem", "siedmiu",
    "osiem", "osmiu", "dziewiec", "dziewieciu",
]);
const TEENS = alt([
    "dziesiec", "dziesieciu",
    "jedenascie", "dwanascie", "trzynascie", "czternascie", "pietnascie",
    "szesnascie", "siedemnascie", "osiemnascie", "dziewietnascie",
    "jedenastu", "dwunastu", "trzynastu", "czternastu", "pietnastu",
    "szesnastu", "siedemnastu", "osiemnastu", "dziewietnastu",
]);
const TENS = alt([
    "dwadziescia", "trzydziesci", "czterdziesci",
    "piecdziesiat", "szescdziesiat", "siedemdziesiat", "osiemdziesiat", "dziewiecdziesiat",
    "dwudziestu", "trzydziestu", "czterdziestu",
    "piecdziesieciu", "szescdziesieciu", "siedemdziesieciu", "osiemdziesieciu", "dziewiecdziesieciu",
]);
const HUNDREDS = alt([
    "sto", "dwiescie", "trzysta", "czterysta",
    "piecset", "szescset", "siedemset", "osiemset", "dziewiecset", "stu",
]);
// Amounts the game gives without a number
const VAGUE = alt([
    "wiele", "wielu", "kilka", "kilku", "kilkanascie", "kilkunastu", "kilkadziesiat", "kilkudziesieciu",
    "kilkaset", "pare", "paru", "parenascie", "mnostwo", "duzo", "sporo", "troche",
    "setki", "setek", "tysiace", "tysiecy",
]);

const BELOW_HUNDRED = `(?:${TEENS}|${TENS}(?:\\s+${UNITS})?|${UNITS})`;
const NUMBER_WORDS = `(?:${HUNDREDS}(?:\\s+${BELOW_HUNDRED})?|${BELOW_HUNDRED})`;

/** How many coins: digits, a number in words (1-999) or a vague amount like "wiele" */
export const COIN_QUANTITY = `(?:\\d+|${NUMBER_WORDS}|${VAGUE})`;

// Singular and plural in every case the game uses: zlota, zlote, zlotej, zlotych, zlotymi
const ADJECTIVE_ENDING = "(?:a|e|ej|ych|ymi)";
// "monet" further on in the same sentence: "11 zlotych, 15 srebrnych i 8 miedzianych monet"
const FOLLOWED_BY_COINS = "(?=[\\w\\s,]*\\bmonet)";

const coinPattern = (stem: string) =>
    new RegExp(`(?:\\b${COIN_QUANTITY}\\s+)?\\b${stem}${ADJECTIVE_ENDING}\\b${FOLLOWED_BY_COINS}`, "i");

export default function initCoinColors(client: Client) {
    const tag = "coinColors";
    const patterns: { regex: RegExp; color: FormatStateSnapshot }[] = [
        {regex: coinPattern("mithrylow"), color: MITHRIL_COLOR},
        {regex: coinPattern("zlot"), color: GOLD_COLOR},
        {regex: coinPattern("srebrn"), color: SILVER_COLOR},
        {regex: coinPattern("miedzian"), color: COPPER_COLOR}
    ];
    patterns.forEach(({regex, color}) => {
        client.Triggers.registerTrigger(regex, (line, matches) => {
            return colorStringInLine(line, matches[0], color);
        }, tag);
    });
}
