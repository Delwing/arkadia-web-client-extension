import { describe, test, expect, beforeEach, afterEach } from 'vitest';
import Client from '@client/Client';
import { characterStorage } from '@modules/core/storage';
import initSpells from '@client/scripts/spells';

function createClient(): Client {
    return new Client({
        send: () => {},
        output: () => {},
        sendGmcp: () => {},
        flushMessageBuffer: () => {},
        emit: () => {},
        shouldEchoCommand: () => false,
    });
}

describe('spells', () => {
    let client: Client;
    let events: { name: string; arg?: unknown }[];
    let offs: (() => void)[];

    function fired(name: string) {
        return events.some(e => e.name === name);
    }

    beforeEach(() => {
        localStorage.clear();
        characterStorage.setCharacter('TestChar');
        client = createClient();
        events = [];
        const sink = events;
        offs = ['stunStart', 'weaponKnockedOff', 'weapon_state', 'sound:category'].map(name =>
            client.on(name as any, (arg: unknown) => { sink.push({ name, arg }); })
        );
        initSpells(client);
    });

    afterEach(() => offs.forEach(off => off()));

    describe('barriers cast on others', () => {
        test.each([
            ['Setki fragmentow kosci unosza sie wokol wielkiego szczura formujac swoista bariere, ktora zaczyna coraz szybciej wirowac!', 'BARIERA KOSCI'],
            ['Wokol sylwetki wielkiego szczura wykwitaja blekitne pasma energii, ktore wirujac i przeplatajac sie ze soba tworza chroniaca jego bariere.', 'BARIERA MAGII'],
            ['Wokol wielkiego szczura wyrasta wieniec tanczacych plomieni, ktore rozniecajac sie co chwile tworza chroniaca go bariere.', 'BARIERA OGNIA'],
        ])('%s is tagged %s', (line, label) => {
            const [out] = client.onLine(line, 'text');

            expect(out.text).toContain(`[ ${label} ]`);
            expect(out.text).toContain(line);
        });

        test('the target name is highlighted', () => {
            const [out] = client.onLine(
                'Wokol wielkiego szczura wyrasta wieniec tanczacych plomieni, ktore rozniecajac sie co chwile tworza chroniaca go bariere.',
                'text'
            );

            expect(out.toHtml()).toContain('#');
        });
    });

    describe('spells cast on you', () => {
        test('a lightning strike is tagged', () => {
            const [out] = client.onLine(
                'Nagle twych uszu dochodzi glosny trzask elektrycznosci, zas powietrze przecina potezna blyskawica, ktora uderza prosto w ciebie. Czujac palacy twoje cialo powazny bol zamykasz na chwile oczy.',
                'text'
            );

            expect(out.text).toContain('[ BLYSKAWICA ]');
        });

        test('life-force theft is tagged', () => {
            const [out] = client.onLine(
                'Zataczasz sie do tylu gdy twa skora peka, a strumien twojej zyciodajnej krwi tryska na wielkiego szczura spowijajac go szkarlatnym calunem leczacym cialo i zasklepiajacym rany.',
                'text'
            );

            expect(out.text).toContain('[ KRADZIEZ HP ]');
        });
    });

    describe('damage grading', () => {
        test.each([
            ['nieznacznymi', 1],
            ['lekkimi', 2],
            ['dotkliwymi', 3],
            ['powaznymi', 4],
            ['bardzo ciezkimi', 5],
            ['makabrycznymi', 6],
        ])('%s frostbite reads as %i/6', (word, level) => {
            const [out] = client.onLine(
                `Nagle wokol zaczyna swiszczec lodowaty wicher. Przejmujace podmuchy uderzaja prosto w ciebie, chloszczac twoje cialo i pokrywajac je ${word} odmrozeniami.`,
                'text'
            );

            expect(out.text).toContain(`${level}/6`);
        });

        test('an unknown damage word grades as -1', () => {
            const [out] = client.onLine(
                'Nagle wokol zaczyna swiszczec lodowaty wicher. Przejmujace podmuchy uderzaja prosto w ciebie, chloszczac twoje cialo i pokrywajac je dziwnymi odmrozeniami.',
                'text'
            );

            expect(out.text).toContain('-1/6');
        });
    });

    describe('spells with side effects', () => {
        test('the magic storm stuns you', () => {
            const [out] = client.onLine(
                'Nagle zrywa sie potezna wichura, ktora sprawia, ze wokol momentalnie zaczyna sie prawdziwe pieklo... Kiedy furia burzy osiaga apogeum, wiatr unosi cie i poniewiera toba jak szmaciana lalka! Po dluzszej chwili podmuchy wydaja sie zamierac, jednak ostatni z nich rzuca cie ciezko na podloze, tak ze tracisz przytomosc.',
                'text'
            );

            expect(fired('stunStart')).toBe(true);
            expect(out.text).toContain('[');
        });

        test('magical blinding stuns you too', () => {
            client.onLine('Swiat powoli zaczyna rozmywac sie, zastepowany przez nieprzenikniona ciemnosc. Tracisz wzrok.', 'text');

            expect(fired('stunStart')).toBe(true);
        });

        test('being disarmed reports the weapon as lost', () => {
            const [out] = client.onLine(
                'Twoje dlonie zaczynaja dretwiec z zimna. Powoli tracisz w nich czucie, mimowolnie wypuszczajac dzierzona bron.',
                'text'
            );

            expect(fired('weaponKnockedOff')).toBe(true);
            expect(events.find(e => e.name === 'weapon_state')?.arg).toBe(false);
            expect(events.find(e => e.name === 'sound:category')?.arg).toBe('weapon');
            expect(out.text).toContain('[  BRON  ]');
        });

        test('the pain aura warns about your HP and plays a sound', () => {
            const [out] = client.onLine(
                'Miedzy toba a czarnoksieznikiem formuje sie strumien czarnej energii.',
                'text'
            );

            expect(out.text).toContain('[ AURA BOLU ]');
            expect(out.text).toContain('UWAGA NA SWOJE HP');
            expect(events.find(e => e.name === 'sound:category')?.arg).toBe('spell');
        });
    });

    test('unrelated output is untouched and silent', () => {
        const [out] = client.onLine('Jestes lekko zmeczony.', 'text');

        expect(out.text).toBe('Jestes lekko zmeczony.');
        expect(events).toEqual([]);
    });
});
