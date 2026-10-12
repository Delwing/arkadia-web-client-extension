/*
The game's account protocol, as the original web client speaks it.

Before a character is in the world, the native endpoint (/wss) takes logins,
account creation and character creation over GMCP: `account.*` and `char.*`
requests, each answered on the same path with `{status: "success" | "fail",
msg?, code?}`. The telnet port answers `char.login` but not `account.*` — it
has its own text menu — so all of this is for the direct connection only.

Everything here is pure: payload shapes, the adjective lists a race and
gender may pick from, the name generator and the sentence that sums a new
character up. The session that sends and listens is accountSession.ts.
*/

export interface AccountChar {
    name: string;
    blocked?: boolean;
}

/** `account.info`: who is logged in and what they own. Times are unix seconds. */
export interface AccountInfo {
    email?: string;
    creation_time?: number;
    login_time?: number;
    login_from?: string;
    blocked?: boolean;
    new_player?: boolean;
    chars: AccountChar[];
}

export interface AccountOption {
    val: number;
    text: string;
}

/**
 * One appearance adjective. `val` is the masculine form sent back to the game,
 * `bit` says which race and gender may take it (see adjectivesFor) and `group`
 * is the heading it is listed under.
 */
export interface AccountAttribute {
    val: string;
    text: string;
    bit: number;
    group?: string;
}

/** `account.options`: what a new character can be made of. */
export interface AccountOptions {
    races: AccountOption[];
    genders: AccountOption[];
    startlocs: AccountOption[];
    attributes: AccountAttribute[];
}

export interface AccountReply {
    status?: 'success' | 'fail';
    msg?: string;
    code?: number;
    [key: string]: unknown;
}

/** What `char.create` takes. The declension runs nominative to locative. */
export interface CharCreateRequest {
    name_declension: [string, string, string, string, string, string];
    race: number;
    gender: number;
    adjectives: [string, string];
    startloc: number;
}

export const GENDER_MALE = 0;
export const GENDER_FEMALE = 1;

/**
 * GMCP strings arrive as the UTF-8 bytes, one char per byte. Text that already
 * holds anything past Latin-1, or is not valid UTF-8, is left as it came.
 */
export function decodeGameText(value: unknown): string {
    if (typeof value !== 'string') return '';
    if (!/[\x80-\xff]/.test(value) || /[^\x00-\xff]/.test(value)) return value;
    try {
        return new TextDecoder('utf-8', {fatal: true}).decode(Uint8Array.from(value, (c) => c.charCodeAt(0)));
    } catch {
        return value;
    }
}

/**
 * A request's JSON as the bytes the game reads, one char per byte: the socket
 * base64-encodes what it is given as it stands, and the game expects UTF-8.
 */
export function encodeGamePayload(payload: unknown): string {
    const bytes = new TextEncoder().encode(JSON.stringify(payload ?? {}));
    let out = '';
    for (const byte of bytes) out += String.fromCharCode(byte);
    return out;
}

export function capitalize(text: string): string {
    return text ? text.charAt(0).toUpperCase() + text.slice(1) : text;
}

/** A character name or any of its forms: plain letters only, as the game takes them. */
export function isValidName(name: string): boolean {
    return /^[A-Za-z]+$/.test(name);
}

/** Passwords and e-mails: printable ASCII only, which is all the game accepts. */
export function isPrintableAscii(text: string): boolean {
    return /^[\x20-\x7e]+$/.test(text);
}

export function isValidEmail(email: string): boolean {
    return email.includes('@') && isPrintableAscii(email);
}

export function normalizeInfo(raw: unknown): AccountInfo {
    const data = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
    const chars = Array.isArray(data.chars) ? data.chars : [];
    return {
        email: typeof data.email === 'string' ? decodeGameText(data.email) : undefined,
        creation_time: typeof data.creation_time === 'number' ? data.creation_time : undefined,
        login_time: typeof data.login_time === 'number' ? data.login_time : undefined,
        login_from: typeof data.login_from === 'string' ? decodeGameText(data.login_from) : undefined,
        blocked: data.blocked === true || data.blocked === 1,
        new_player: data.new_player === true || data.new_player === 1,
        chars: chars
            .filter((c): c is Record<string, unknown> => !!c && typeof c === 'object' && typeof (c as any).name === 'string')
            .map((c) => ({name: c.name as string, blocked: c.blocked === true || c.blocked === 1})),
    };
}

export function normalizeOptions(raw: unknown): AccountOptions {
    const data = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
    const options = (list: unknown): AccountOption[] => (Array.isArray(list) ? list : [])
        .filter((o) => o && typeof o === 'object')
        .map((o: any) => ({val: Number(o.val), text: decodeGameText(o.text)}));
    const attributes = (Array.isArray(data.attributes) ? data.attributes : [])
        .filter((a) => a && typeof a === 'object')
        .map((a: any) => ({
            val: decodeGameText(String(a.val ?? '')),
            text: decodeGameText(a.text),
            bit: Number(a.bit) || 0,
            group: a.group == null ? undefined : decodeGameText(String(a.group)),
        }));
    return {
        races: options(data.races),
        genders: options(data.genders),
        startlocs: options(data.startlocs),
        attributes,
    };
}

/**
 * The adjectives a race and gender may take: each race owns two bits, the low
 * one for men and the high one for women. The game lists the masculine form;
 * a woman's drops its last letter for an "a".
 */
export function adjectivesFor(options: AccountOptions, race: number, gender: number): AccountAttribute[] {
    const mask = (gender === GENDER_FEMALE ? 2 : 1) * Math.pow(2, 2 * race);
    return options.attributes
        .filter((a) => (a.bit & mask) !== 0)
        .map((a) => {
            const text = capitalize(a.text);
            return {...a, text: gender === GENDER_FEMALE ? text.slice(0, -1) + 'a' : text};
        })
        .sort((a, b) => (a.group ?? '').localeCompare(b.group ?? '') || a.val.localeCompare(b.val));
}

/** Two different adjectives, at random, from those offered. */
export function pickTwoAdjectives(list: AccountAttribute[], random: () => number = Math.random): [string, string] {
    if (list.length < 2) return [list[0]?.val ?? '', ''];
    const first = Math.floor(random() * list.length);
    let second = Math.floor(random() * (list.length - 1));
    if (second >= first) second += 1;
    return [list[first].val, list[second].val];
}

const NAME_PARTS: Record<string, [string[], string[]]> = {
    elf: [
        ['Aes', 'Air', 'Al', 'Ald', 'Am', 'Ang', 'Cal', 'Ca', 'Car', 'Dol', 'Endri', 'Eldir', 'Eldi', 'Ell', 'Epon', 'Err', 'Fann', 'Far', 'Fil', 'Gal', 'Gil', 'Hal', 'Har', 'Has', 'Ilu', 'Imra', 'Im', 'Io', 'Lar', 'Laurel', 'Laure', 'Lin', 'Lor', 'Loral', 'Lora', 'Mal', 'Mar', 'Mor', 'Orr', 'Pel', 'Ral', 'Shas', 'Sir', 'Talla', 'Tall', 'Ter', 'Tor', 'Ullia', 'Ullial', 'Uria', 'Urdith', 'Val', 'Vir', 'Yav', 'Yava'],
        ['alion', 'andar', 'andara', 'andil', 'andile', 'andilas', 'andiril', 'ane', 'anel', 'arel', 'arr', 'avandrel', 'cora', 'coral', 'coran', 'coranna', 'dil', 'drigar', 'ellion', 'endil', 'fan', 'fana', 'far', 'galiel', 'gran', 'grana', 'hal', 'hali', 'hil', 'hile', 'holen', 'huir', 'ia', 'ian', 'ina', 'indel', 'irrlan', 'lad', 'llana', 'llanal', 'lor', 'mal', 'maris', 'mir', 'mor', 'nor', 'oth', 'ras', 'riel', 'rond', 'thin', 'thol', 'uviel', 'wen', 'wing'],
    ],
    krasnolud: [
        ['Zig', 'Ger', 'Gor', 'Kha', 'Dal', 'Del', 'Yar', 'Pa', 'Ka', 'Fri', 'Ed', 'Gr', 'Gom', 'Bar', 'Vo', 'Mor', 'Ale', 'Hol', 'Fra', 'Ga', 'Hein', 'Iso', 'Alf', 'Bro', 'Bel', 'Adel', 'Ehr', 'Mun', 'Hun', 'Har', 'Gum', 'Gus', 'Gron', 'Dwin', 'Rha', 'Dho', 'Leo', 'Zor', 'Orr', 'Ghor'],
        ['rin', 'grin', 'ertz', 'vert', 'or', 'orri', 'ril', 'na', 'rak', 'ili', 'ar', 'unda', 'ilda', 'tha', 'icht', 'mar', 'rra', 'rda', 'ann', 'kka', 'um', 'er', 'el', 'rid', 'rl', 'ul', 'ut', 'pen', 'tz', 'gar', 'bar', 'rim', 'ps', 'tha'],
    ],
    halfling: [
        ['Ing', 'Ber', 'Bro', 'Wil', 'Der', 'Dri', 'Carm', 'Fru', 'Brun', 'Vru', 'Us', 'Ler', 'Ker', 'Mer', 'Mit', 'Ger', 'Uhl', 'Per', 'Gigis', 'Vern', 'Lui', 'Gret', 'Nast', 'Thy', 'Ehrm', 'Bern', 'Ern', 'Fri', 'Ren', 'Beg', 'Bar', 'Sig', 'Vert', 'Alb', 'Bor', 'Vol', 'Hed', 'Hard', 'Die', 'Ott', 'Vald', 'Hil', 'Fra'],
        ['ef', 'illa', 'st', 'ia', 'helm', 'oi', 'ui', 'hilda', 'ion', 'son', 'mar', 'ihi', 'er', 'tel', 'und', 'en', 'ehr', 'ler', 'hold', 'ann', 'ssia', 'iki', 'ata', 'ty', 'onia', 'rea', 'run', 'tha', 'ica', 'rid', 'itt', 'rin', 'wig', 'hl', 'nz'],
    ],
    gnom: [
        ['Aar', 'An', 'Ar', 'As', 'Co', 'Hi', 'Han', 'Har', 'Hel', 'Iir', 'Ja', 'Jan', 'Jar', 'Ko', 'Li', 'Mo', 'Mar', 'Na', 'Nik', 'Os', 'Ol', 'Peku', 'Ral', 'Sam', 'San', 'Theo', 'Ter', 'Tom', 'Ul', 'Val', 'Vin', 'Slig', 'Yal', 'Ket', 'Bian', 'Uhl', 'Imr', 'Bran', 'Brom', 'Vim'],
        ['an', 'ar', 'ai', 'orf', 'ei', 'oth', 'or', 'om', 'iv', 'og', 'av', 'ik', 'sh', 'eh', 'uz', 'uf', 'oc', 'op', 'uy', 'uk', 'ol', 'uh', 'ina', 'ova', 'ina', 'ih', 'off', 'ofa', 'od'],
    ],
    ogr: [
        ['Zag', 'Er', 'Gol', 'Gro', 'Ar', 'Kal', 'Atu', 'Gra', 'Az', 'Vro', 'Val', 'Thum', 'Tem', 'Bar', 'Gwa', 'Zho', 'Gro', 'Abu', 'Bal', 'Koz', 'Com', 'Azo', 'Ozo', 'Bro', 'Zeal', 'Zar', 'Thor', 'Gryz', 'Ol', 'Kva', 'Kha', 'Aga', 'Egza', 'Khro'],
        ['zag', 'um', 'bun', 'un', 'zar', 'uun', 'bur', 'ga', 'zur', 'wur', 'ur', 'uz', 'kir', 'za', 'anda', 'an', 'zan', 'him', 'hid', 'om', 'oum', 'ber', 'ot', 'tor', 'dor', 'ta', 'tha', 'than', 'der', 'ghor', 'aod', 'iza', 'hun', 'thun', 'thum', 'uin'],
    ],
    '': [
        ['Ab', 'Ac', 'Ad', 'Af', 'Agr', 'Ast', 'As', 'Al', 'Adw', 'Adr', 'Ar', 'Bo', 'Br', 'Bon', 'Can', 'Ced', 'Cr', 'Ch', 'Cad', 'Dah', 'Dym', 'Dra', 'Dwi', 'Eber', 'Ed', 'Eth', 'Et', 'Er', 'El', 'Eow', 'Fal', 'Fr', 'Ger', 'Gr', 'Gret', 'Gal', 'Hod', 'Hel', 'Her', 'Ha', 'Ibn', 'Jer', 'Klar', 'Ka', 'Kir', 'Ked', 'Liut', 'Loth', 'Lar', 'Leg', 'May', 'Mehl', 'Mir', 'Nath', 'Nyd', 'Ol', 'Oc', 'On', 'Pav', 'Pr', 'Raf', 'Rh', 'Ryd', 'Sath', 'Sob', 'Sev', 'Teo', 'Tro', 'Tha', 'Val', 'Vayne', 'Yen', 'Yark', 'Zyv', 'Uhl', 'Wan', 'Wic'],
        ['gart', 'hard', 'erad', 'enen', 'kan', 'ed', 'id', 'ay', 'ard', 'ian', 'il', 'emen', 'er', 'era', 'ela', 'holt', 'enda', 'era', 'enna', 'iss', 'ald', 'alt', 'ira', 'ila', 'nin', 'ik', 'nik', 'ilia', 'rond', 'old', 'za', 'av', 'om', 'ryk', 'es', 'os', 'iks', 'iel'],
    ],
};

/** A name that sounds like the race: one of its openings and one of its endings. */
export function generateName(raceText: string, random: () => number = Math.random): string {
    const [starts, ends] = NAME_PARTS[raceText.toLowerCase()] ?? NAME_PARTS[''];
    const pick = (list: string[]) => list[Math.round(random() * (list.length - 1))];
    return pick(starts) + pick(ends);
}

const RACE_INSTRUMENTAL: Record<string, [string, string]> = {
    elf: ['elfem', 'elfką'],
    krasnolud: ['krasnoludem', 'krasnoludką'],
    halfling: ['halflingiem', 'halflinką'],
    gnom: ['gnomem', 'gnomką'],
    ogr: ['ogrem', 'ogrzycą'],
};

/** "wysokim chudym elfem" / "wysoką chudą elfką": the character, in the instrumental. */
export function describeInstrumental(raceText: string, gender: number, first: string, second: string): string {
    const female = gender === GENDER_FEMALE;
    const adjectives = female
        ? `${first.slice(0, -1)}ą ${second.slice(0, -1)}ą`
        : `${first}m ${second}m`;
    const noun = RACE_INSTRUMENTAL[raceText.toLowerCase()] ?? ['mężczyzną', 'kobietą'];
    return `${adjectives} ${female ? noun[1] : noun[0]}`;
}

/** Where a new character wakes up, in the locative the summary needs. */
export function startlocLocative(startlocText: string): string {
    return capitalize(startlocText) === 'Nuln' ? 'Nuln' : 'Novigradzie';
}

/** The declension's labels, nominative first: the questions the form asks. */
export const DECLENSION_CASES = [
    {key: 'nominative', label: 'Kto?', hint: 'mianownik'},
    {key: 'genitive', label: 'Kogo?', hint: 'dopełniacz'},
    {key: 'dative', label: 'Komu?', hint: 'celownik'},
    {key: 'accusative', label: 'Kogo? (widzę)', hint: 'biernik'},
    {key: 'instrumental', label: 'Z kim?', hint: 'narzędnik'},
    {key: 'locative', label: 'O kim?', hint: 'miejscownik'},
] as const;
