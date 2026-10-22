vi.mock('@client/scripts/magicKeyLoader', () => ({ default: vi.fn().mockResolvedValue([]) }));
vi.mock('@client/scripts/magicsLoader', () => ({ default: vi.fn().mockResolvedValue([]) }));
vi.mock('@modules/data/dataStores/magicsStore', () => ({
    getMagicsStore: vi.fn(() => ({
        getSnapshot: vi.fn().mockResolvedValue({ data: { magics: {} } }),
        subscribe: vi.fn(() => () => {}),
    })),
    MagicsFile: {},
}));

import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest';
import Client from '@client/Client';
import eventBus from '@modules/core/eventBus';
import { characterStorage } from '@modules/core/storage';
import initContainers from '@client/scripts/prettyContainers';
import initInventory, { getInventoryState, parseInventory } from '@client/scripts/inventory';
import initWeaponState from '@client/scripts/weaponState';

const CARRIED =
    'Masz przy sobie tlusciutkie nikczemne licho, dwa zamkniete szarawe skorzane woreczki, ciemna polyskliwa fajke, ' +
    'zamkniety skorzany woreczek z herbem, dwa zamkniete woreczki ze skory kota, zamkniety czarno-zloty zdobiony woreczek, ' +
    'zamkniety prosty skorzany plecak, maly cynowy kubek i kosciany widelec.';

function names(): string[] {
    return getInventoryState().sections.flatMap(section => section.entries.map(entry => entry.text));
}

// Verbatim from the game, wrapped as it came
const WRAPPED_REPLY = [
    'Przy lewym boku masz przypieta srebrzysta runiczna pochwe ulthuanska.',
    'Na ramie zarzucona masz jedwabista srebrzysta line.',
    'Na plecach nosisz prawie pusty otwarty skorzany plecak.',
    'Masz na sobie goblinska zebata przylbice z klami sterczacymi zadziornie, nadajac groznego, zwierzecego wygladu.',
    'Masz na sobie matowa czarna zbroje plytowa, chroniaca cialo od szyi az do stop. Jej blachy zdaja sie pochlaniac kazdy promien',
    'padajacego na nie swiatla, a zdobia je zawile ornamenty i rzezbione nity.',
    'Nasuniety na serdeczny palec twej prawej dloni kunsztownie wykonany srebrny sygnet z herbem Rodziny Alderazzi odznacza cie',
    'sposrod reszty czlonkow regime.',
    'Nosisz purpurowy wyszukany plaszcz z naciagnietym na glowe kapturem.',
    'Mosiezna lampa z uchwytem u twojego pasa jest symbolem przynaleznosci do Spolki Handlowej Tileanska Oliwa.',
    'Do pasa masz przytroczone trzy zamkniete czarno-zlote zdobione woreczki i otwarta polyskliwa aksamitna sakiewke.',
    'Na plecach masz przypiety kunsztowny runiczny temblak krasnoludzki.',
    'Masz przy sobie dwie butelki oleju, jasnopiorego czujnego sokola skalnego, dwa zamkniete czarno-zlote zdobione woreczki, trzy',
    'zamkniete skorzane woreczki z herbem i dwa zamkniete impregnowane biale woreczki.',
];

describe('parseInventory', () => {
    test('reads a real reply, line kinds of every sort', () => {
        // Verbatim from the game
        const sections = parseInventory([
            'Przy prawej nodze masz przypieta niebieskozielona lsniaca pochwe z masy perlowej z tkwiacym w niej koscianym dlugim sztyletem.',
            'Trzymasz archaiczny zdobiony topor w prawej rece.',
            'Palisz trzymana w ustach ciemna polyskliwa fajke.',
            'Na plecach nosisz zamkniety skorzany plecak.',
            'Przy prawym boku masz przypiety kunsztowny runiczny temblak krasnoludzki.',
            'Na ramie zarzucona masz dluga konopna line z hakiem.',
            'Od stop do glow zakuty jestes w stalowe plyty krwistoczerwonego pelnego pancerza, na ktorego naramiennikach wygrawerowano symbole twego Pana - Khorna. Ponadto masz na sobie lsniaca plomienista tarcze.',
            'Wokol szyi masz zacisnieta mosieznej obrozy z runa Khorna, ktorej ostre cwieki upuscily ci nieco krwi.',
            'Nosisz zielony luskowaty plaszcz z naciagnietym na glowe kapturem.',
            'Do pasa masz przytroczone krysztalowa olejna lampe i podluzny buklak.',
            'Nosisz zamkniete cieniutkie zawiniatko.',
            'Ponad twoim lewym ramieniem widac przypiety czarnopiory blyszczacy temblak, zawierajacy czarnoblekitny pulsujacy morgenstern.',
            'Nosisz przywiazane do pasa kawalkiem sznurka, zamkniete nieduze zawiniatko, pojemnik na mapy.',
            'Masz przy sobie tlusciutkie nikczemne licho, dwa zamkniete szarawe skorzane woreczki, maly cynowy kubek i kosciany widelec.',
        ]);
        const byLabel = Object.fromEntries(sections.map(s => [s.label, s.entries.map(e => e.text)]));

        const held = Object.fromEntries(sections.flatMap(s => s.entries).filter(e => e.held).map(e => [e.text, e.held]));

        // A sheath or sling holds its weapon, named as anywhere else
        expect(byLabel['Przy nodze']).toEqual(['niebieskozielona lsniaca pochwe z masy perlowej']);
        expect(held['niebieskozielona lsniaca pochwe z masy perlowej']).toEqual(['kosciany dlugi sztylet']);
        expect(byLabel['W rękach']).toEqual(['archaiczny zdobiony topor']);
        expect(byLabel['W ustach']).toBeUndefined();
        expect(byLabel['Na sobie']).toEqual([
            'stalowe plyty krwistoczerwonego pelnego pancerza',
            'lsniaca plomienista tarcze',
        ]);
        expect(byLabel['Na szyi']).toEqual(['mosieznej obrozy z runa Khorna']);
        expect(byLabel['Przez ramię']).toEqual(['dluga konopna line z hakiem', 'czarnopiory blyszczacy temblak']);
        expect(held['czarnopiory blyszczacy temblak']).toEqual(['czarnoblekitny pulsujacy morgenstern']);
        // Zawiniatka are left out
        expect(byLabel['Noszone']).toEqual([
            'zielony luskowaty plaszcz z naciagnietym na glowe kapturem',
            'pojemnik na mapy',
        ]);
        expect(byLabel['Przy sobie']).toHaveLength(5);
    });

    test('reads a third real reply: held weapons, helmets, armour in prose', () => {
        // Verbatim from the game
        const sections = parseInventory([
            'Przy prawej nodze masz przypieta skorzana mysliwska pochwe z wilczym futrem z tkwiacym w niej dlugim krwistym sztyletem.',
            'Przy prawym boku masz przypiety oksydowany wezowy temblak z tkwiacym w nim falistym posrebrzanym toporem bojowym.',
            'Na plecach nosisz otwarty pakowny amarantowy plecak.',
            'Na ramie zarzucona masz jedwabista srebrzysta line.',
            'Na plecach masz przypiete atramentowoczarna ornamentowana pochwe z pendentem i srebrnoszary temblak z wizerunkiem morskiego potwora z tkwiacymi w nich stalowym posrebrzanym bastardem i srebrzystym jednorecznym mlotem.',
            'Na glowie masz garnczkowy helm zdobiony figura smoka o szeroko rozpostartych skrzydlach. Z otaczajacego go zawoju wyrasta laber w zielono-biala szachownice, ktory opada ci swobodnie na ramiona.',
            'Twe dlonie zakute sa w pancerne, miedziane rekawice ze srebrnymi guzami, wprost stworzone do tego by chwycic za bron. Od szyi az za uda niczym jakas szata opada niemal calkowicie biala kolczuga. Na korpusie jej ochrone dopelnia grawerowany napiersnik, zas ramiona skrywa para lsniacych, ozdobnych naramiennikow.',
            'Masz na sobie okuta owalna tarcze i srebrzysta plytowa pare butow.',
            'Na szyi masz zawiazana pasiasta wytarta chuste.',
            'Noszony przez ciebie zloty zdobiony pierscien jest symbolem przynaleznosci do Organizacji Tileanskie Slonce.',
            'Nasuniety na serdeczny palec twej lewej dloni kunsztownie wykonany srebrny sygnet z herbem Rodziny Alderazzi odznacza cie sposrod reszty czlonkow regime.',
            'Na palce masz nasuniete misterny smoczy pierscien i dwa duze brazowe pierscienie.',
            'Twoj plaszcz jest spiety misterna spinka w ksztalcie smoka.',
            'Masz przewieszony przez ramie brazowy krety rog - symbol rozpoznawczy pocztylionow.',
            'Masz przy sobie bialego spokojnego golebia pocztowego, dziesiec suszonych sliwek, szesc miedzianych monet, czternascie srebrnych monet, dziewiec mithrylowych monet, 26 zlotych monet, butelke oleju i dwie woskowe zoltawe swiece.',
        ]);
        const byLabel = Object.fromEntries(sections.map(s => [s.label, s.entries.map(e => e.text)]));

        const held = Object.fromEntries(sections.flatMap(s => s.entries).filter(e => e.held).map(e => [e.text, e.held]));

        expect(byLabel['Przy nodze']).toEqual(['skorzana mysliwska pochwe z wilczym futrem']);
        expect(held['skorzana mysliwska pochwe z wilczym futrem']).toEqual(['dlugi krwisty sztylet']);
        expect(byLabel['Przy boku']).toEqual(['oksydowany wezowy temblak']);
        expect(held['oksydowany wezowy temblak']).toEqual(['falisty posrebrzany topor bojowy']);
        // Two holders, two weapons: each in its own, in order
        expect(byLabel['Na plecach']).toEqual([
            'otwarty pakowny amarantowy plecak',
            'atramentowoczarna ornamentowana pochwe z pendentem',
            'srebrnoszary temblak z wizerunkiem morskiego potwora',
        ]);
        expect(held['atramentowoczarna ornamentowana pochwe z pendentem']).toEqual(['stalowy posrebrzany bastard']);
        expect(held['srebrnoszary temblak z wizerunkiem morskiego potwora']).toEqual(['srebrzysty jednoreczny mlot']);
        expect(byLabel['Na głowie']).toEqual(['garnczkowy helm zdobiony figura smoka o szeroko rozpostartych skrzydlach']);
        expect(byLabel['Na sobie']).toEqual([
            'pancerne miedziane rekawice ze srebrnymi guzami',
            'niemal calkowicie biala kolczuga',
            'grawerowany napiersnik',
            'para lsniacych ozdobnych naramiennikow',
            'okuta owalna tarcze',
            'srebrzysta plytowa pare butow',
            'zloty zdobiony pierscien',
            'misterna spinka w ksztalcie smoka',
        ]);
        expect(byLabel['Na szyi']).toEqual(['pasiasta wytarta chuste']);
        expect(byLabel['Na rękach']).toEqual([
            'kunsztownie wykonany srebrny sygnet z herbem Rodziny Alderazzi',
            'misterny smoczy pierscien',
            'dwa duze brazowe pierscienie',
        ]);
        // The courier's horn is a sign of the role, left out
        expect(byLabel['Przez ramię']).toEqual(['jedwabista srebrzysta line']);
        expect(byLabel['Przy sobie']).toHaveLength(8);
    });

    test('reads a fourth real reply: shields on the back, bags on a shoulder, armour in sentences', () => {
        // Verbatim from the game
        const sections = parseInventory([
            'Przy prawym boku masz przypiety inkrustowany skorzany temblak z tkwiacym w nim ciezkim jednorecznym toporem.',
            'Na plecy masz zarzucona wzmacniana drewniana tarcze.',
            'Na prawym ramieniu nosisz prawie pusta otwarta pakowna ciemnoniebieska torbe.',
            'Masz na sobie doskonale dopasowana, ciemna bretonska zbroje plytowa, chroniaca cialo od szyi az do stop. Jej prawa, pozbawiona ozdob strona wyraznie odcina sie od lewej, pokrytej drobnymi, roslinnymi ornamentami o nieco jasniejszym, szarym kolorze.',
            'Masz na sobie zlocista ciezka przylbice.',
            'Nasuniety na srodkowy palec twej prawej dloni stalowy sygnet zdobi herb Rodziny Alderazzi.',
            'Nosisz karmazynowy aksamitny plaszcz i dziesiecioramienny talizman ze srebra.',
            'Do pasa masz przytroczone pekata mosiezna lampe, mosiezna lampe i maly cynowy kubek.',
            'Nosisz otwarty niepowtarzalny wysluzony mapnik.',
            'Masz przy sobie Ventusa i drewniana lyzke.',
        ]);
        const byLabel = Object.fromEntries(sections.map(s => [s.label, s.entries.map(e => e.text)]));

        expect(byLabel['Na plecach']).toEqual(['wzmacniana drewniana tarcze']);
        expect(byLabel['Przez ramię']).toEqual(['prawie pusta otwarta pakowna ciemnoniebieska torbe']);
        expect(byLabel['Na sobie']).toEqual(['doskonale dopasowana ciemna bretonska zbroje plytowa', 'zlocista ciezka przylbice']);
        expect(byLabel['Na rękach']).toEqual(['stalowy sygnet']);
        expect(byLabel['Przy sobie']).toEqual(['Ventusa', 'drewniana lyzke']);
    });

    test('reads another real reply: signets, brooches, shrouds, masks and guild lamps', () => {
        // Verbatim from the game
        const sections = parseInventory([
            'Przy lewym boku masz przypiety kunsztowny runiczny temblak krasnoludzki.',
            'Trzymasz adamantytowy mlot bojowy w prawej rece.',
            'Na plecach nosisz otwarty pakowny kruczoczarny plecak.',
            'Masz na sobie drewniana popekana tarcze i jasnoniebieska kunsztowna zbroje plytowa.',
            'Nasuniety na serdeczny palec twej prawej dloni masywny szczerozloty sygnet z herbem Rodziny Alderazzi jest oznaka nadanej ci pozycji Caporegime.',
            'Twoje ubranie jest spiete mosiezna duza broszka w ksztalcie liscia debu.',
            'Okrywa cie zwiewny, upiorny calun. Odzienie utkane jest z mgly i jarzy sie trupim, nieziemskim blaskiem.',
            'Na lewym nadgarstku nosisz mosiezna bransolete w ksztalcie smoka.',
            'Na biodrach nosisz skorzany pas z klamra.',
            'Twe upiorne oblicze jasnieje nienaturalnie, przyobleczone w maske, ktorej wyraz mignieciami zmienia sie raz za razem, na przemian odmalowujac wscieklosc, wrogosc, strach, frustracje, obrzydzenie i szalenstwo.',
            'Na prawym nadgarstku nosisz gruba czarna opaske z kolcami.',
            'Na palce masz nasuniete trzy misterne smocze pierscienie.',
            'Nosisz masywny amulet z czarnym opalem (rozkazy).',
            'Twoj calun jest spiety masywna zlocona spinka.',
            'Mosiezna lampa z uchwytem u twojego pasa jest symbolem przynaleznosci do Spolki Handlowej Tileanska Oliwa.',
            'Do pasa masz przytroczona otwarta ciemnoniebieska runiczna sakiewke.',
            'Nosisz zamkniety niepowtarzalny wysluzony mapnik.',
            'Masz przy sobie koscistego podstarzalego szczura i bulke.',
        ]);
        const byLabel = Object.fromEntries(sections.map(s => [s.label, s.entries.map(e => e.text)]));

        expect(byLabel['Na sobie']).toEqual([
            'drewniana popekana tarcze',
            'jasnoniebieska kunsztowna zbroje plytowa',
            'mosiezna duza broszka w ksztalcie liscia debu',
            'zwiewny upiorny calun',
            'maske',
            'masywna zlocona spinka',
        ]);
        expect(byLabel['Na rękach']).toEqual([
            'masywny szczerozloty sygnet z herbem Rodziny Alderazzi',
            'mosiezna bransolete w ksztalcie smoka',
            'gruba czarna opaske z kolcami',
            'trzy misterne smocze pierscienie',
        ]);
        expect(byLabel['Przy pasie']).toEqual([
            'skorzany pas z klamra',
            'mosiezna lampa z uchwytem',
            'otwarta ciemnoniebieska runiczna sakiewke',
        ]);
        expect(byLabel['Przy sobie']).toEqual(['koscistego podstarzalego szczura', 'bulke']);
    });

    test('splits the reply into sections with counts', () => {
        const sections = parseInventory([
            'W rekach trzymasz dlugi miecz.',
            'Na plecach nosisz prawie pusty zamkniety skorzany plecak.',
            CARRIED,
        ]);

        expect(sections.map(s => s.label)).toEqual(['W rękach', 'Na plecach', 'Przy sobie']);
        const carried = sections[2].entries;
        // Both pairs of woreczki become one entry per bag, named in the singular
        expect(carried.map(e => e.text)).toEqual([
            'tlusciutkie nikczemne licho',
            'zamkniety szarawy skorzany woreczek',
            'zamkniety szarawy skorzany woreczek',
            'ciemna polyskliwa fajke',
            'zamkniety skorzany woreczek z herbem',
            'zamkniety woreczek ze skory kota',
            'zamkniety woreczek ze skory kota',
            'zamkniety czarno-zloty zdobiony woreczek',
            'zamkniety prosty skorzany plecak',
            'maly cynowy kubek',
            'kosciany widelec',
        ]);
        expect(carried[1]).toMatchObject({ count: 1, noun: 'woreczek' });
        expect(carried[2].key).not.toBe(carried[1].key);
    });

    test('splits feminine bags and counts above four', () => {
        const [section] = parseInventory(['Masz przy sobie piec zamknietych skorzanych sakiewek i trzy polskie torby.']);
        expect(section.entries.map(e => e.text)).toEqual([
            ...Array(5).fill('zamknieta skorzana sakiewke'),
            ...Array(3).fill('polska torbe'),
        ]);
    });

    test('leaves zawiniatka out, and a part with nothing else in it', () => {
        expect(parseInventory(['Nosisz zamkniete cieniutkie zawiniatko.'])).toEqual([]);
        const [carried] = parseInventory(['Masz przy sobie lampe i zamkniete zawiniatko.']);
        expect(carried.entries.map(e => e.text)).toEqual(['lampe']);
    });

    test('leaves out a sign of a role, whatever the item is', () => {
        expect(parseInventory(['Masz przewieszony przez ramie brazowy krety rog - symbol rozpoznawczy pocztylionow.'])).toEqual([]);
        expect(parseInventory(['Masz przewieszony przez ramie srebrny prosty rog - symbol rozpoznawczy pocztylionow.'])).toEqual([]);
    });

    test('keeps the carried part when nothing is carried', () => {
        expect(parseInventory(['Nie masz przy sobie niczego.'])).toEqual([{ label: 'Przy sobie', entries: [] }]);
    });

    test('keys survive the bag being opened or emptied', () => {
        const [closed] = parseInventory(['Na plecach nosisz prawie pusty zamkniety skorzany plecak.']);
        const [open] = parseInventory(['Na plecach nosisz otwarty skorzany plecak.']);
        expect(open.entries[0].key).toBe(closed.entries[0].key);
    });
});

describe('inventory tracking', () => {
    let client: Client;
    let sent: string[];
    let dispose: () => void;

    beforeEach(() => {
        vi.useFakeTimers();
        localStorage.clear();
        characterStorage.setCharacter('TestChar');
        sent = [];
        client = new Client({
            send: (command: string) => { sent.push(command); },
            output: () => {},
            sendGmcp: () => {},
            flushMessageBuffer: () => {},
            emit: () => {},
            shouldEchoCommand: () => true,
        });
        initContainers(client);
        initWeaponState(client);
        dispose = initInventory(client);
    });

    afterEach(() => {
        dispose();
        vi.useRealTimers();
    });

    const reply = (text: string, type = 'text') => client.onLine(text, type).map(b => b.text).join('\n');

    test('reads an `i` the player typed, leaving it in the output', () => {
        const out = reply(CARRIED);
        expect(out).toContain('Masz przy sobie');
        expect(names()).toContain('maly cynowy kubek');
        expect(getInventoryState().stale).toBe(false);
    });

    test('ignores a description of yourself', () => {
        reply('Masz przy sobie lampe.', 'living.long');
        expect(getInventoryState().updatedAt).toBeNull();
    });

    test('opening the window sends a hidden `i` and hides its reply', () => {
        eventBus.emit('inventory.popup.open');
        expect(sent).toEqual(['i']);

        const out = reply(CARRIED);
        expect(out).not.toContain('Masz przy sobie');
        expect(names()).toContain('kosciany widelec');
        expect(getInventoryState().refreshing).toBe(false);
    });

    test('a refresh while one is under way sends nothing more', () => {
        eventBus.emit('inventory.popup.open');
        eventBus.emit('inventory.refresh');
        expect(sent).toEqual(['i']);
    });

    test('removes an item dropped under the same name', async () => {
        reply(CARRIED);
        await client.sendCommand('odloz kubek');
        reply('Odkladasz maly cynowy kubek.');

        expect(names()).not.toContain('maly cynowy kubek');
        expect(getInventoryState().stale).toBe(false);
    });

    test('removes a given item, whoever it went to', async () => {
        reply(CARRIED);
        await client.sendCommand('daj fajke gandalfowi');
        reply('Dajesz ciemna polyskliwa fajke Gandalfowi.');
        expect(names()).not.toContain('ciemna polyskliwa fajke');
    });

    const entry = (name: string) =>
        getInventoryState().sections.flatMap(s => s.entries).find(e => e.name.includes(name));

    test('dropping one of two leaves one, named in the singular', async () => {
        reply(CARRIED);
        await client.sendCommand('odloz woreczek');
        reply('Odkladasz zamkniety szarawy skorzany woreczek.');

        expect(entry('szaraw')).toMatchObject({ count: 1, name: 'zamkniety szarawy skorzany woreczek' });
        expect(getInventoryState().stale).toBe(false);

        await client.sendCommand('odloz woreczek');
        reply('Odkladasz zamkniety szarawy skorzany woreczek.');
        expect(entry('szaraw')).toBeUndefined();
    });

    test('lowers a count given in another case', async () => {
        reply('Masz przy sobie piec zlotych monet.');
        await client.sendCommand('odloz dwie monety');
        reply('Odkladasz dwie zlote monety.');
        expect(entry('zlot')).toMatchObject({ count: 3 });
    });

    test('taking adds to what is carried, and a second one raises the count', async () => {
        reply(CARRIED);
        await client.sendCommand('wez lampe');
        reply('Bierzesz mosiezna lampe.');
        expect(entry('lampe')).toMatchObject({ count: 1 });

        await client.sendCommand('wez kubek z plecaka');
        reply('Bierzesz maly cynowy kubek z prostego skorzanego plecaka.');
        expect(entry('cynowy')).toMatchObject({ count: 2 });
        expect(entry('skorzanego plecaka')).toBeUndefined();
    });

    test('keeps the source when it is part of the name', async () => {
        reply('Masz przy sobie lampe.');
        await client.sendCommand('wez woreczek');
        reply('Bierzesz zamkniety skorzany woreczek z herbem.');
        expect(entry('herbem')).toBeDefined();
    });

    test('adds what someone gives you', () => {
        reply(CARRIED);
        reply('Gandalf daje ci dlugi miecz.');
        reply('Widok wroga daje ci nowy zapal do walki.');
        expect(entry('dlugi miecz')).toMatchObject({ count: 1 });
        expect(entry('zapal')).toBeUndefined();
    });

    test('never sends `i` by itself, only marks the list stale', async () => {
        reply(CARRIED);
        await client.sendCommand('odloz zbroje');
        reply('Odkladasz ciezka plytowa zbroje.');
        vi.advanceTimersByTime(10000);

        expect(getInventoryState().stale).toBe(true);
        expect(sent).toEqual(['odloz zbroje']);
    });

    test('only counts a reply after its command', () => {
        reply(CARRIED);
        reply('Odkladasz maly cynowy kubek.');
        expect(names()).toContain('maly cynowy kubek');
        expect(getInventoryState().stale).toBe(false);
    });

    test('looks into a bag without printing the listing', () => {
        reply(CARRIED);
        const plecak = getInventoryState().sections[0].entries.find(e => e.name.endsWith('plecak'))!;

        eventBus.emit('inventory.inspect', { key: plecak.key });
        expect(sent).toEqual(['zajrzyj do swojego plecaka']);

        const out = reply('Otwierasz na chwile prosty skorzany plecak, sprawdzajac zawartosc. W srodku dostrzegasz lampe i dwie monety.');
        expect(out).not.toContain('dostrzegasz');
        const updated = getInventoryState().sections[0].entries.find(e => e.key === plecak.key)!;
        expect(updated.container?.contents?.items).toEqual([{ name: 'lampe', count: 1 }, { name: 'monety', count: 2 }]);
    });

    test('numbers bags of the same kind', () => {
        reply(CARRIED);
        const bags = getInventoryState().sections[0].entries.filter(e => e.container && e.name.includes('woreczek'));
        eventBus.emit('inventory.inspect', { key: bags[1].key });
        expect(sent).toEqual(['zajrzyj do 2. swojego woreczka']);
    });

    test('lists a wielded weapon in hand', () => {
        const [hands] = parseInventory(['Trzymasz dlugi miecz w prawej rece.']);
        expect(hands).toMatchObject({ label: 'W rękach', entries: [{ text: 'dlugi miecz' }] });
    });

    test('drawing or lowering a weapon, in any of its wordings, marks the list stale', () => {
        reply(CARRIED);
        reply('Opuszczasz obszar bagien.');
        expect(getInventoryState().stale).toBe(false);

        reply('Jednym plynnym ruchem dobywasz dlugiego miecza.');
        expect(getInventoryState().stale).toBe(true);
        expect(sent).toEqual([]);
    });

    test('a weapon already listed in hand is not a change', () => {
        reply('Trzymasz dlugi miecz w prawej rece.\n' + CARRIED);
        reply('Jednym plynnym ruchem dobywasz dlugiego miecza.');
        expect(getInventoryState().stale).toBe(false);

        reply('Opuszczasz dlugi miecz.');
        expect(getInventoryState().stale).toBe(true);
    });

    test('looks into each of two bags of a kind by its number', () => {
        reply(CARRIED);
        const bags = getInventoryState().sections[0].entries.filter(e => e.container && e.label === 'szarawy skorzany woreczek');
        expect(bags).toHaveLength(2);
        expect(bags[0]).toMatchObject({ state: 'closed' });

        eventBus.emit('inventory.inspect', { key: bags[0].key });
        eventBus.emit('inventory.inspect', { key: bags[1].key });
        expect(sent).toEqual(['zajrzyj do 1. swojego woreczka', 'zajrzyj do 2. swojego woreczka']);
    });

    test('dropping both of a pair of bags takes both entries', async () => {
        reply(CARRIED);
        await client.sendCommand('odloz woreczki');
        reply('Odkladasz dwa zamkniete szarawe skorzane woreczki.');
        expect(names()).not.toContain('zamkniety szarawy skorzany woreczek');
        expect(getInventoryState().stale).toBe(false);
    });

    test('a bag taken is an entry of its own', async () => {
        reply(CARRIED);
        await client.sendCommand('wez woreczek');
        reply('Bierzesz zamkniety prosty skorzany plecak.');
        const plecaki = getInventoryState().sections[0].entries.filter(e => e.name === 'zamkniety prosty skorzany plecak');
        expect(plecaki).toHaveLength(2);
        expect(plecaki.every(e => e.count === 1 && e.container)).toBe(true);
    });

    test('keeps the inventory per character', () => {
        reply(CARRIED);
        expect(characterStorage.get('inventory')?.sections[0].entries).toHaveLength(11);

        characterStorage.setCharacter('Other');
        expect(getInventoryState().updatedAt).toBeNull();

        characterStorage.setCharacter('TestChar');
        expect(names()).toContain('kosciany widelec');
    });

    test('shows the stored state on start, without asking the game', () => {
        reply(CARRIED);
        dispose();
        dispose = initInventory(client);

        eventBus.emit('inventory.popup.open');
        expect(sent).toEqual([]);
        expect(names()).toContain('maly cynowy kubek');
    });

    test('remembers what was seen in a bag', () => {
        reply(CARRIED);
        const plecak = getInventoryState().sections[0].entries.find(e => e.label.endsWith('plecak'))!;
        reply('Otwarty prosty skorzany plecak zawiera lampe.');
        dispose();
        dispose = initInventory(client);

        const restored = getInventoryState().sections[0].entries.find(e => e.key === plecak.key)!;
        expect(restored.container?.contents?.items).toEqual([{ name: 'lampe', count: 1 }]);
    });

    test('takes an update synced from another device', () => {
        reply(CARRIED);
        const stored = characterStorage.get('inventory')!;
        characterStorage.set('inventory', { ...stored, sections: [{ label: 'Przy sobie', entries: [] }], updatedAt: stored.updatedAt + 1 });
        expect(names()).toEqual([]);
    });

    test('a line it does not know keeps the rest of the reply', () => {
        reply('Trzymasz dlugi miecz w prawej rece.\nJakas linia, ktorej jeszcze nie znamy.\n' + CARRIED);
        const labels = getInventoryState().sections.map(s => s.label);
        expect(labels).toEqual(['W rękach', 'Przy sobie']);
    });

    test('joins wrapped lines back into one, and waits for the end of what is carried', () => {
        // Lines arrive one by one; the reply is done only once its last line ends
        WRAPPED_REPLY.forEach(line => reply(line));
        const byLabel = Object.fromEntries(getInventoryState().sections.map(s => [s.label, s.entries.map(e => e.text)]));

        expect(byLabel['Przy boku']).toEqual(['srebrzysta runiczna pochwe ulthuanska']);
        expect(byLabel['Na plecach']).toEqual(['prawie pusty otwarty skorzany plecak', 'kunsztowny runiczny temblak krasnoludzki']);
        expect(byLabel['Na sobie']).toEqual([
            'goblinska zebata przylbice z klami sterczacymi zadziornie',
            'matowa czarna zbroje plytowa',
        ]);
        expect(byLabel['Na rękach']).toEqual(['kunsztownie wykonany srebrny sygnet z herbem Rodziny Alderazzi']);
        expect(byLabel['Przy pasie']).toEqual([
            'mosiezna lampa z uchwytem',
            ...Array(3).fill('zamkniety czarno-zloty zdobiony woreczek'),
            'otwarta polyskliwa aksamitna sakiewke',
        ]);
        expect(byLabel['Przy sobie']).toEqual([
            'dwie butelki oleju',
            'jasnopiorego czujnego sokola skalnego',
            ...Array(2).fill('zamkniety czarno-zloty zdobiony woreczek'),
            ...Array(3).fill('zamkniety skorzany woreczek z herbem'),
            ...Array(2).fill('zamkniety impregnowany bialy woreczek'),
        ]);
    });

    test('hides a wrapped reply to a hidden i, continuation lines too', () => {
        eventBus.emit('inventory.popup.open');
        const out = WRAPPED_REPLY.map(line => reply(line)).join('');
        expect(out).toBe('');
        expect(getInventoryState().refreshing).toBe(false);
    });

    test('shows what the herb manager counted in each woreczek, by its number', () => {
        reply(CARRIED);
        characterStorage.set('herb_counts', { 1: { herbs: { siezygron: 4 } }, 3: { herbs: {} } });
        const woreczki = getInventoryState().sections[0].entries.filter(e => e.noun === 'woreczek');

        expect(woreczki[0].herbs).toEqual([{ id: 'siezygron', count: 4 }]);
        // Not counted yet
        expect(woreczki[1].herbs).toBeNull();
        expect(woreczki[2].herbs).toEqual([]);
        // Other bags are not the herb manager's
        const plecak = getInventoryState().sections[0].entries.find(e => e.noun === 'plecak');
        expect(plecak?.herbs).toBeUndefined();
    });

    test('a typed wloz fills the bag the reply names', async () => {
        reply(CARRIED);
        reply('Otwarty prosty skorzany plecak zawiera lampe.');
        await client.sendCommand('wloz kubek do plecaka');
        reply('Wkladasz maly cynowy kubek do otwartego prostego skorzanego plecaka.');

        const plecak = getInventoryState().sections[0].entries.find(e => e.noun === 'plecak')!;
        expect(plecak.container?.contents).toMatchObject({
            stale: false,
            items: [{ name: 'lampe', count: 1 }, { name: 'maly cynowy kubek', count: 1 }],
        });
        expect(names()).not.toContain('maly cynowy kubek');
    });

    test('putting into a bag never looked into starts its contents, marked as maybe incomplete', async () => {
        reply('Masz przy sobie dwa poreczne kompasy i otwarty skorzany plecak.');
        const moved: string[] = [];
        const off = eventBus.on('inventory.moved', ({ kind }) => { moved.push(kind); });
        await client.sendCommand('wloz kompasy do plecaka');
        // Verbatim from the game
        reply('Wkladasz dwa poreczne kompasy do otwartego skorzanego plecaka.');
        off();

        const plecak = getInventoryState().sections[0].entries.find(e => e.noun === 'plecak')!;
        expect(plecak.container?.contents).toMatchObject({ stale: true, items: [{ name: 'poreczne kompasy', count: 2 }] });
        expect(moved).toEqual(['put']);
        expect(names()).toEqual(['otwarty skorzany plecak']);
    });
});
