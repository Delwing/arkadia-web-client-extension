/**
 * Mock sessions for the showcase.
 *
 * Deterministic (a seeded PRNG, no `Math.random`) so the showcase looks the
 * same on every reload and a visual diff means something. The shape of the
 * activity — bursts of combat, long idle gaps, scattered conversation — is what
 * makes the timeline worth looking at, so the generator plans a session rather
 * than sprinkling lines evenly.
 */
import { channelForType, detectEvent, formatDateLong, formatDayLabel } from "@ui/logViewer";
import type { LogLine, LogSession } from "@ui/logViewer";

function seededRandom(seed: number): () => number {
    let state = seed >>> 0;
    return () => {
        state = (state + 0x6d2b79f5) | 0;
        let t = Math.imul(state ^ (state >>> 15), 1 | state);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

const ROOMS = [
    "Rynek w Bandzie",
    "Trakt na polnoc od bramy",
    "Waska, ociekajaca wilgocia grota",
    "Skraj Puszczy Brokilonskiej",
    "Most nad czarna woda",
    "Przed swiatynia Melitele",
    "Blotnista droga",
    "Zaulek za kuznia",
];

const GOSSIP = [
    "ktos widzial dzisiaj trolla w grocie?",
    "sprzedam kolczuge krasnoludzka, 400 sztuk zlota",
    "szukam uzdrowiciela na wyprawe do groty",
    "reset serwera wieczorem, chowajcie rzeczy",
    "gratulacje!",
    "gdzie sie kupuje oliwe do lampy?",
    "zbieramy druzyne na rozstajach, sa dwa miejsca",
];

/**
 * Long room descriptions, because a real log is mostly made of them.
 *
 * Without a single line past the pane's width the showcase could not show
 * wrapping at all, and wrapping is what the variable row height exists for.
 */
const ROOM_DESCRIPTIONS = [
    "Szeroki, brukowany rynek otaczaja kamienice o spadzistych dachach, a posrodku stoi kamienna studnia, przy ktorej zawsze klebi sie tlum handlarzy, poslancow i gapiow liczacych na darmowe widowisko.",
    "Trakt wije sie miedzy polami, ubity setkami kol i kopyt; po obu stronach ciagna sie plytkie rowy zarosniete pokrzywa, a w oddali widac ciemna sciane puszczy, nad ktora krazy stado wron.",
    "Wilgotne sciany groty ocieka woda, ktora zbiera sie w plytkich kaluzach na nierownym dnie; kazdy krok odbija sie echem gdzies w glebi korytarza, skad dolatuje ciezki, niemily zapach.",
    "Most ze sczernialych bali przerzucono nad leniwie plynaca, czarna woda; porecze dawno zgnily, a spomiedzy desek widac wirujacy nurt, w ktorym co jakis czas cos ciezkiego uderza o filary.",
];

const SPEAKERS = ["Brannoc", "Ysolda", "Thessaly", "Merrow", "Stary Gaunt"];
const HITS = ["tniesz", "rabiesz", "przebijasz", "uderzasz", "walisz"];
const MOB_HITS = ["drapie", "gryzie", "uderza", "tratuje"];

type PlanStep =
    | ["login"]
    | ["logout"]
    | ["walk", number]
    | ["combat", string, number, "kill" | "death" | "flee"]
    | ["chat", number]
    | ["tell", string, string[]]
    | ["say", string, string[]]
    | ["afk", number]
    | ["trait", string]
    | ["system", string];

interface SessionPlan {
    id: string;
    character: string;
    seed: number;
    startedAt: number;
    live?: boolean;
    plan: PlanStep[];
}

function generateLines(plan: SessionPlan): { text: string; type: string; timestamp: number }[] {
    const random = seededRandom(plan.seed);
    const pick = <T,>(items: T[]) => items[Math.floor(random() * items.length)];
    const between = (low: number, high: number) => low + Math.floor(random() * (high - low + 1));

    let clock = plan.startedAt;
    const out: { text: string; type: string; timestamp: number }[] = [];
    const add = (type: string, text: string, stepSeconds: number) => {
        clock += stepSeconds * 1000;
        out.push({ text, type, timestamp: clock });
    };

    let health = 412;

    for (const step of plan.plan) {
        switch (step[0]) {
            case "login":
                add("system.login", "Polaczono z arkadia.pl:4000", 0);
                add("system", "Witaj ponownie. Ostatnie logowanie: wczoraj o 21:40.", 1);
                break;
            case "logout":
                add("system", "Zapisywanie postaci... Do zobaczenia.", between(4, 20));
                add("system", "Polaczenie zamkniete.", 1);
                break;
            case "system":
                add("system", step[1], between(3, 15));
                break;
            case "walk":
                for (let index = 0; index < step[1]; index += 1) {
                    add("room.short", pick(ROOMS), between(4, 14));
                    if (random() < 0.45) add("room.long", pick(ROOM_DESCRIPTIONS), 0);
                    if (random() < 0.5) add("room.exits", "Wyjscia: polnoc, wschod, poludnie.", 0);
                }
                break;
            case "combat": {
                const [, mob, rounds, outcome] = step;
                add("combat.avatar", `Atakujesz ${mob}!`, between(3, 8));
                for (let round = 0; round < rounds; round += 1) {
                    add("combat.avatar", `${pick(HITS)} ${mob}. [${between(18, 64)}]`, between(2, 3));
                    if (random() < 0.62) {
                        const damage = between(12, 48) + (outcome === "death" ? 22 : 0);
                        health = Math.max(8, health - damage);
                        add("combat.others", `${mob} ${pick(MOB_HITS)} ciebie. [${damage}]`, between(1, 2));
                    } else {
                        add("combat.others", `${mob} chybia.`, between(1, 2));
                    }
                }
                if (outcome === "kill") {
                    add("combat.avatar", `${mob} pada martwy!`, 2);
                    add("system", `Otrzymujesz ${between(300, 1400)} punktow doswiadczenia.`, 1);
                    health = Math.min(412, health + between(60, 160));
                } else if (outcome === "death") {
                    add("combat.others", "Twoje cialo osuwa sie na ziemie.", 2);
                    add("system", "Twoje cechy sa oslabione po ostatniej smierci. By je odbudowac potrzebujesz zdobyc jeszcze 4 postepy.", between(8, 15));
                    health = 412;
                } else {
                    add("combat.avatar", "Uciekasz w poplochu!", 2);
                }
                break;
            }
            case "chat":
                for (let index = 0; index < step[1]; index += 1) {
                    add("comm", `[plotki] ${pick(SPEAKERS)}: ${pick(GOSSIP)}`, between(10, 70));
                }
                break;
            case "tell":
                step[2].forEach((message, index) =>
                    add(
                        "comm",
                        index % 2 === 0
                            ? `${step[1]} przekazuje ci: ${message}`
                            : `Przekazujesz ${step[1]}: ${message}`,
                        between(6, 30),
                    ),
                );
                break;
            case "say":
                step[2].forEach((message, index) =>
                    add("comm", index % 2 === 0 ? `${step[1]} mowi: ${message}` : `Mowisz: ${message}`, between(4, 18)),
                );
                break;
            case "afk":
                add("system", "Jestes teraz nieobecny.", between(5, 20));
                add("system", "Wracasz do gry.", step[1] * 60);
                break;
            case "trait":
                add("system", `Twoja ${step[1]} osiagnela nadludzki poziom.`, 2);
                break;
        }
    }

    return out;
}

const DAY = 86_400_000;

function at(daysAgo: number, hour: number, minute: number, now: number): number {
    const date = new Date(now - daysAgo * DAY);
    date.setHours(hour, minute, 0, 0);
    return date.getTime();
}

export function buildMockSessions(now: number = Date.now()): LogSession[] {
    const plans: SessionPlan[] = [
        {
            id: "mock-1",
            character: "Kethra",
            seed: 7,
            startedAt: at(0, 19, 2, now),
            live: true,
            plan: [
                ["login"],
                ["tell", "Brannoc", ["polujesz jeszcze na tego trolla?", "tak, wczoraj omal mnie nie zabil", "wez oliwe, trolle sie regeneruja"]],
                ["walk", 4],
                ["say", "kupiec", ["Trzy flaszki oliwy poprosze.", "Trzydziesci szesc sztuk zlota."]],
                ["walk", 3],
                ["combat", "goblinski zwiadowca", 5, "kill"],
                ["chat", 3],
                ["walk", 4],
                ["combat", "jaskiniowy troll", 10, "death"],
                ["afk", 9],
                ["walk", 5],
                ["system", "Rzucasz flaszke oliwy w jaskiniowego trolla. Zajmuje sie ogniem!"],
                ["combat", "jaskiniowy troll", 12, "kill"],
                ["trait", "sila"],
                ["chat", 2],
                ["walk", 3],
            ],
        },
        {
            id: "mock-2",
            character: "Kethra",
            seed: 21,
            startedAt: at(1, 21, 40, now),
            plan: [
                ["login"],
                ["walk", 3],
                ["combat", "dziki wilk", 5, "kill"],
                ["combat", "dziki wilk", 4, "kill"],
                ["chat", 3],
                ["walk", 4],
                ["combat", "niespokojny szkielet", 7, "kill"],
                ["system", "Zauwazasz swieze slady trolla prowadzace do wawozu."],
                ["combat", "jaskiniowy troll", 6, "flee"],
                ["afk", 14],
                ["logout"],
            ],
        },
        {
            id: "mock-3",
            character: "Dorn",
            seed: 33,
            startedAt: at(1, 17, 15, now),
            plan: [
                ["login"],
                ["say", "kowal", ["Ile za naprawe kolczugi?", "Osiemdziesiat sztuk zlota."]],
                ["walk", 5],
                ["chat", 4],
                ["combat", "bagienna zmija", 5, "kill"],
                ["afk", 22],
                ["walk", 3],
                ["logout"],
            ],
        },
        {
            id: "mock-4",
            character: "Kethra",
            seed: 45,
            startedAt: at(4, 20, 14, now),
            plan: [
                ["login"],
                ["walk", 6],
                ["combat", "bagienny troll", 16, "kill"],
                ["trait", "zrecznosc"],
                ["chat", 3],
                ["combat", "niespokojny szkielet", 6, "death"],
                ["logout"],
            ],
        },
    ];

    return plans.map((plan) => {
        const entries = generateLines(plan);
        const lines: LogLine[] = entries.map((entry, index) => ({
            number: index + 1,
            timestamp: entry.timestamp,
            channel: channelForType(entry.type),
            text: entry.text,
            event: detectEvent(entry.text, entry.type),
        }));
        return {
            id: plan.id,
            character: plan.character,
            dayLabel: formatDayLabel(plan.startedAt, now),
            dateLabel: formatDateLong(plan.startedAt),
            startedAt: plan.startedAt,
            endedAt: lines[lines.length - 1].timestamp,
            live: Boolean(plan.live),
            file: `${plan.id}.txt`,
            lines,
        };
    });
}
