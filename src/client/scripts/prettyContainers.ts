import Client from "../Client";
import {createColorFormat} from "@modules/core/Colors";
import loadMagicKeys from "./magicKeyLoader";
import loadMagics from "./magicsLoader";
import {getMagicsStore, MagicsFile} from "@modules/data/dataStores/magicsStore";
import {getKnowledgeStore, KnowledgeBookEntry, KnowledgeBookCategoryProgress, DEFAULT_KNOWLEDGE_CHARACTER_KEY} from "@modules/data/dataStores/knowledgeStore";
import { showBookTooltip, hideBookTooltip } from "@web/bookTooltip";
import { showContextMenu } from "@shared/dom/contextMenu";
import { getDativeCategoryName } from "../knowledgeCategories";
import {AnsiAwareBuffer} from "../ansi/FormatState";
import {
    MITHRIL_COLOR,
    GOLD_COLOR,
    SILVER_COLOR,
    COPPER_COLOR,
} from "../constants/colors";
import { polishNumberWords, polishNumberPattern } from "./polishNumberConverter";
import { characterStorage } from "@modules/core/storage";
import { defaultSettings } from "@modules/core/defaultSettings";
import { getZlomFormatting } from "./zlom";

const GROUP_NAME_COLOR = createColorFormat('#557C99');

export type GroupDefinition = {
    name: string;
    filter: (item: string) => boolean;
    priority?: number;
};

export type ContainerItem = {
    name: string;
    count: string | number;
};

export type ParsedContainer = {
    container: string;
    items: ContainerItem[];
};

export function createRegexpFilter(patterns: string[], isEndOfLine: boolean = false): (item: string) => boolean {
    const regs = "(" + patterns.map(pattern => "(^|\\s)" + pattern + (isEndOfLine ? "\\S*$" : "")).join("|") + ")"
    const regex = new RegExp(regs);
    return (item: string) => regex.test(item);
}


const defaultFilter: (item: ContainerItem) => boolean = () => true;
let filter = defaultFilter;
let magicAndKeysFilter = defaultFilter;

export function parseItems(content: string): ContainerItem[] {
    let rest = content.trim();
    rest = rest.replace(/\s+i\s+([^,]+)(\.)?$/, ', $1');
    rest = rest.replace(/\.$/, '');
    const parts = rest.split(/,\s*/).map(p => p.trim()).filter(p => p.length > 0);
    return parts.map(p => {
        // Try to match Polish numbers first (including compound numbers)
        const polishMatch = p.match(new RegExp(`^(wiele|${polishNumberPattern}|\\d+)\\s+(.*)`, 'i'));
        if (polishMatch) {
            const countStr = polishMatch[1].toLowerCase();
            let count: string | number;

            if (countStr === 'wiele') {
                count = 'wie';
            } else if (/^\d+$/.test(countStr)) {
                count = parseInt(countStr, 10);
            } else {
                // Convert Polish number to numeric value
                const normalizedCount = countStr.replace(/\s+/g, ' ');
                count = polishNumberWords[normalizedCount] || countStr;
            }

            return {count, name: polishMatch[2]};
        }
        return {count: 1, name: p};
    });
}

export function parseContainer(line: string | RegExpMatchArray): ParsedContainer | null {
    const matches: RegExpMatchArray | null =
        typeof line === 'string'
            ? defaultContainerPatterns.map(p => line.match(p)).find(Boolean) || null
            : line;
    if (matches && (matches.groups?.content || matches.groups?.container)) {
        const container = matches.groups?.container?.trim() ?? '';
        const content = matches.groups?.content ?? '';
        return {container, items: parseItems(content).filter(filter)};
    }
    return null;
}


export function categorizeItems(items: ContainerItem[], groups: GroupDefinition[]) {
    const result: Record<string, ContainerItem[]> = {};
    for (const g of groups) result[g.name] = [];
    result['inne'] = [];
    const hasPriority = groups.some(gr => gr.priority);
    const sorted = hasPriority
        ? [...groups].sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0))
        : groups;
    for (const item of items) {
        const g = sorted.find(gr => gr.filter(item.name));
        if (g) result[g.name].push(item); else result['inne'].push(item);
    }
    return result;
}

function padBuffer(buffer: AnsiAwareBuffer, len: number): AnsiAwareBuffer {
    const plainLen = buffer.text.length;
    const padding = Math.max(0, len - plainLen);
    if (padding > 0) {
        buffer.append(' '.repeat(padding), {}); // Explicitly use default/empty formatting for padding
    }
    return buffer;
}

function centerString(str: string, len: number): string {
    const total = Math.max(len, str.length);
    const left = Math.floor((total - str.length) / 2);
    const right = total - str.length - left;
    return ' '.repeat(left) + str + ' '.repeat(right);
}

export type TransformDefinition = {
    transform: (buffer: AnsiAwareBuffer, item: ContainerItem, group: string) => AnsiAwareBuffer;
};

export type FormatOptions = {
    columns?: number;
    padding?: number;
    transforms?: TransformDefinition[];
    maxWidth?: number;
};

function applyTransforms(
    item: ContainerItem,
    group: string,
    transforms: TransformDefinition[],
): AnsiAwareBuffer {
    let buffer = new AnsiAwareBuffer(item.name);
    for (const tr of transforms) {
        buffer = tr.transform(buffer, item, group);
    }
    return buffer;
}

export function formatTable(title: string, groups: Record<string, ContainerItem[]>, opts: FormatOptions = {}): AnsiAwareBuffer {
    let columns = opts.columns ?? 1;
    let leftPadding = opts.padding ?? 1;
    let rightPadding = opts.padding ?? 1;
    const activeTransforms = opts.transforms ?? defaultTransforms;
    const maxWidth = opts.maxWidth;

    const entries = Object.entries(groups).filter(([, it]) => it.length > 0);

    // First pass: apply transforms and create buffered items
    type BufferedItem = { count: string | number; buffer: AnsiAwareBuffer };
    const bufferedEntries: Array<[string, BufferedItem[]]> = entries.map(([groupName, items]) => {
        const bufferedItems = items.map(it => {
            const nameBuffer = applyTransforms(it, groupName, activeTransforms);
            return { count: it.count, buffer: nameBuffer };
        });
        return [groupName, bufferedItems];
    });

    // Calculate all line lengths for width computation
    const allLines = bufferedEntries.flatMap(([groupName, items]) => {
        const itemLengths = items.map(it => {
            const countStr = String(it.count).padStart(3, ' ');
            return countStr.length + 3 + it.buffer.text.length; // count + " | " + buffer length
        });
        return [groupName.length, ...itemLengths];
    });

    const computeColWidth = (lp: number, rp: number) => Math.max(
        title.length + lp + rp,
        ...allLines.map(l => l + lp + rp),
    );

    let colWidth = computeColWidth(leftPadding, rightPadding);

    const calcWidth = (cw: number) => columns * cw + (columns - 1) * 3 + 2;

    if (maxWidth) {
        while (calcWidth(colWidth) > maxWidth && leftPadding > 1) {
            leftPadding -= 1;
            colWidth = computeColWidth(leftPadding, rightPadding);
        }
        while (calcWidth(colWidth) > maxWidth && rightPadding > 1) {
            rightPadding -= 1;
            colWidth = computeColWidth(leftPadding, rightPadding);
        }
        if (calcWidth(colWidth) > maxWidth && columns > 1) {
            columns = 1;
        }
        if (calcWidth(colWidth) > maxWidth) {
            colWidth = Math.min(colWidth, maxWidth - 2);
        }
    }

    const padLeft = ' '.repeat(leftPadding);
    const padRight = ' '.repeat(rightPadding);

    const truncateBuffer = (buffer: AnsiAwareBuffer, len: number): AnsiAwareBuffer => {
        if (buffer.text.length <= len) return buffer;
        const truncated = buffer.clone();
        const cutLen = Math.max(0, len - 1);
        truncated.remove([cutLen, truncated.length]);
        truncated.append('…');
        return truncated;
    };

    const cell = (content: AnsiAwareBuffer | string): AnsiAwareBuffer => {
        const buffer = typeof content === 'string' ? new AnsiAwareBuffer(content) : content;
        const maxLen = colWidth - leftPadding - rightPadding;

        if (buffer.text.length > maxLen) {
            const split = buffer.text.split(' | ');
            if (split.length === 2) {
                const prefix = split[0] + ' | ';
                const available = maxLen - prefix.length;
                const prefixBuffer = new AnsiAwareBuffer(prefix);
                const matchIndex = buffer.text.indexOf(' | ') + 3;
                const suffixBuffer = new AnsiAwareBuffer(buffer.getSegments());
                suffixBuffer.remove([0, matchIndex]);
                const truncatedSuffix = truncateBuffer(suffixBuffer, available);
                prefixBuffer.appendBuffer(truncatedSuffix);
                return padBuffer(new AnsiAwareBuffer(padLeft).appendBuffer(prefixBuffer).append(padRight, {}), colWidth);
            } else {
                const truncated = truncateBuffer(buffer, maxLen);
                return padBuffer(new AnsiAwareBuffer(padLeft).appendBuffer(truncated).append(padRight, {}), colWidth);
            }
        }
        return padBuffer(new AnsiAwareBuffer(padLeft).appendBuffer(buffer).append(padRight, {}), colWidth);
    };

    const width = calcWidth(colWidth);
    const horiz = '-'.repeat(width - 2);
    const output = new AnsiAwareBuffer();

    output.append(`/${horiz}\\\n`);
    output.append(`|${centerString(title, width - 2)}|\n`);
    output.append(`+${horiz}+\n`);

    // Second pass: render output using buffered items
    for (let row = 0; row < bufferedEntries.length; row += columns) {
        const pair = bufferedEntries.slice(row, row + columns);

        // group names
        const gLine = new AnsiAwareBuffer('|');
        for (let c = 0; c < columns; c++) {
            const grp = pair[c];
            const groupName = grp ? grp[0] : '';
            const groupBuffer = new AnsiAwareBuffer(groupName);
            if (groupName) {
                groupBuffer.color([0, groupBuffer.length], GROUP_NAME_COLOR);
            }
            gLine.appendBuffer(cell(groupBuffer));
            if (c !== columns - 1) {
                gLine.append(' | ');
            }
        }
        gLine.append('|');
        output.appendBuffer(gLine);
        output.append('\n');
        output.append(`+${horiz}+\n`);

        const maxItems = Math.max(...pair.map(([, _items]) => _items.length));
        for (let i = 0; i < maxItems; i++) {
            const rowLine = new AnsiAwareBuffer('|');
            for (let c = 0; c < columns; c++) {
                const grp = pair[c];
                const bufferedItem = grp && grp[1][i];
                if (bufferedItem) {
                    const itemBuffer = new AnsiAwareBuffer(`${String(bufferedItem.count).padStart(3, ' ')} | `);
                    itemBuffer.appendBuffer(bufferedItem.buffer);
                    rowLine.appendBuffer(cell(itemBuffer));
                } else {
                    rowLine.appendBuffer(cell(''));
                }
                if (c !== columns - 1) {
                    rowLine.append(' | ');
                }
            }
            rowLine.append('|');
            output.appendBuffer(rowLine);
            output.append('\n');
        }
        output.append(`+${horiz}+\n`);
    }

    // Replace last border
    const lastNewline = output.text.lastIndexOf('\n');
    const lastLineStart = output.text.lastIndexOf('\n', lastNewline - 1) + 1;
    output.remove([lastLineStart, output.length]);
    output.append(`\\${horiz}/`);

    return output;
}

export function prettyPrintContainer(
    matches: RegExpMatchArray,
    columns = 1,
    title = 'POJEMNIK',
    padding = 1,
    maxWidth?: number,
): AnsiAwareBuffer {
    const parsed = parseContainer(matches);
    if (!parsed) return new AnsiAwareBuffer('');
    const categorized = categorizeItems(parsed.items, defs);
    const tableTitle = title || parsed.container;
    filter = defaultFilter;
    const result = formatTable(tableTitle, categorized, {columns, padding, maxWidth});
    plugLinks = false;
    return result;
}


const defaultContainerPatterns: RegExp[] = [
    /^Otwart[yae] (?<container>.+? (?:plecak|torba|sakwa|sakiewka|szkatulka|wor|worek))(?: z .*?)? zawiera (?<content>.*)\.$/i,
    /^Otwarty .+? (?<container>kosz(?:|yk)) zawiera (?<content>.*)\.$/i,
    /^Otwierasz na chwile (?<container>.+? (?:plecak|torbe|sakwe|sakiewke|szkatulke|wor|worek)), sprawdzajac zawartosc\. W srodku dostrzegasz (?<content>.*)\.$/i,
    /^Uwaznie ogladasz zawartosc (?<container>.+?)\. W srodku dostrzegasz (?<content>.*)\.$/,
    /^Rozwiazujesz na chwile rzemyk, sprawdzajac zawartosc swojej (?<container>.+? sakiewki).+?\. W srodku dostrzegasz (?<content>.*)\.$/,
    /^W (?<container>skrzyniach) zauwazasz miedzy innymi (?<content>.*)\.$/,
    /^W .+? (?<container>skrzyni|kufrze|skrzynce) zauwazasz miedzy innymi (?<content>.*)\.$/,
    /^Otwarty .+? (?<container>kosz(?:|yk)) zawiera (?<content>.*)\.$/,
    /^Na (?<container>stojakach) zauwazasz miedzy innymi (?<content>.*)\.$/,
    /^(?<container>.+? (?:skrzynia|kufer|komoda|stojak|biblioteczka|kuferek|skrzynka|regal|szkatula))(?:| z okuciami| depozytowa) zawiera (?<content>.*)\.$/,
    /^Wsrod pedantycznego porzadku w (?<container>szafie) zauwazasz miedzy innymi (?<content>.*)\.$/,
    /^Otwart[ay] (?<container>[a-z- ]+ (?:koszyk|szafa|sejf|misa|sarkofag|sarkofag z kamiennych plyt)) zawiera (?<content>.*)\.$/,
    /^Narozna (?<container>etazerka) zawiera: (?<content>.*)\.$/,
    /^Dostrzegasz na (?:nim|niej) jeszcze (?<content>.*)\.$/,
    /^Drewniany okuty (?<container>stelaz) zawiera (?<content>.*)\.$/,
    /^Dwukonny czerwony (?<container>powoz) porzucony na poboczu zawiera (?<content>.*)\.$/,
    /^(?:\w+ ){1,2}(?<container>sekretarzyk|kabinet) zawiera (?<content>.*)\.$/
];

const weapons = ["darda", "dardy", "multon", "kord", "puginal", "gladius", "topor", "berdysz", "siekier", "czekan",
    "oskard", "kilof", "tasak", "tabar", "nadziak", "macan", "miecz", "sihill", "drannach", "szabl", "szabel", "rapier",
    "scimitar", "katzbalger", "stilett", "pal", "sztylet", "halabard", "falchion", "mlot", "obusz", "wloczni", "pik[ei]",
    "noz", "maczug", "morgenstern", "kordelas", "mizerykordi", "buzdygan", "korbacz", "gal[ae]z(?!k) ", "bulaw", "drag",
    "kiscien", "nog[ai] stolow", "dag[ai]", "wloczni[aei]", "floret", "wekier", "walek", "kostur", "kos[aye]", "szponton",
    "partyzan", "glewi", "gizarm", "dzid", "naginat", "rohatyn", "korsek", "cep", "trojz[ea]b", "ronkon", "runk",
    "flamberg", "poltorak", "bulat", "nimsz", "szamszir", "lami", "schiavon", "lewak", "sierp", "lask[^o]", "wid[el]",
    "saif", "koncerz", "kij", "espadon", "claymor", "cinquend", "szpad", "karabel", "jatagan", "baselard", "katar",
    "bastard", "kafar", "kindzal", "harpun", "kotwic", "kadzielnic", "lancet", "ostrz", "berl", "chepesz",
    "spis( |$|y|e|a)", "talwar", "dluto", "pejcz", "kanczug", "parazonium", "lancuch", "kropacz", "piernacz", "estok",
    "bosak", "fink[aei]", "parazoni", "tulich", "navaj", "smocz.+ pazur", "chalkochidon"]
const shields = ["tarcz", "puklerz", "pawez", "luskow. pancern. skorup. zolwia"]
const torso = ["brygantyn", "napiersnik", "kirys", "kolczug", "karacen", "kaftan", "tunik", "zbroj", "bajdan[ay]",
    "anim[eay]", "kozus", "kurt", "kamizel", "becht", "pancerz", "zbro. plytow", "polpancerz", "nabrzusznik", "bajdan",
    "aketo"]
const head = ["helm", "burgonet", "misiurk", "kaptur", "morion", "basinet", "salad", "przylbic", "diadem", "szyszak",
    "narbut[ay]", "armet", "casquett", "czapk", "beret", "turban", "gigantyczn. wzmacnian. czaszk", "barbut", "kapalin",
    "koron[^k]", "klobuk"]
const legs = ["nagolennik", "spoden", "nogawic", "buty", "butow", "trzewik", "spodni", "spodnic", "naudziak", "sandal",
    "nakolannik", "nabiodr", "pantofel", "muszkieter"]
const hands = ["nareczak", "naramiennik", "rekawic", "karwasz"]
const wear = ["futro", "kubraczek", "koszul", "sukni", "sukien", "plaszcz", "peleryn", "tog", "szat",
    "bloniaste skrzydl", "chust", "pas( |$|y)", "gemm", "obroz", "szat", "kolnierz", "dublet", "kapelusz", "przepask",
    "wams", "oficer[ek]", "bigwant", "calun", "kapuz", "bluzk", "gorset", "kabat", "szal", "tiar", "tocz[ek]", "peruk",
    "kolpak", "opask", "wian[ek]"]
const jewelery = ["pierscien(?!iowa)", "naszyjnik", "bransolet", "spink", "talizman", "amulet", "kolczyk", "lancuszki",
    "\\bkoral(?!\\w*\\s+tablicz)\\w*", "wisior", "medalion", "lancusz", "brosz", "szarf", "koli[iae]", "sygnet", "obracze?k", "potrojn. sznur.+",
    "cwiek( |$|i|ow)(?!ana)", "serduszk", "grzebyk"]
const gems = ["obsydia(ny|now|n)", "labrado(ry|row|r)", "oliwi(ny|now|n)", "gaga(ty|tow|t)", "fluory(ty|tow|t)",
    "burszty(ny|now|n)", "ametys(ty|tow|t)", "kwar(ce|cow|c)", "rubi(ny|now|n)", "piry(ty|tow|t)", "serpenty(ny|now|n)",
    "per(ly|le|la|el)", "serpenty(ny|now|n)", "malachi(ty|tow|t)", "karneo(le|low|l)", "lazury(ty|tow|t)",
    "nefry(ty|tow|t)", "aleksandry(ty|tow|t)", "celesty(ny|now|n)", "monacy(ty|tow|t)", "azury(ty|tow|t)",
    "jaspi(sy|sow|s)", "onyk(sy|sow|s)", "turmali(ny|now|n)", "awentury(ny|now|n)", "turku(sy|sow|s)", "opa(li|le|l)",
    "kryszta(ly|low|l)", "hematy(ty|tow|t)", "rodoli(ty|tow|t)", "aga(ty|tow|t)", "jaskrawozolt.+ cytry(ny|now|n(?!e))",
    "apaty(ty|tow|t)", "kyani(ty|tow|t)", "akwamary(ny|now|n)", "ioli(ty|tow|t)", "diopsy(dy|dow|d)", "cyrko(ny|now|n)",
    "zoisy(ty|tow|t)", "grana(ty|tow|t)", "almandy(ny|now|n)", "ortokla(zy|zow|z)", "topa(zy|zow|z)", "tytani(ty|tow|t)",
    "diamen(ty|tow|t)", "szafi(ry|row|r)", "szmaragd(y|ow|u|em|zie)?( |$|,)", "chryzoberyl", "spinel", "chryzopraz", "rodochrozyt", "heliodor"]

const defs: GroupDefinition[] = [
    {name: "bronie", filter: createRegexpFilter(weapons)},
    {name: "korpus", filter: createRegexpFilter(torso)},
    {name: "tarcze", filter: createRegexpFilter(shields)},
    {name: "glowa", filter: createRegexpFilter(head)},
    {name: "rece", filter: createRegexpFilter(hands)},
    {name: "nogi", filter: createRegexpFilter(legs)},
    {name: "ubrania", filter: createRegexpFilter(wear)},
    {name: "bizuteria", filter: createRegexpFilter(jewelery)},
    {name: "kamienie", filter: createRegexpFilter(gems)},
]

const defaultTransforms: TransformDefinition[] = [
    { transform: (buffer, item) => {
        if (item.name.match("mithryl\\w+ monet")) {
            buffer.color([0, buffer.length], MITHRIL_COLOR);
        }
        return buffer;
    }},
    { transform: (buffer, item) => {
        if (item.name.match("zlot\\w+ monet")) {
            buffer.color([0, buffer.length], GOLD_COLOR);
        }
        return buffer;
    }},
    { transform: (buffer, item) => {
        if (item.name.match("srebrn\\w+ monet")) {
            buffer.color([0, buffer.length], SILVER_COLOR);
        }
        return buffer;
    }},
    { transform: (buffer, item) => {
        if (item.name.match("miedzian\\w+ monet")) {
            buffer.color([0, buffer.length], COPPER_COLOR);
        }
        return buffer;
    }},
    { transform: (buffer, item) => {
        const colorSilver = characterStorage.get('settings')?.zlomColorSilver !== false;
        const zlom = getZlomFormatting(item.name, { colorSilver });
        if (!zlom) return buffer;
        if (zlom.color) {
            buffer.applyFormat([0, buffer.length], { foreground: { space: 'hex', color: zlom.color } });
        }
        if (zlom.underline) {
            buffer.applyFormat([0, buffer.length], { underline: true });
        }
        return buffer;
    }}
]

let favoriteMagicTypes: string[] = [];
let favoriteMagicKeys: string[] = [];
let magicsData: MagicsFile | undefined = undefined;
let magicsColor: string = defaultSettings.magicsColor!;
let magicKeysColor: string = defaultSettings.magicKeysColor!;

// Module-level filters for magic keys and magics (populated after async load)
let keyFilter: ((name: string) => boolean) | null = null;
let magicFilter: ((name: string) => boolean) | null = null;

/**
 * Returns a CSS color string for an item name, using all loaded filters
 * (coins, magic keys, magics, item categories).
 */
export function getItemCssColor(name: string): string | undefined {
    // User-assigned zlom color wins
    const zlomColor = getZlomFormatting(name)?.color;
    if (zlomColor) return zlomColor;

    // Coin colors (highest priority)
    if (/mithryl\w+ monet/.test(name)) return '#afeeee';
    if (/zlot\w+ monet/.test(name)) return '#ffd700';
    if (/srebrn\w+ monet/.test(name)) return '#dadada';
    if (/miedzian\w+ monet/.test(name)) return '#875f00';

    // Magic keys
    if (keyFilter?.(name)) return magicKeysColor;

    // Magics
    if (magicFilter?.(name)) return magicsColor;

    // Favorite magics get a special highlight
    if (magicFilter?.(name) && isFavoriteMagic(name)) return '#00ff00';

    // Book progress colors
    if (bookFilter?.(name)) {
        const entry = bookCategoryLookup.get(name.trim().toLowerCase());
        if (entry) {
            const fmt = getBookColor(entry);
            if (fmt?.foreground && 'color' in fmt.foreground) return fmt.foreground.color as string;
        }
    }

    // Item categories
    for (const def of defs) {
        if (def.filter(name)) {
            switch (def.name) {
                case 'bronie': return '#ffff00';
                case 'tarcze': return '#87ceeb';
                case 'korpus':
                case 'glowa':
                case 'nogi':
                case 'rece': return '#cd853f';
                case 'ubrania': return '#b0a090';
                case 'bizuteria': return '#da70d6';
                case 'kamienie': return '#40e0d0';
            }
        }
    }

    return undefined;
}

export function isItemMagicOrKey(name: string): boolean {
    return !!(keyFilter?.(name) || magicFilter?.(name));
}

export function getMagicsColorFormat() {
    return createColorFormat(magicsColor);
}

export function getMagicKeysColorFormat() {
    return createColorFormat(magicKeysColor);
}

// API functions for plugin access
export function getGroupDefinitions(): ReadonlyArray<Readonly<GroupDefinition>> {
    return defs;
}

export function getTransformDefinitions(): ReadonlyArray<Readonly<TransformDefinition>> {
    return defaultTransforms;
}

export function addGroupDefinition(definition: GroupDefinition): void {
    defs.push(definition);
}

export function addTransformDefinition(definition: TransformDefinition): void {
    defaultTransforms.push(definition);
}

let plugLinks = false;

// Book filter for pretty containers (populated after async load)
let bookFilter: ((name: string) => boolean) | null = null;
type BookLookupEntry = { dopelniacz: string; categories: string[]; bookKey: string };
const bookCategoryLookup = new Map<string, BookLookupEntry>();
let bookProgressByCharacter: Record<string, Record<string, KnowledgeBookCategoryProgress>> = {};

const BOOK_IN_PROGRESS_COLOR = createColorFormat('#b8a960');
const BOOK_COMPLETED_COLOR = createColorFormat('#7aab7a');

function findBookProgValue(bookProg: KnowledgeBookCategoryProgress, cat: string): true | 'in_progress' | undefined {
    // Try exact match first, then case-insensitive
    if (bookProg[cat] != null) return bookProg[cat];
    const lower = cat.toLowerCase();
    for (const [key, value] of Object.entries(bookProg)) {
        if (key.toLowerCase() === lower) return value;
    }
    return undefined;
}

function getBookColor(entry: BookLookupEntry): ReturnType<typeof createColorFormat> | null {
    const current = characterStorage.getCharacter();
    const charKey = current?.trim() || DEFAULT_KNOWLEDGE_CHARACTER_KEY;
    const bookProg = bookProgressByCharacter[charKey]?.[entry.bookKey];
    if (!bookProg) return null;
    const allCompleted = entry.categories.every((cat) => findBookProgValue(bookProg, cat) === true);
    if (allCompleted) return BOOK_COMPLETED_COLOR;
    const anyStarted = entry.categories.some((cat) => findBookProgValue(bookProg, cat) != null);
    if (anyStarted) return BOOK_IN_PROGRESS_COLOR;
    return null;
}

function openBookContextMenu(client: Client, entry: BookLookupEntry, x: number, y: number) {
    const items = entry.categories.map((category) => {
        const dative = getDativeCategoryName(category);
        const cmd = `zglebiaj wiedze o ${dative} z ${entry.dopelniacz}`;
        return { label: cmd, action: () => client.sendCommand(cmd) };
    });
    showContextMenu(items, x, y);
}


function isFavoriteMagic(itemName: string): boolean {
    if ((favoriteMagicTypes.length === 0 && favoriteMagicKeys.length === 0) || !magicsData) return false;

    // Check both favorite magic keys and favorite magic types
    for (const [magicKey, magic] of Object.entries(magicsData.magics)) {
        if (magic && Array.isArray(magic.regexps)) {
            const matches = magic.regexps.some(pattern => {
                const regex = new RegExp("(^|\\s)" + pattern, "i");
                return regex.test(itemName);
            });

            if (matches) {
                // Check if this magic key is in favorites
                if (favoriteMagicKeys.includes(magicKey)) {
                    return true;
                }

                // Check if any of this magic's types are in favorites
                if (Array.isArray(magic.type) && favoriteMagicTypes.length > 0) {
                    const hasFavoriteType = magic.type.some(type => favoriteMagicTypes.includes(type));
                    if (hasFavoriteType) {
                        return true;
                    }
                }
            }
        }
    }
    return false;
}

async function loadMagicAndKeysFilter(client: Client) {
    try {
        // Load magics data for type checking
        const store = getMagicsStore();
        const snapshot = await store.getSnapshot();
        magicsData = snapshot?.data;

        // Subscribe to updates
        store.subscribe((snapshot) => {
            magicsData = snapshot?.data;
        });

        const [keys, magics] = await Promise.all([loadMagicKeys(), loadMagics()]);
        const keyRegexp = createRegexpFilter(keys);
        keyFilter = keyRegexp;
        defs.push({ name: "klucze", filter: keyRegexp, priority: 1 });
        defaultTransforms.push({
            transform: (buffer, item) => {
                if (keyRegexp(item.name)) {
                    buffer.color([0, item.name.length], createColorFormat(magicKeysColor));
                    if (plugLinks) {
                        buffer.createLink([0, item.name.length], {
                            onClick: () => client.sendCommand(`wybierz ${item.name}`),
                            title: `Kliknij aby wybrać: ${item.name}`
                        });
                    }
                }
                return buffer;
            },
        });
        const magicRegexp = createRegexpFilter(magics);
        magicFilter = magicRegexp;
        defaultTransforms.push({
            transform: (buffer, item) => {
                if (magicRegexp(item.name)) {
                    buffer.color([0, item.name.length], createColorFormat(magicsColor));
                    if (plugLinks) {
                        buffer.createLink([0, item.name.length], {
                            onClick: () => client.sendCommand(`wybierz ${item.name}`),
                            title: `Kliknij aby wybrać: ${item.name}`
                        });
                    }
                }
                return buffer;
            },
        });
        // Add transform for favorite magic indicator
        defaultTransforms.push({
            transform: (buffer, item) => {
                if (magicRegexp(item.name) && isFavoriteMagic(item.name)) {
                    const greenStar = createColorFormat('#00ff00');
                    const segments = buffer.getSegments();
                    buffer.clear();
                    buffer.append('* ', greenStar);
                    // Re-add the original segments with their formatting
                    for (const segment of segments) {
                        buffer.append(segment.text, segment.state);
                    }
                    buffer.append(' *', greenStar);
                }
                return buffer;
            },
        });
        magicAndKeysFilter = (item: ContainerItem) =>
            keyRegexp(item.name) || magicRegexp(item.name);
    } catch (e) {
        console.error('Failed to load magic keys or magics:', e);
    }

    try {
        const knowledgeStore = getKnowledgeStore();
        const knowledgeSnapshot = await knowledgeStore.getSnapshot();

        function registerBooks(books: Record<string, KnowledgeBookEntry> | undefined) {
            bookCategoryLookup.clear();
            if (!books) return;

            const allVariants = new Set<string>();

            for (const [bookKey, book] of Object.entries(books)) {
                const categories = book.categories;
                if (!categories || categories.length === 0) continue;

                const variants = [
                    book.mianownik, book.dopelniacz, book.biernik,
                    book.mnoga_mianownik, book.mnoga_dopelniacz, book.mnoga_biernik,
                ].filter((v): v is string => !!v && v.trim().length > 0);

                for (const variant of variants) {
                    const lower = variant.trim().toLowerCase();
                    allVariants.add(lower);
                    const existing = bookCategoryLookup.get(lower);
                    if (existing) {
                        for (const cat of categories) {
                            if (!existing.categories.includes(cat)) existing.categories.push(cat);
                        }
                    } else {
                        bookCategoryLookup.set(lower, {
                            dopelniacz: book.dopelniacz,
                            categories: [...categories],
                            bookKey,
                        });
                    }
                }
            }

            bookFilter = (name: string) => bookCategoryLookup.has(name.trim().toLowerCase());
        }

        registerBooks(knowledgeSnapshot?.data.books);
        bookProgressByCharacter = knowledgeSnapshot?.data.bookProgress ?? {};

        // Remove old book group/transform and re-add on updates
        knowledgeStore.subscribe((snapshot) => {
            registerBooks(snapshot?.data.books);
            bookProgressByCharacter = snapshot?.data.bookProgress ?? {};
        });

        defs.push({ name: "ksiazki", filter: (item: string) => bookFilter?.(item) ?? false });
        defaultTransforms.push({
            transform: (buffer, item, group) => {
                if (group !== 'ksiazki') return buffer;
                const entry = bookCategoryLookup.get(item.name.trim().toLowerCase());
                if (!entry) return buffer;
                const bookColor = getBookColor(entry);
                if (bookColor) {
                    buffer.color([0, buffer.length], bookColor);
                }
                buffer.createLink([0, buffer.length], {
                    onMouseEnter: (ev) => showBookTooltip(entry.categories, ev.pageX, ev.pageY),
                    onMouseLeave: () => hideBookTooltip(),
                    onContextMenu: (ev) => {
                        hideBookTooltip();
                        openBookContextMenu(client, entry, ev.pageX, ev.pageY);
                    },
                });
                return buffer;
            },
        });
    } catch (e) {
        console.error('Failed to load book data for containers:', e);
    }
}


export default function initContainers(client: Client) {
    loadMagicAndKeysFilter(client);
    const tag = 'prettyContainers';
    let enabled = false;
    let columns = 1;
    let width = client.contentWidth;

    client.on('contentWidth', (value) => {
        width = value;
    });

    const register = () => {
        client.Triggers.removeByTag(tag);
        defaultContainerPatterns.forEach(pattern => {
            client.Triggers.registerTrigger(pattern, (_line, matches): null => {
                if (matches) {
                    const output = prettyPrintContainer(matches, columns, 'POJEMNIK', 5, width);
                    client.print(output);
                }
                return null;
            }, tag);
        });
    };

    const applyContainerSettings = (settings: any) => {
        const detail = (settings ?? defaultSettings) as {
            containerColumns?: number;
            prettyContainers?: boolean;
            favoriteMagicTypes?: string[];
            favoriteMagicKeys?: string[];
            magicsColor?: string;
            magicKeysColor?: string;
        };
        columns = detail.containerColumns ?? columns;
        favoriteMagicTypes = detail.favoriteMagicTypes ?? favoriteMagicTypes;
        favoriteMagicKeys = detail.favoriteMagicKeys ?? favoriteMagicKeys;
        magicsColor = detail.magicsColor ?? defaultSettings.magicsColor!;
        magicKeysColor = detail.magicKeysColor ?? defaultSettings.magicKeysColor!;
        const shouldEnable = !!detail.prettyContainers;
        if (shouldEnable && !enabled) {
            enabled = true;
            register();
        } else if (!shouldEnable && enabled) {
            client.Triggers.removeByTag(tag);
            enabled = false;
        }
    };
    applyContainerSettings(characterStorage.get('settings'));
    characterStorage.onChange('settings', applyContainerSettings);

    client.aliases.push({
        pattern: /^\/przejrzyj(?: (\w+))?$/,
        callback: (m?: RegExpMatchArray) => {
            filter = magicAndKeysFilter;
            plugLinks = true;
            client.send(`ob ${m?.[1] ?? 'skrzynie'}`);
        },
    });
}
