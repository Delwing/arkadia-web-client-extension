/**
 * What each script is called in the settings UI, and what it does in one line.
 *
 * Kept here rather than as arguments at the 148 `registry.declare` calls, which
 * would bury `main.ts`: one file to review, one file to diff. The order matches
 * registration order in `registerScripts`, so this reads alongside it.
 *
 * Drafted from each script's aliases, trigger patterns and settings keys, then
 * reviewed. A plausible-but-wrong label in a settings list is worse than no
 * label — it sends someone to type a command that does not exist — so two tests
 * hold this honest: one that every script has an entry and nothing extra does,
 * and one that every `/command` a description names is a command the script
 * really registers, checked against the running client.
 *
 * See docs/SCRIPT_DEPENDENCIES.md, *Decisions* §3.
 */

export interface ScriptCatalogEntry {
    /** Short noun phrase shown as the toggle's label. */
    title: string;
    /** One line under it: what turning this off would cost you. */
    description: string;
}

export const scriptCatalog: Record<string, ScriptCatalogEntry> = {
    // --- Narzędzia i aliasy ogólne ---
    fakeLine: {
        title: 'Sztuczna linia',
        description: 'Alias /fake przepuszcza podaną linię przez cały potok triggerów, jakby przyszła z gry.',
    },
    soundAliases: {
        title: 'Wyciszanie dźwięków',
        description: 'Aliasy /sounds, /mute i /unmute sterują dźwiękami klienta.',
    },
    mapAliases: {
        title: 'Polecenia mapy',
        description:
            'Aliasy /prowadz, /zlok, /note, /przeszukaj i pokrewne — chodzenie i notatki na mapie.',
    },
    zaznaczaj: {
        title: 'Zaznaczanie lokacji',
        description: 'Alias /zaznaczaj włącza i wyłącza oznaczanie odwiedzanych lokacji.',
    },
    allyProtection: {
        title: 'Ochrona sojuszników',
        description: 'Blokuje atak na postacie z gildii uznanych za sojusznicze.',
    },
    teamBlockers: {
        title: 'Przeszkody w drodze',
        description: 'Wyróżnia komunikaty o pajęczynach, wrotach i pułapkach, które zatrzymały twój ruch.',
    },
    move: {
        title: 'Podążanie za drużyną',
        description: 'Rozpoznaje, w którą stronę poszła drużyna, gdy podążasz, płyniesz lub jesteś przenoszony.',
    },
    directionBypass: {
        title: 'Ruch z pominięciem mapy',
        description: 'Aliasy `n!`, `se!`, `u!` — ruch bez pośrednictwa mapy i trybu chodzenia.',
    },
    noExitHighlight: {
        title: 'Brak wyjścia',
        description: 'Wyróżnia komunikat o próbie wyjścia w stronę, w którą nie ma przejścia.',
    },
    mapCorrections: {
        title: 'Korekty mapy',
        description: 'Cofa mapę o krok, gdy wejdziesz w wyjście, którego w rzeczywistości nie ma.',
    },
    tideWarningHighlight: {
        title: 'Ostrzeżenie o przypływie',
        description: 'Wyróżnia komunikaty zapowiadające nadchodzący przypływ.',
    },
    transportTracker: {
        title: 'Rozkład transportu',
        description: 'Śledzi statki i wozy, liczy czas do przystanku; aliasy /ttimes i /tdebug.',
    },
    gates: {
        title: 'Wrota',
        description: 'Obsługuje otwieranie wrót — dokłada polecenie „uderz we wrota” tam, gdzie trzeba.',
    },
    seat: {
        title: 'Siadanie',
        description: 'Podpowiada miejsca do siedzenia, gdy gra zapyta „Gdzie chcesz usiąść?”.',
    },

    // --- Walka ---
    attackBeep: {
        title: 'Sygnał ataku',
        description: 'Odtwarza dźwięk, gdy ktoś zaczyna cię atakować.',
    },
    warningTriggers: {
        title: 'Ostrzeżenie o sprzęcie',
        description:
            'Wyróżnia na czerwono komunikat o rozpadającym się sprzęcie i odtwarza dźwięk.',
    },
    lostTeamMates: {
        title: 'Zgubieni z drużyny',
        description: 'Pilnuje, którzy członkowie drużyny zniknęli z lokacji.',
    },
    attackQueue: {
        title: 'Kolejka ataków',
        description: 'Aliasy /nn i /cq — kolejkowanie celów do zaatakowania.',
    },
    attackModeAlias: {
        title: 'Tryb ataku',
        description: 'Alias /awr przełącza tryb ataku.',
    },
    lamp: {
        title: 'Lampa',
        description: 'Aliasy /zap i /zg — zapalanie i gaszenie lampy, z odliczaniem czasu palenia.',
    },
    coverTimer: {
        title: 'Licznik zasłony',
        description: 'Odlicza pięć sekund osłony po udanym zasłonięciu towarzysza.',
    },
    orderTimer: {
        title: 'Licznik rozkazu',
        description: 'Odlicza czas od wydania rozkazu drużynie.',
    },
    combatState: {
        title: 'Stan walki',
        description: 'Wykrywa wejście i wyjście z walki; podstawa dla liczników i wyróżnień.',
    },
    combatTimer: {
        title: 'Licznik walki',
        description: 'Pokazuje, ile czasu minęło od ostatniego starcia.',
    },
    weaponState: {
        title: 'Stan broni',
        description:
            'Śledzi z komunikatów gry, czy trzymasz broń; zasila wskaźnik w stopce.',
    },
    zaskTimer: {
        title: 'Licznik zaskoczenia',
        description: 'Odlicza czas do odzyskania zaskoczenia po zmianie lokacji w trybie skradania.',
    },
    worldDestructionTimer: {
        title: 'Zniszczenie świata',
        description: 'Odlicza czas do restartu świata na podstawie zapowiedzi Jeźdźca Apokalipsy.',
    },

    // --- Klawisze i bindy ---
    binds: {
        title: 'Bindy',
        description: 'Alias /binds — podgląd i zarządzanie przypisaniami klawiszy.',
    },
    tempBinds: {
        title: 'Bindy tymczasowe',
        description:
            'Aliasy /tbind1 i /tbind2 — krótkotrwałe przypisania klawiszy zakładane przez inne skrypty.',
    },
    walkCommands: {
        title: 'Polecenia wokół ruchu',
        description: 'Aliasy /pre_walk i /post_walk — polecenia wykonywane przed i po przejściu.',
    },
    directionBinds: {
        title: 'Bindy kierunków',
        description: 'Przypisuje klawisze do kierunków świata.',
    },
    enemyBinds: {
        title: 'Bindy wrogów',
        description: 'Przypisuje F1–F3 do przeciwników na lokacji; alias /nabindach.',
    },
    chatHistory: {
        title: 'Historia rozmów',
        description: 'Aliasy /chat i /chatw — zapis i podgląd rozmów.',
    },
    moveMode: {
        title: 'Tryb chodzenia',
        description: 'Przełącza sposób poruszania się — zwykły, skradanie, przemykanie z drużyną.',
    },
    carriage: {
        title: 'Powóz',
        description: 'Alias /woz — obsługa podróży wozem.',
    },
    pausers: {
        title: 'Wstrzymanie akcji',
        description: 'Wstrzymuje automatyczne akcje, gdy jesteś sparaliżowany albo edytujesz tekst.',
    },
    idz: {
        title: 'Chodzenie do celu',
        description: 'Aliasy /idz, /stop, /dalej, /szybciej, /wolniej — prowadzenie postaci trasą.',
    },

    // --- Liczniki ---
    kill: {
        title: 'Licznik zabitych',
        description: 'Liczy zabitych w sesji i przez całe życie postaci; aliasy /zabici i /zabici2.',
    },
    improveCounter: {
        title: 'Licznik postępów',
        description: 'Liczy postępy w sesji i historycznie; aliasy /postepy i /postepy2.',
    },
    escape: {
        title: 'Ucieczki',
        description: 'Wyróżnia komunikaty o tym, że ktoś ci uciekł albo że sam uciekłeś.',
    },
    tracking: {
        title: 'Tropienie',
        description: 'Koloruje wynik tropienia według pewności śladu.',
    },
    gps: {
        title: 'GPS',
        description: 'Rozpoznaje lokację po opisie, gdy mapa nie wie, gdzie jesteś.',
    },
    localizers: {
        title: 'Lokalizatory',
        description: 'Wyłapuje komunikaty zdradzające położenie — otwierane drzwi i podobne.',
    },
    followSpecialExits: {
        title: 'Wyjścia specjalne',
        description: 'Podąża za drużyną przez szczeliny i inne przejścia spoza mapy.',
    },
    trop: {
        title: 'Bind tropu',
        description: 'Przypisuje klawisz do kierunku wskazanego przez trop.',
    },
    mountain: {
        title: 'Wspinaczka',
        description: 'Śledzi wchodzenie i schodzenie w terenie górskim.',
    },
    drowning: {
        title: 'Tonięcie',
        description: 'Wyróżnia na niebiesko komunikaty o porwaniu przez fale.',
    },
    multibinds: {
        title: 'Multibindy',
        description: 'Alias /mbind — złożone makra pod jednym klawiszem.',
    },
    itemCollector: {
        title: 'Zbieranie łupów',
        description: 'Zbiera przedmioty z ciał po walce; aliasy /zbieraj_extra i /nie_zbieraj_extra.',
    },
    prettyContainers: {
        title: 'Ładne pojemniki',
        description: 'Przepisuje listy przedmiotów na kolumny z kolorami; alias /przejrzyj.',
    },
    bagManager: {
        title: 'Pojemniki',
        description: 'Aliasy /pojemnik i /pojemniki — który worek na monety, klejnoty i jedzenie.',
    },
    cutting: {
        title: 'Wycinanie',
        description: 'Aliasy /wyc i /wyr — wycinanie i wyrywanie z opóźnieniem udającym człowieka.',
    },
    deposits: {
        title: 'Depozyty',
        description: 'Aliasy /depozyt i /depozyty — zawartość i wartość depozytów.',
    },
    herbShop: {
        title: 'Sklep zielarski',
        description: 'Przepisuje cennik zielarza na czytelną tabelę.',
    },
    armorShop: {
        title: 'Sklep zbrojmistrza',
        description: 'Przepisuje cennik zbroi na czytelną tabelę.',
    },
    smith: {
        title: 'Naprawa u kowala',
        description: 'Alias /napraw_ubrania — oddawanie sprzętu do naprawy.',
    },
    commandPreserveCaseMode: {
        title: 'Zachowanie wielkości liter',
        description: 'Wyłącza zamianę polecenia na małe litery tam, gdzie treść ma znaczenie — np. w liście.',
    },
    herbCounter: {
        title: 'Licznik ziół',
        description: 'Zarządza woreczkami z ziołami; aliasy /ziola, /wezz, /zi i pokrewne.',
    },
    herbDescriptions: {
        title: 'Opisy ziół',
        description: 'Dokłada do nazw ziół ich opis i zastosowanie.',
    },
    lvlCalc: {
        title: 'Kalkulator poziomu',
        description:
            'Przechwytuje „cechy” i dolicza do wyniku poziom doświadczenia z sumy podcech.',
    },
    cechyHistory: {
        title: 'Historia cech',
        description: 'Zapisuje zmiany cech w czasie; alias /cechyw.',
    },
    compareAll: {
        title: 'Porównanie sprzętu',
        description: 'Alias /por — porównuje przedmioty w jednej tabeli.',
    },
    compareInline: {
        title: 'Porównanie w linii',
        description: 'Dokłada wynik porównania wprost do opisu przedmiotu.',
    },
    personDescription: {
        title: 'Opis postaci',
        description: 'Formatuje opis oglądanej postaci wraz z tym, jak jest znana.',
    },
    itemCondition: {
        title: 'Stan przedmiotu',
        description: 'Koloruje określenia stanu — od „w znakomitym stanie” po „w kiepskim stanie”.',
    },
    durability: {
        title: 'Trwałość',
        description: 'Koloruje określenia trwałości — od „naprawdę długo” po „bardzo krótko”.',
    },
    wearUsed: {
        title: 'Zużycie',
        description: 'Koloruje określenia zużycia — od „całkiem nowy” w dół.',
    },
    animalTaming: {
        title: 'Poziom oswojenia',
        description: 'Koloruje poziom oswojenia zwierzęcia.',
    },
    oswajanie: {
        title: 'Oswajanie',
        description: 'Prowadzi oswajanie zwierząt — karmienie, historia, eksport; aliasy /o_pokaz i /o_historia.',
    },
    invite: {
        title: 'Zaproszenia do drużyny',
        description: 'Obsługuje zapraszanie do drużyny z uwzględnieniem gildii wrogich.',
    },
    objectAliases: {
        title: 'Aliasy przedmiotów',
        description: 'Aliasy /zas, /za, /pro, /rz i pokrewne — skrócone odwołania do rzeczy na lokacji.',
    },
    magicKeys: {
        title: 'Klucze magiczne',
        description: 'Rozpoznaje i wyróżnia klucze magiczne na listach przedmiotów.',
    },
    magics: {
        title: 'Magiczne przedmioty',
        description: 'Rozpoznaje i wyróżnia magiczne przedmioty na listach.',
    },
    'magic-support': {
        title: 'Wsparcie magiczne',
        description: 'Wyłapuje komunikaty o działaniu amuletów i magicznej broni.',
    },
    spells: {
        title: 'Zaklęcia',
        description: 'Śledzi rzucane zaklęcia i ich skutki — oślepienie, paraliż i inne.',
    },
    knowledge: {
        title: 'Wiedza',
        description: 'Aliasy /zglebiaj, /wiedza i /biblioteki — nauka i baza książek.',
    },
    odlozMagie: {
        title: 'Odkładanie magii',
        description: 'Alias /odloz_magie — odkłada magiczne przedmioty do pojemnika.',
    },
    priceEvaluation: {
        title: 'Przeliczanie monet',
        description: 'Przelicza kwoty między mithrylem, złotem, srebrem i miedzią.',
    },
    stoneValue: {
        title: 'Wycena kamieni',
        description: 'Alias /ocenkamienie — szacuje wartość kamieni szlachetnych.',
    },
    selfEvaluation: {
        title: 'Ocena własnego sprzętu',
        description: 'Aliasy /ocen, /sprzet i /ubrania — zbiorczy przegląd noszonych rzeczy.',
    },
    skills: {
        title: 'Umiejętności',
        description:
            'Przechwytuje „um” i koloruje poziomy umiejętności według stopnia opanowania.',
    },
    languageSkills: {
        title: 'Znajomość języków',
        description:
            'Przechwytuje „jezyki” — poziom znajomości języków i maksima możliwe do osiągnięcia.',
    },
    coinColors: {
        title: 'Kolory monet',
        description: 'Koloruje monety według kruszcu — mithryl, złoto, srebro, miedź.',
    },
    weaponColors: {
        title: 'Kolory broni',
        description: 'Koloruje nazwy broni w opisach trzymanego oręża.',
    },
    leaderAttackWarning: {
        title: 'Ostrzeżenie o celu dowódcy',
        description: 'Przypomina na czerwono, kogo atakuje dowódca drużyny.',
    },
    breakItem: {
        title: 'Zniszczony przedmiot',
        description: 'Wyłapuje pęknięcie i rozprucie się rzeczy, podpowiada odłożenie złamanej broni.',
    },
    pipe: {
        title: 'Fajka',
        description: 'Aliasy /ziola_fajka i /zapal — nabijanie i palenie fajki, ze wskaźnikiem w stopce.',
    },
    hpAlert: {
        title: 'Alarm niskiego HP',
        description: 'Ostrzega, gdy punkty życia spadną poniżej ustawionego progu.',
    },
    idleFullHp: {
        title: 'Pełne HP w bezczynności',
        description: 'Sygnalizuje odzyskanie pełnego zdrowia podczas postoju.',
    },
    fullHpTimer: {
        title: 'Czas do pełnego HP',
        description: 'Szacuje, ile zostało do pełnej regeneracji.',
    },
    teamPanel: {
        title: 'Panel drużyny',
        description: 'Pokazuje skład drużyny i kto jest poza lokacją.',
    },
    noWeaponAlert: {
        title: 'Alarm braku broni',
        description: 'Ostrzega, gdy bijesz się gołymi rękami albo butem zamiast bronią.',
    },
    newMail: {
        title: 'Nowa poczta',
        description: 'Wyróżnia powiadomienie o liście od innego gracza.',
    },
    magikZnika: {
        title: 'Znikający magik',
        description: 'Wyróżnia komunikat o spopieleniu postaci białym płomieniem.',
    },
    seasonPrint: {
        title: 'Pora roku',
        description: 'Dokłada kolorowy znacznik pory roku do komunikatów o czasie.',
    },
    worldRebirth: {
        title: 'Odrodzenie świata',
        description: 'Zapamiętuje moment ostatniego restartu świata.',
    },
    dajeCiHighlight: {
        title: 'Wyróżnienie „daje ci”',
        description: 'Wyróżnia linie o tym, że ktoś coś ci wręcza.',
    },
    przybywajaCount: {
        title: 'Licznik przybywających',
        description: 'Liczy postacie przybywające i podążające na lokację.',
    },
    whoCount: {
        title: 'Licznik graczy',
        description: 'Podsumowuje odpowiedź na „kto” — ilu graczy i z jakich gildii.',
    },
    guildPostfix: {
        title: 'Znacznik gildii',
        description: 'Dokłada do imion oznaczenie gildii w wybranym kolorze.',
    },
    language: {
        title: 'Język mówienia',
        description:
            'Przechwytuje „justaw” — przełącza język, w którym mówisz, i dokłada odpowiednie aliasy.',
    },
    shortcuts: {
        title: 'Skróty lokacji',
        description: 'Nazwane skróty do numerów lokacji; aliasy /dodaj_skrot i /pokaz_skroty.',
    },
    letter: {
        title: 'Pisanie listów',
        description: 'Alias /list — edytor listów wysyłanych pocztą w grze.',
    },
    shortExits: {
        title: 'Skrócone wyjścia',
        description: 'Zamienia listę wyjść na skróconą, kolorowaną formę.',
    },
    externalScripts: {
        title: 'Wtyczki zewnętrzne',
        description: 'Ładuje wtyczki użytkownika — bez tego żadna wtyczka nie wystartuje.',
    },
    userAliases: {
        title: 'Aliasy użytkownika',
        description: 'Uruchamia aliasy zdefiniowane przez ciebie w ustawieniach.',
    },
    userTriggers: {
        title: 'Triggery użytkownika',
        description: 'Uruchamia triggery zdefiniowane przez ciebie w ustawieniach.',
    },
    zlom: {
        title: 'Złom',
        description: 'Baza ocenionego oręża i zbroi z własnymi kolorami; aliasy /zlom i /zlomw.',
    },
    weaponEvaluation: {
        title: 'Ocena broni',
        description: 'Przepisuje ocenę broni na czytelną tabelę.',
    },
    armorEvaluation: {
        title: 'Ocena zbroi',
        description: 'Przepisuje ocenę zbroi na czytelną tabelę.',
    },
    parryShieldEvaluation: {
        title: 'Ocena tarczy',
        description: 'Przepisuje ocenę tarczy i parowania na czytelną tabelę.',
    },
    specialLocations: {
        title: 'Lokacje szczególne',
        description: 'Obsługuje przejścia w miejscach, których mapa nie opisuje — trapy, pokłady.',
    },
    People: {
        title: 'Baza graczy',
        description: 'Koloruje imiona według gildii, sojuszy i wrogów.',
    },
    gags: {
        title: 'Ukrywanie linii walki',
        description: 'Ukrywa powtarzalne komunikaty walki.',
    },
    luaGags: {
        title: 'Ukrywanie linii (Lua)',
        description: 'Ukrywanie i kolorowanie walki regułami w Lua.',
    },
    combatWindow: {
        title: 'Okno walki',
        description:
            'Przenosi komunikaty walki do osobnego okna; aliasy /walkaw i /postawaw.',
    },
    combatStats: {
        title: 'Statystyki walki',
        description: 'Aliasy /stat i /statw — zadane i otrzymane obrażenia.',
    },
    killTracker: {
        title: 'Przeszukiwanie ciał',
        description: 'Alias /loot — otwiera okno z zawartością ciał i rzeczami na ziemi.',
    },
    PackageHelper: {
        title: 'Pomocnik paczek',
        description: 'Prowadzi przez dostarczanie paczek i pilnuje, do którego pojemnika trafiają.',
    },
    inlineCompassRose: {
        title: 'Róża wiatrów',
        description: 'Alias /roza — róża wiatrów z wyjściami wpleciona w opis lokacji.',
    },
    clock: {
        title: 'Zegar',
        description: 'Aliasy /czas i /czasw — czas gry, pora dnia i roku.',
    },
    sunTracker: {
        title: 'Wschody i zachody',
        description: 'Alias /slonce — kiedy wzejdzie i zajdzie słońce.',
    },
    wyroznienieOptions: {
        title: 'Opcje wyróżnienia',
        description: 'Formatuje listę tytułów związanych z wyróżnieniem.',
    },
    contracts: {
        title: 'Zlecenia',
        description: 'Alias /zlecenia — lista przyjętych zleceń i postęp.',
    },
    fishing: {
        title: 'Wędkowanie',
        description: 'Alias /wedka — obsługa łowienia i rozpoznawanie brań.',
    },
    spiderWeb: {
        title: 'Pajęczyna',
        description: 'Wykrywa pajęczą pułapkę i podpina kierunek do ponownej próby.',
    },
    poczta: {
        title: 'Poczta',
        description: 'Alias /poczta — lista listów przepisana do okna.',
    },
    languageTeacher: {
        title: 'Nauczyciel języka',
        description: 'Obsługuje propozycje nauki języka od innych postaci.',
    },
    profession: {
        title: 'Zawód',
        description: 'Aliasy /zawod i /staz — postęp w zawodzie i stażu.',
    },
    introduced: {
        title: 'Przedstawieni',
        description: 'Alias /przedstawieni — kto się tobie przedstawił i pod jakim imieniem.',
    },
    aligatorEmoji: {
        title: 'Ostrzeżenie o aligatorze',
        description:
            'Wyróżnia komunikat o czymś zbliżającym się przez szuwary i dokłada emoji aligatora.',
    },
    staticMapWindow: {
        title: 'Okno mapy',
        description: 'Alias /mapa — mapa okolicy w osobnym oknie.',
    },
    deliveryStats: {
        title: 'Statystyki dostaw',
        description: 'Alias /paczki — ile paczek dostarczono i za ile.',
    },
    afterDeathProgress: {
        title: 'Postępy po śmierci',
        description:
            'Dopisuje [n/15] do komunikatu o cechach osłabionych po śmierci, pokazując ile brakuje.',
    },
    brokilon: {
        title: 'Brokilon',
        description: 'Obsługa okolic Brokilonu — m.in. komunikat o niemożności skrzywdzenia driad.',
    },
    tideSystem: {
        title: 'Przypływy',
        description: 'Alias /przyplyw — stan przypływu i wpływ na przejścia.',
    },
    labyrinth: {
        title: 'Labirynt',
        description: 'Alias /labirynt — pomoc w przechodzeniu labiryntu.',
    },
    rindeLabyrinthMapper: {
        title: 'Mapa labiryntu (Rinde)',
        description: 'Alias /labirynt_mapa — rysuje mapę labiryntu pod Rindem.',
    },
    raonLabyrinthMapper: {
        title: 'Mapa labiryntu (Raon)',
        description: 'Alias /raon_mapa — rysuje mapę labiryntu w Raon.',
    },
    lootParser: {
        title: 'Rozbiór łupów',
        description: 'Rozpoznaje zawartość ciał i rzeczy na ziemi, koloruje je i czyni klikalnymi.',
    },
    messageFlair: {
        title: 'Wyróżnianie bloków',
        description: 'Oznacza całe odpowiedzi — ekwipunek, łup, opis — tłem i ikoną na marginesie.',
    },
    ostatnio: {
        title: 'Ostatnio widziani',
        description: 'Alias /ostatnio — kto był ostatnio aktywny.',
    },
    dobOp: {
        title: 'Skróty /dob i /op',
        description: 'Trzy własne polecenia pod /dob i trzy pod /op, ustawiane w opcjach.',
    },
    dataRefresh: {
        title: 'Odświeżanie danych',
        description: 'Aliasy /refresh_magics, /refresh_keys i /refresh_knowledge — pobiera dane na nowo.',
    },
    tcolor: {
        title: 'Kolorowanie tymczasowe',
        description: 'Alias /tcolor — podświetla podaną frazę do końca sesji.',
    },
    opal: {
        title: 'Przejście w jaskini',
        description:
            'Dopisuje do mapy wyjście w górę z jaskini, gdy zejdziesz nim w dół.',
    },
    lastSeen: {
        title: 'Ostatnio widziane HP',
        description: 'Alias /hp — zapamiętuje stan zdrowia napotkanych postaci.',
    },
    bilety: {
        title: 'Bilety',
        description:
            'Alias /bilety kupuje bilety dla całej drużyny obecnej na lokacji.',
    },
};
