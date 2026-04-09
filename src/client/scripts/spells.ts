import Client from "../Client";
import { createColorFormat } from "@modules/core/Colors";
import { AnsiAwareBuffer } from "@client/ansi/FormatState";

// Spell colors
const COLOR_ME = createColorFormat("#ff0000"); // red
const COLOR_OTHERS = createColorFormat("#ff00ff"); // magenta
const COLOR_WHITE = createColorFormat("#ffffff");
const COLOR_GREEN = createColorFormat("#00ff00");
const COLOR_TOMATO = createColorFormat("#ff6347");
const COLOR_WARNING_BG = createColorFormat("#b22222"); // firebrick

// Damage level mappings
const DAMAGE_LEVELS: Record<string, number> = {
    "nieznacznie raniac": 1,
    "lekko raniac": 2,
    "dotkliwie raniac": 3,
    "powaznie raniac": 4,
    "bardzo ciezko raniac": 5,
    "makabrycznie raniac": 6,
};

const DAMAGE_LEVELS_ADJECTIVE: Record<string, number> = {
    "nieznaczny": 1,
    "lekki": 2,
    "dotkliwy": 3,
    "powazny": 4,
    "bardzo ciezki": 5,
    "makabryczny": 6,
};

const DAMAGE_LEVELS_PLURAL: Record<string, number> = {
    "nieznacznymi": 1,
    "lekkimi": 2,
    "dotkliwymi": 3,
    "powaznymi": 4,
    "bardzo ciezkimi": 5,
    "makabrycznymi": 6,
};

function formatSpellOnMe(line: AnsiAwareBuffer, spellName: string): AnsiAwareBuffer {
    const prefix = new AnsiAwareBuffer();
    prefix.append("\n", COLOR_WHITE);
    prefix.append("[", COLOR_WHITE);
    prefix.append(` ${spellName} `, COLOR_ME);
    prefix.append("]", COLOR_WHITE);
    prefix.append(" ");

    const result = new AnsiAwareBuffer();
    result.appendBuffer(prefix);
    result.appendBuffer(line);
    result.append("\n\n");
    return result;
}

function formatSpellOnOthers(line: AnsiAwareBuffer, spellName: string, target?: string): AnsiAwareBuffer {
    const prefix = new AnsiAwareBuffer();
    prefix.append("\n[", COLOR_WHITE);
    prefix.append(` ${spellName} `, COLOR_OTHERS);
    prefix.append("]", COLOR_WHITE);
    prefix.append(" ");

    const result = new AnsiAwareBuffer();
    result.appendBuffer(prefix);
    result.appendBuffer(line);
    result.append("\n\n");

    // Highlight target if provided
    if (target) {
        const text = result.text;
        const targetIndex = text.indexOf(target);
        if (targetIndex !== -1) {
            result.color([targetIndex, targetIndex + target.length], COLOR_OTHERS);
        }
    }
    return result;
}

function formatDamageSpellOnMe(line: AnsiAwareBuffer, spellName: string, dmgText: string): AnsiAwareBuffer {
    const dmg = DAMAGE_LEVELS[dmgText] ?? DAMAGE_LEVELS_ADJECTIVE[dmgText] ?? DAMAGE_LEVELS_PLURAL[dmgText] ?? -1;

    const prefix = new AnsiAwareBuffer();
    prefix.append("\n", COLOR_WHITE);
    prefix.append("[", COLOR_WHITE);
    prefix.append(` ${spellName} ${dmg}/6 `, COLOR_ME);
    prefix.append("]", COLOR_WHITE);
    prefix.append(" ");

    const result = new AnsiAwareBuffer();
    result.appendBuffer(prefix);
    result.appendBuffer(line);
    result.append("\n\n");
    return result;
}

function formatDamageSpellOnOthers(line: AnsiAwareBuffer, spellName: string, dmgText: string, target?: string): AnsiAwareBuffer {
    const dmg = DAMAGE_LEVELS[dmgText] ?? DAMAGE_LEVELS_ADJECTIVE[dmgText] ?? DAMAGE_LEVELS_PLURAL[dmgText] ?? -1;

    const prefix = new AnsiAwareBuffer();
    prefix.append("\n[", COLOR_WHITE);
    prefix.append(` ${spellName} ${dmg}/6 `, COLOR_OTHERS);
    prefix.append("]", COLOR_WHITE);
    prefix.append(" ");

    const result = new AnsiAwareBuffer();
    result.appendBuffer(prefix);
    result.appendBuffer(line);
    result.append("\n\n");

    if (target) {
        const text = result.text;
        const targetIndex = text.indexOf(target);
        if (targetIndex !== -1) {
            result.color([targetIndex, targetIndex + target.length], COLOR_OTHERS);
        }
    }
    return result;
}

export default function initSpells(client: Client) {
    const tag = "spells";

    // === BARRIERS ===

    // Bariera kosci - on others
    client.Triggers.registerTrigger(
        /^Setki fragmentow kosci unosza sie wokol (?<cel>.+?) formujac swoista bariere, ktora zaczyna coraz szybciej wirowac!$/,
        (line, matches) => formatSpellOnOthers(line, "BARIERA KOSCI", matches.groups?.cel),
        tag
    );

    // Bariera magii - on others
    client.Triggers.registerTrigger(
        /^Wokol sylwetki (?<cel>.+?) wykwitaja blekitne pasma energii, ktore wirujac i przeplatajac sie ze soba tworza chroniaca (?:ja|jego) bariere\.$/,
        (line, matches) => formatSpellOnOthers(line, "BARIERA MAGII", matches.groups?.cel),
        tag
    );

    // Bariera ognia - on others
    client.Triggers.registerTrigger(
        /^Wokol (?<cel>.+?) wyrasta wieniec tanczacych plomieni, ktore rozniecajac sie co chwile tworza chroniaca (?:ja|go) bariere\.$/,
        (line, matches) => formatSpellOnOthers(line, "BARIERA OGNIA", matches.groups?.cel),
        tag
    );

    // Bariera widmowy pancerz - on others
    client.Triggers.registerTrigger(
        /^Nagle (?<cel>.+?) spowija szkarlatna poswiata, a kiedy przygasa katem oka zauwazasz zarys chroniacej (?:go|ja) polprzezroczystej, widmowej zbroi\.$/,
        (line, matches) => formatSpellOnOthers(line, "BARIERA WIDMOWY PANCERZ", matches.groups?.cel),
        tag
    );

    // === LIGHTNING ===

    // Blyskawica - on me (with targets)
    client.Triggers.registerTrigger(
        /^Nagle twych uszu dochodzi glosny trzask elektrycznosci, zas powietrze przecina potezna blyskawica, ktora uderza prosto w ciebie\. Czujac palacy twoje cialo (?<dmg>przejmujacy|powazny) bol zauwazasz katem oka, ze uwolnione wyladowanie trafia jeszcze w (?<cel>.+)/,
        (line) => formatSpellOnMe(line, "BLYSKAWICA"),
        tag
    );

    // Blyskawica - on me (solo)
    client.Triggers.registerTrigger(
        /^Nagle twych uszu dochodzi glosny trzask elektrycznosci, zas powietrze przecina potezna blyskawica, ktora uderza prosto w ciebie\. Czujac palacy twoje cialo powazny bol zamykasz na chwile oczy\.$/,
        (line) => formatSpellOnMe(line, "BLYSKAWICA"),
        tag
    );

    // Blyskawica - on others
    client.Triggers.registerTrigger(
        /^Nagle twych uszu dochodzi glosny trzask elektrycznosci, zas powietrze przecina potezna blyskawica\. Uwolnione wyladowanie trafia kolejno w (?<cel>.+)\.$/,
        (line, matches) => formatSpellOnOthers(line, "BLYSKAWICA", matches.groups?.cel),
        tag
    );

    // === PAINFUL AGONY ===

    // Bolesna agonia - on me
    client.Triggers.registerTrigger(
        "Czujesz w zoladku mrowienie, ktore nagle zmienia sie w potworny bol, jakby jakas sila probowala rozerwac cie od srodka. Mimowolnie spluwasz zolcia i zginasz sie w pol, niezdoln. do skutecznej walki.",
        (line) => formatSpellOnMe(line, "AGONIA"),
        tag
    );

    // Bolesna agonia - on others
    client.Triggers.registerTrigger(
        /^Nagle przez twarz (?<cel>.+?) przebiega grymas strasznego bolu, a (?:on sam|ona sama) spluwa zolcia i zgina sie w pol, jakby cos probowalo rozerwac (?:go|ja) od srodka!$/,
        (line, matches) => formatSpellOnOthers(line, "AGONIA", matches.groups?.cel),
        tag
    );

    // === CURSE OF IMPRISONED SOULS ===

    // Klatwa wiezionych dusz - on me
    client.Triggers.registerTrigger(
        "Niespodziewanie, przy wtorze placzu i jekow wiezionych dusz okolice wypelnia woal zlowrogiej energii, ktora formuje sie w widmowa dlon. Glosny krzyk wyrywa ci sie z ust, gdy przenika cie ona na wskros, a twe cialo stoponiowo zaczyna odmawiac ci posluszenstwa.",
        (line) => formatSpellOnMe(line, "KLATWA DUSZ -UM bojowe"),
        tag
    );

    // Klatwa wiezionych dusz - on others
    client.Triggers.registerTrigger(
        /^Niespodziewanie, przy wtorze placzu i jekow wiezionych dusz okolice wypelnia woal zlowrogiej energii, ktora formuje sie w widmowa dlon\. Glosny krzyk wyrywa sie (?<cel>.+?) z ust gdy przenika (?:go|ja) ona na wskros\.$/,
        (line, matches) => formatSpellOnOthers(line, "KLATWA DUSZ -UM bojowe", matches.groups?.cel),
        tag
    );

    // === LIFE FORCE THEFT ===

    // Kradziez sil witalnych - on me
    client.Triggers.registerTrigger(
        /^Zataczasz sie do tylu gdy twa skora peka, a strumien twojej zyciodajnej krwi tryska na (?<cel>.+?) spowijajac (?:go|ja) szkarlatnym calunem leczacym cialo i zasklepiajacym rany\.$/,
        (line) => formatSpellOnMe(line, "KRADZIEZ HP"),
        tag
    );

    // Kradziez sil witalnych - on others
    client.Triggers.registerTrigger(
        /^Skore (?<cel>.+?) osnuwa szkarlatna poswiata i pojawiaja sie na niej liczne ranki, z ktorych splywa krew! Natychmiast zaczyna ona parowac, a rdzawy dym spowija (?<kogo>.+?), zasklepiajac (?:jego|jej) rany\.$/,
        (line, matches) => formatSpellOnOthers(line, "KRADZIEZ HP", matches.groups?.cel),
        tag
    );

    // Kradziez sil witalnych chaos - on others
    client.Triggers.registerTrigger(
        /^Sylwetke (?<cel>.+?) obejmuje zielonkawa aura, wydajaca sie wysysac zen wszelkie sily witalne! Podczas wypelnionego straszliwa agonia krzyku ofiary zoltawy promien swiatla spowija (?<cel2>.+?), zasklepiajac (?:jego|jej) rany\.$/,
        (line, matches) => formatSpellOnOthers(line, "KRADZIEZ HP", matches.groups?.cel),
        tag
    );

    // Kradziez sil witalnych nieumarlego - on others
    client.Triggers.registerTrigger(
        /^Strumien czarnej jak noc energii przeplywa od (?<cel>.+?) do (?<kogo>.+?), leczac (?:jego|jej) rany\.$/,
        (line, matches) => formatSpellOnOthers(line, "KRADZIEZ HP", matches.groups?.cel),
        tag
    );

    // === FIREBALL ===

    // Kula ognia - on me
    client.Triggers.registerTrigger(
        /^Czujesz najpierw zapach siarki, a potem niewiadomo skad wylatuje kula zywego ognia i uderza o podloze .+?\! Pocisk eksploduje fala plomieni, ktore parza twoje cialo, zadajac (?<dmg>.+?) bol\.$/,
        (line, matches) => formatDamageSpellOnMe(line, "KULA OGNIA", matches.groups?.dmg ?? ""),
        tag
    );

    // Kula ognia - on others
    client.Triggers.registerTrigger(
        /^Czujesz najpierw zapach siarki, a potem niewiadomo skad wylatuje kula zywego ognia i uderza z impetem o podloze! Pocisk eksploduje fala plomieni, ktore dosiegaja (?<cel>.+)\.$/,
        (line, matches) => formatSpellOnOthers(line, "KULA OGNIA", matches.groups?.cel),
        tag
    );

    // === ACID ARROW ===

    // Kwasowa strzala - on me
    client.Triggers.registerTrigger(
        /^W powietrzu formuje sie zielonkawa mgielka, ktora po chwili materializuje sie w mknaca z sykiem prosto w ciebie kwasowa strzale! Jest juz za pozno by zejsc z toru pocisku, ktory wbija ci sie w .+? a zracy kwas pali i trawi twe cialo\.$/,
        (line) => formatSpellOnMe(line, "KWASOWA STRZALA"),
        tag
    );

    // Kwasowa strzala - on others
    client.Triggers.registerTrigger(
        /^W powietrzu formuje sie zielonkawa mgielka, ktora po chwili materializuje sie w mknaca z sykiem prosto w (?<cel>.+?) kwasowa strzale! Pocisk wbija (?:mu|jej) sie w .+? a zracy kwas pali i trawi (?:jego|jej) cialo\.$/,
        (line, matches) => formatSpellOnOthers(line, "KWASOWA STRZALA", matches.groups?.cel),
        tag
    );

    // === ICY WIND ===

    // Lodowy wicher - on me
    client.Triggers.registerTrigger(
        /^Nagle wokol zaczyna swiszczec lodowaty wicher\. Przejmujace podmuchy uderzaja prosto w ciebie, chloszczac twoje cialo i pokrywajac je (?<dmg>.+?) odmrozeniami\.$/,
        (line, matches) => formatDamageSpellOnMe(line, "LODOWY WICHER", matches.groups?.dmg ?? ""),
        tag
    );

    // Lodowy wicher - on others
    client.Triggers.registerTrigger(
        /^Nagle wokol zaczyna swiszczec lodowaty wicher, ktory koncentruje sie na (?<cel>.+?)\. Przejmujace podmuchy chloszcza (?:jego|jej) cialo, pokrywajac je (?<dmg>.+?) odmrozeniami\.$/,
        (line, matches) => formatDamageSpellOnOthers(line, "LODOWY WICHER", matches.groups?.dmg ?? "", matches.groups?.cel),
        tag
    );

    // === MAGIC STORM - STUN ===

    // Magiczna wichura - on me (stun)
    client.Triggers.registerTrigger(
        "Nagle zrywa sie potezna wichura, ktora sprawia, ze wokol momentalnie zaczyna sie prawdziwe pieklo... Kiedy furia burzy osiaga apogeum, wiatr unosi cie i poniewiera toba jak szmaciana lalka! Po dluzszej chwili podmuchy wydaja sie zamierac, jednak ostatni z nich rzuca cie ciezko na podloze, tak ze tracisz przytomosc.",
        (line) => {
            client.sendEvent("stunStart" as any);

            const result = new AnsiAwareBuffer();
            result.append("\n", COLOR_WHITE);
            result.append("[", COLOR_WHITE);
            result.append(" WICHURA OGL ", COLOR_ME);
            result.append("]", COLOR_WHITE);
            result.append(" ");
            result.appendBuffer(line);
            result.append("\n\n");
            result.append("[   OGLUCH   ] ----- JESTES OGLUSZONY -----\n\n", COLOR_ME);

            return result;
        },
        tag
    );

    // Magiczna wichura - on others (stun)
    client.Triggers.registerTrigger(
        /^Nagle zrywa sie potezna wichura, ktora sprawia, ze wokol momentalnie zaczyna sie prawdziwe pieklo\.\.\. Kiedy furia burzy osiaga apogeum, wiatr unosi (?<cele>.+) i poniewiera (?:nim|nia|nimi|) jak szmaciana lalka, rzucajac w koncuciezko na podloze\. Po dluzszej chwili podmuchy wydaja sie zamierac, az wreszcie nawalnica rozwiewa sie zupelnie\.$/,
        (line, matches) => formatSpellOnOthers(line, "WICHURA OGL", matches.groups?.cele),
        tag
    );

    // === MAGIC BLINDNESS ===

    // Magiczne oslepienie - on me
    client.Triggers.registerTrigger(
        "Swiat powoli zaczyna rozmywac sie, zastepowany przez nieprzenikniona ciemnosc. Tracisz wzrok.",
        (line) => {
            client.sendEvent("stunStart" as any);

            const result = new AnsiAwareBuffer();
            result.append("\n[");
            result.append(" OSLEPIENIE ", COLOR_ME);
            result.append("] ");
            result.appendBuffer(line);
            result.append("\n\n");
            result.append("[   OSLEPIENIE   ] ----- JESTES OSLEPIONY -----\n\n", COLOR_ME);

            return result;
        },
        tag
    );

    // Magiczne oslepienie koniec - on me
    client.Triggers.registerTrigger(
        "Powoli odzyskujesz wzrok.",
        (line) => {
            const result = new AnsiAwareBuffer();
            result.append("\n", COLOR_WHITE);
            result.append("[", COLOR_WHITE);
            result.append(" OK ", COLOR_GREEN);
            result.append("]", COLOR_WHITE);
            result.append(" ");
            result.appendBuffer(line);
            result.append("\n");
            return result;
        },
        tag
    );

    // Magiczne oslepienie - on others
    client.Triggers.registerTrigger(
        /^(?<cel>.+?) rozglada(?:|ja) sie pustym spojrzeniem, tak jakby stracil(?:|i) wzrok\.$/,
        (line, matches) => formatSpellOnOthers(line, "OSLEPIENIE", matches.groups?.cel),
        tag
    );

    // === MAGIC MISSILE ===

    // Magiczny pocisk - on me
    client.Triggers.registerTrigger(
        /^Spostrzegasz ostry rozblysk swiatla i zaraz potem wylatujaca z niego salwe jasnoniebieskich, migocacych pociskow, ktore z niewyobrazalna predkoscia mkna w twoja strone\. Straszliwy bol rozlewa sie po twych czlonkach, gdy kilka z nich trafia cie (?<dmg>.+)\.$/,
        (line, matches) => formatDamageSpellOnMe(line, "MAGICZNY POCISK", matches.groups?.dmg ?? ""),
        tag
    );

    // Magiczny pocisk - on others
    client.Triggers.registerTrigger(
        /^Spostrzegasz ostry rozblysk swiatla i zaraz potem wylatujaca z niego salwe jasnoniebieskich, migocacych pociskow, ktore z niewyobrazalna predkoscia mkna w strone (?<cel>.+?)\. Glosny krzyk ofiary przeszywa komnate, gdy kilka z nich trafia (?:ja|go) (?<dmg>.+)\.$/,
        (line, matches) => formatDamageSpellOnOthers(line, "MAGICZNY POCISK", matches.groups?.dmg ?? "", matches.groups?.cel),
        tag
    );

    // === WEAPON DISARM ===

    // Magiczne wytracenie - on me
    client.Triggers.registerTrigger(
        "Twoje dlonie zaczynaja dretwiec z zimna. Powoli tracisz w nich czucie, mimowolnie wypuszczajac dzierzona bron.",
        (line) => {
            client.sendEvent("sound:category", "weapon");
            client.sendEvent("weaponKnockedOff" as any);
            client.sendEvent("weapon_state" as any, false);

            const result = new AnsiAwareBuffer();
            result.append("\n\n");
            result.append("[  BRON  ] ", COLOR_TOMATO);
            result.appendBuffer(line);
            result.append("\n\n");

            return result;
        },
        tag
    );

    // Magiczne wytracenie koniec - on me
    client.Triggers.registerTrigger(
        "Czujesz, ze powoli odzyskujesz czucie w swoich dloniach.",
        (line) => formatSpellOnOthers(line, "MOZESZ DOBYWAC"),
        tag
    );

    // Magiczne wytracenie - on others
    client.Triggers.registerTrigger(
        /^(?<cel>.+?) pod wplywem jakiegos uroku zupelnie bezwiednie opuszcza(?:|ja) swa bron\.$/,
        (line, matches) => formatSpellOnOthers(line, "MAGIC WYTR", matches.groups?.cel),
        tag
    );

    // === DEATH MAGIC MISSILE ===

    // Pocisk magii smierci - on me
    client.Triggers.registerTrigger(
        /^W powietrzu formuje sie czarna blyskawica, ktora natychmiast rusza w twoja strone! Promien mrocznej energii z hukiem uderza cie w (?:korpus|glowe|nogi|lewe ramie|prawe ramie) (?<dmg>.+?)\. Czujesz, jak opuszczaja cie sily zyciowe, a przed oczami pojawia sie obraz skowyczacej otchlani, ktora probuje cie pochlonac\.$/,
        (line, matches) => formatDamageSpellOnMe(line, "CZARNA BLYSKAWICA", matches.groups?.dmg ?? ""),
        tag
    );

    // Pocisk magii smierci - on others
    client.Triggers.registerTrigger(
        /^W powietrzu formuje sie czarna blyskawica, ktora natychmiast rusza w strone (?<cel>.+?)\. Promien mrocznej energii z hukiem uderza (?:go|ja) w (?:lewe ramie|prawe ramie|korpus|glowe|nogi) (?<dmg>.+?) i powodujac, ze na moment zamiera (?:on|ona) z grymasem bolu na twarzy\.$/,
        (line, matches) => formatDamageSpellOnOthers(line, "CZARNA BLYSKAWICA", matches.groups?.dmg ?? "", matches.groups?.cel),
        tag
    );

    // === SEMI-INVISIBILITY ===

    // Polniewidzialnosc - on others
    client.Triggers.registerTrigger(
        /^Sylwetka (?<cel>.+?) zaczyna sie rozmywac, probujesz skupic na niej swoj wzrok, jednak nie udaje ci sie to\.$/,
        (line, matches) => formatSpellOnOthers(line, "ROZMYCIE", matches.groups?.cel),
        tag
    );

    // Polniewidzialnosc koniec - on others
    client.Triggers.registerTrigger(
        /^Sylwetka (?<cel>.+?) na powrot staje sie bardziej jednolita, ponownie wiec jestes w stanie skupic na (?:nim|niej) swoj wzrok\.$/,
        (line, matches) => formatSpellOnOthers(line, "ROZMYCIE END", matches.groups?.cel),
        tag
    );

    // === SUMMONS ===

    // Przyzwanie golema
    client.Triggers.registerTrigger(
        /^Wsrod glosnych chrzestow i chrobotow z ziemi tuz przed .+ golem!/,
        (line) => formatSpellOnOthers(line, "PRZYZWANIE"),
        tag
    );

    // Przyzwanie - przybiega
    client.Triggers.registerTrigger(
        "przybiega, ustawiajac sie tuz przed",
        (line) => formatSpellOnOthers(line, "PRZYZWANIE"),
        tag
    );

    // Przyzwanie pajaka
    client.Triggers.registerTrigger(
        /^Tuz przed .+? z gory opuszcza sie .+ pajak!/,
        (line) => formatSpellOnOthers(line, "PRZYZWANIE"),
        tag
    );

    // Przyzwanie zywiolaka
    client.Triggers.registerTrigger(
        /^W powietrzu tuz przed .+? formuje sie .+? zywiolak \w+!/,
        (line) => formatSpellOnOthers(line, "PRZYZWANIE"),
        tag
    );

    // Przyzwanie szkieletow
    client.Triggers.registerTrigger(
        /^Z rozsypanych szczatkow tuz przed .+? w jakis magiczny sposob formuja sie/,
        (line) => formatSpellOnOthers(line, "PRZYZWANIE"),
        tag
    );

    // Przyzwanie nieumarli
    client.Triggers.registerTrigger(
        /^Z ziemi przed .+? zaczynaja wychodzic/,
        (line) => formatSpellOnOthers(line, "PRZYZWANIE"),
        tag
    );

    // === MAGIC WEAPON ===

    // Przyzwanie magicznej broni
    client.Triggers.registerTrigger(
        "Ze wszystkich stron zbiegaja sie smugi cienia, splatajac sie w dloni",
        (line) => formatSpellOnOthers(line, "MAGICZNA BRON"),
        tag
    );

    // === FLY SWARM ===

    // Roj much - on me
    client.Triggers.registerTrigger(
        "Wsrod glosnego brzeczenia w powietrzu formuje sie olbrzymia chmura much. Roj rusza wprost na ciebie, wpierw otaczajac cie ze wszystkich stron, a zaraz potem obsiadajac cale twoje cialo, gryzac przy tym zawziecie.",
        (line) => formatSpellOnMe(line, "MUCHY -UM bojowe"),
        tag
    );

    // Roj much - on others
    client.Triggers.registerTrigger(
        /^Wsrod glosnego brzeczenia w powietrzu formuje sie olbrzymia chmura much\. Roj rusza wprost na (?<cel>.+?), wpierw otaczajac (?:go|ja) ze wszystkich stron, a zaraz potem obsiadajac cale (?:jego|jej) cialo, gryzac przy tym zawziecie\.$/,
        (line, matches) => formatSpellOnOthers(line, "MUCHY -UM bojowe", matches.groups?.cel),
        tag
    );

    // === SILENCE ===

    // Brak mowy - on me
    client.Triggers.registerTrigger(
        "Nagle czujesz jak twoj jezyk sztywnieje z zimna i staje sie bezuzyteczny niczym martwy, lodowy sopel.",
        (line) => formatSpellOnMe(line, "UCISZENIE"),
        tag
    );

    // Brak mowy - on others
    client.Triggers.registerTrigger(
        /^(?<cel>.+) rozwiera bezradnie usta, jakby stracil zdolnosc mowy\.$/,
        (line, matches) => formatSpellOnOthers(line, "UCISZENIE", matches.groups?.cel),
        tag
    );

    // === ELEMENTS ===

    // Zywioly - on me (wind)
    client.Triggers.registerTrigger(
        "Wokol ciebie zaczyna szalenczo wirowac wiatr, dmacy z taka sila, ze zmuszajacy do walki o kazdy oddech, by przetrwac.",
        (line) => formatSpellOnMe(line, "ZYWIOLY"),
        tag
    );

    // Zywioly - on me (water)
    client.Triggers.registerTrigger(
        "Gwaltowne uderzenia strumieni lodowatej wody chlustaja ci prosto w twarz, moczac i meczac cie zarazem.",
        (line) => formatSpellOnMe(line, "ZYWIOLY"),
        tag
    );

    // Zywioly - on me (earth)
    client.Triggers.registerTrigger(
        "Ziemia pod toba zaczyna drzec z narastajaca sila, obijajac cie bolesnie o podloze i zmuszajac do skupienia wszystkich sil na probie utrzymania sie na nogach.",
        (line) => formatSpellOnMe(line, "ZYWIOLY"),
        tag
    );

    // Zywioly - on me (fire)
    client.Triggers.registerTrigger(
        "Tuz przed toba wyrasta pioropusz rozzarzonych iskier, zadajac ci bolesne, piekace rany i zmuszajac do rozpaczliwej proby osloniecia sie przed zarem.",
        (line) => formatSpellOnMe(line, "ZYWIOLY"),
        tag
    );

    // === HEALING ===

    // Leczenie - on others
    client.Triggers.registerTrigger(
        /^Uwolniona moc, przybierajac forme zielonkawej, na wpol plynnej mgly, koncentruje sie wokol (?<cel>.+)\.$/,
        (line, matches) => formatSpellOnOthers(line, "HP+", matches.groups?.cel),
        tag
    );

    // Leczenie - on others (light version)
    client.Triggers.registerTrigger(
        /^Sylwetke (?<cel>.+) spowija na krotka chwile strumien jasnego swiatla\. Gdy w koncu znika zauwazasz, ze czesc ran .+? zasklepila sie\.$/,
        (line, matches) => formatSpellOnOthers(line, "HP+", matches.groups?.cel),
        tag
    );

    // === PAIN AURA ===

    // Aura bolu START - on me
    client.Triggers.registerTrigger(
        /^Wokol (?<mag>.+?) zaczyna gestniec krwawa poswiata, z ktorej w twoja strone zaczyna formowac sie strumien czarnej energii\.$/,
        (line) => {
            client.sendEvent("sound:category", "spell");

            const result = formatSpellOnMe(line, "AURA BOLU");
            result.append("\t\t\t");
            result.append(" <><> UWAGA NA SWOJE HP <><> ", { foreground: COLOR_WHITE.foreground, background: COLOR_WARNING_BG.foreground });
            return result;
        },
        tag
    );

    // Aura bolu START - on me (variant)
    client.Triggers.registerTrigger(
        /^Miedzy toba a (?<mag>.+?) formuje sie strumien czarnej energii\.$/,
        (line) => {
            client.sendEvent("sound:category", "spell");

            const result = formatSpellOnMe(line, "AURA BOLU");
            result.append("\t\t\t");
            result.append(" <><> UWAGA NA SWOJE HP <><> ", { foreground: COLOR_WHITE.foreground, background: COLOR_WARNING_BG.foreground });
            return result;
        },
        tag
    );

    // Aura bolu - on me (active)
    client.Triggers.registerTrigger(
        /^Krwawa poswiata laczy cie z .+?\. (?:Jego|Jej) bol staje sie twoim\.$/,
        (line) => {
            client.sendEvent("sound:category", "spell");

            const result = formatSpellOnMe(line, "AURA BOLU");
            result.append("\t\t\t");
            result.append(" <><> UWAGA NA SWOJE HP <><> ", { foreground: COLOR_WHITE.foreground, background: COLOR_WARNING_BG.foreground });
            return result;
        },
        tag
    );

    // Aura bolu KONIEC - on me
    client.Triggers.registerTrigger(
        /^Strumien czarnej energii laczacy cie z .+ zanika\.$/,
        (line) => formatSpellOnMe(line, "AURA BOLU KONIEC"),
        tag
    );

    // Aura bolu START - on others
    client.Triggers.registerTrigger(
        /^Wokol (?<mag>.+?) zaczyna gestniec krwawa poswiata, z ktorej w strone (?<cel>.+?) zaczyna formowac sie strumien czarnej energii\.$/,
        (line, matches) => formatSpellOnOthers(line, "AURA BOLU", matches.groups?.cel),
        tag
    );

    // Aura bolu - on others
    client.Triggers.registerTrigger(
        /^Miedzy (?!toba).+? a (?<cel>.+) formuje sie strumien czarnej energii\.$/,
        (line, matches) => formatSpellOnOthers(line, "AURA BOLU", matches.groups?.cel),
        tag
    );

    // Aura bolu KONIEC - on others
    client.Triggers.registerTrigger(
        /^Strumien czarnej energii laczacy (?!cie).+? z (?<cel>.+) zanika\.$/,
        (line, matches) => formatSpellOnOthers(line, "AURA BOLU KONIEC", matches.groups?.cel),
        tag
    );

    // Aura bolu CALKOWITY KONIEC - on others
    client.Triggers.registerTrigger(
        /^Otaczajaca (?<mag>.+?) krwawa poswiata znika\.$/,
        (line, matches) => {
            const result = formatSpellOnOthers(line, "AURA BOLU KONIEC", matches.groups?.mag);
            result.append("\t\t\t");
            result.append(" <><> KONIEC AURY BOLU <><> ", COLOR_OTHERS);
            return result;
        },
        tag
    );

    // === FROST RAY ===

    // Promien mrozu - on me (start)
    client.Triggers.registerTrigger(
        "wznosi dlon, a ze skierowanych w twoja strone szponiastych palcow zaczyna wydobywac sie promien trupiobladego swiatla.",
        (line) => {
            client.sendEvent("sound:category", "spell");

            const result = formatSpellOnMe(line, "PROMIEN MROZU");
            result.append("\t\t\t");
            result.append(" <><> WYCOFAJ SIE <><> ", { foreground: COLOR_WHITE.foreground, background: COLOR_WARNING_BG.foreground });
            return result;
        },
        tag
    );

    // Promien mrozu - on me (active)
    client.Triggers.registerTrigger(
        /^Struga trupiobladego swiatla wydobywajacego sie z palcow .+? rozplywa sie po twoim ciele,/,
        (line) => {
            const result = formatSpellOnMe(line, "PROMIEN MROZU");
            result.append("\t\t\t");
            result.append(" <><> WYCOFAJ SIE <><> ", { foreground: COLOR_WHITE.foreground, background: COLOR_WARNING_BG.foreground });
            return result;
        },
        tag
    );

    // Promien mrozu - on others
    client.Triggers.registerTrigger(
        /^Struga trupiobladego swiatla wydobywajaca sie z palcow .+? rozplywa sie po ciele (?<cel>.+), przyprawiajac go o dreszcz zimna\.$/,
        (line, matches) => formatSpellOnOthers(line, "PROMIEN MROZU", matches.groups?.cel),
        tag
    );

    // === UNDEAD LIFE THEFT (MARCUS) ===

    // Kradziez sil witalnych nieumarlego (MARCUS) - on others
    client.Triggers.registerTrigger(
        /wyciaga otwarta dlon w strone (?<cel>.+), ktory bezwladnie rozsypuje sie w kupe kosci\. Ledwo widoczny strumien blekitnych drobinek przeplywa ze stosu w kierunku palcow .+\.$/,
        (line, matches) => formatSpellOnOthers(line, "KRADZIEZ HP", matches.groups?.cel),
        tag
    );

    // === SCROLL CASTING ===

    // Czarowanie ze zwoju - on others
    client.Triggers.registerTrigger(
        "zaczyna czytac pozolkly zwoj.",
        (line) => {
            const result = formatSpellOnOthers(line, "CZAR");
            result.append("\n\t\t\t");
            result.append(" <><> CZARUJE ZE ZWOJU <><> ", { foreground: COLOR_WHITE.foreground, background: COLOR_WARNING_BG.foreground });
            return result;
        },
        tag
    );
}
