# Inne aliasy

Pozostałe aliasy i funkcje rozszerzenia.

## Własne aliasy

Własne aliasy tworzysz w oknie **Automatyzacja** (Menu → Automatyzacja), razem z triggerami (wyzwalaczami):
- **Wzorzec** - wyrażenie regularne dopasowujące komendę
- **Akcje** - co ma się stać, po kolei: komenda wysyłana do serwera, dźwięk, powiadomienie (także na telefon), czytanie na głos, funkcyjny bind, uruchomienie skryptu, włączenie lub wyłączenie grupy. W tekstach akcji `$1`, `$2` itp. wstawiają grupy z dopasowania
- **Skróty obiektów** - `@1`, `@A`, `@@` zostaną zamienione na identyfikatory obiektów
- **Kilka komend** - średnik rozdziela kilka komend w jednym polu
- **Inaczej dla postaci** - dla wybranej postaci alias może wysyłać inną komendę; zastępuje ona wszystkie komendy z akcji

### Okno Automatyzacja

- **Lista** - aliasy i wyzwalacze razem, podzielone na grupy. Po lewej wybierasz rodzaj (Wszystko, Aliasy, Wyzwalacze) i to, co pokazać (wyłączone, tylko to, co działa na tej postaci). Przełącznik przy każdym wierszu włącza i wyłącza element od razu
- **Grupy** - `+` → Grupa (albo przycisk z folderem obok) tworzy nową grupę; od razu wpisujesz jej nazwę. Elementy przeciągasz na grupę albo między innymi elementami, żeby zmienić kolejność - aliasy, wyzwalacze i skrypty mogą być w grupie wymieszane. Grupy też można przeciągać. Przełącznik przy grupie włącza lub wyłącza wszystko, co w niej jest. Menu grupy (`...` albo prawy przycisk) pozwala dodać do niej nowy element, zmienić nazwę, wyeksportować ją do pliku albo usunąć razem ze wszystkim, co w niej jest
- **Prawy przycisk na elemencie** - edycja, duplikat, włączenie/wyłączenie, przeniesienie do grupy (także do nowej; tak przenosisz elementy na telefonie) i usunięcie
- **Edytor** - krok 1 *Kiedy* (wzorzec i linia testowa, która od razu pokazuje, czy wzorzec pasuje i co trafi do `$1`), krok 2 *Co zrobić* (akcje po kolei; kolejność zmienisz, przeciągając za uchwyt, a pod spodem widać, co zostanie wysłane), krok 3 *Dla kogo*. Zmiany zapisuje **Zapisz** (albo `Ctrl+Enter`); kropka przy wierszu oznacza niezapisane zmiany
- **Włączony** - wyłączony alias lub wyzwalacz zostaje zapisany, ale nie działa
- **Dla kogo** - wszystkie postacie albo tylko wybrane; na innej postaci element nie działa
- **Eksport i import** - "Eksportuj wszystko" albo eksport jednej grupy zapisuje plik `.json`, który ktoś inny wczyta przez "Importuj" → "Plik automatyzacji". Import niczego nie nadpisuje: alias o istniejącym wzorcu i identyczny wyzwalacz zostają pominięte

### Zakresy ($i)

Użyj `$i` w komendzie, aby powtórzyć ją dla zakresu liczb. Zakres podajesz jako argument aliasu w formacie `X-Y`.

**Przykład:**
- Wzorzec: `kok (.+)`
- Komenda: `rozerwij $i. kokon`
- Wpisz: `kok 1-7`
- Wynik: `rozerwij 1. kokon`, `rozerwij 2. kokon`, ..., `rozerwij 7. kokon`

Zakresy działają rosnąco (`1-7`) i malejąco (`7-1`). Maksymalnie 50 iteracji.

## Asystent AI

| Komenda | Opis |
|---------|------|
| `/pomoc` | Otwórz panel asystenta AI |
| `/pomoc <pytanie>` | Otwórz panel i od razu zadaj pytanie |

> **Wskazówka:** Asystent odpowiada po polsku i zna ustawienia, komendy i zdarzenia tego klienta. Jeśli w odpowiedzi jest konkretna zmiana (ustawienie, alias, trigger, bind), pojawi się karta z przyciskami **Zastosuj** / **Odrzuć** - nic nie zostanie zapisane, dopóki sam nie klikniesz "Zastosuj". Panel jest zwykłym oknem: można go zadokować, przypiąć i odłączyć do osobnego okna. Własny klucz API (opcjonalny) ustawisz przyciskiem "Ustawienia" w nagłówku panelu; jest zapisywany tylko na tym urządzeniu i nie trafia do synchronizacji w chmurze.

## Komunikacja

| Komenda | Opis |
|---------|------|
| `/fake tekst` | Wyświetl podany tekst jak zwykłą wiadomość klienta |
| `/chat` | Wyświetl ostatnie 20 wiadomości z czatu GMCP |
| `/chatw` lub `/chat okno` | Otwórz okno czatu z historią 100 wiadomości |
| `/list` | Otwórz edytor pisania listów w kliencie |
| `/poczta` | Otwórz okno poczty z listą listów |

> **Własne szablony listów:** w edytorze listów przycisk z ikoną obok wyboru szablonu ("Własne szablony listów") otwiera edytor własnych ramek. Nowy szablon powstaje jako kopia wybranego (wbudowanego lub własnego) i składa się z nagłówka, początku i końca każdej linii treści oraz stopki. W nagłówku i stopce tekst w klamrach jest powtarzany na szerokość treści (i przycinany, jeśli się nie mieści w całości), np. ` +--{-}--+ ` albo ` +{-=}+ `, dzięki czemu ramka dopasowuje się do szerokości linii z ustawień. Własne szablony są wspólne dla wszystkich postaci i synchronizują się między urządzeniami. Początek i koniec linii treści też mogą mieć kilka linii — kolejne linie treści dostają je po kolei, w kółko (np. falujący brzeg ramki).

> **Wyrównanie tekstu:** przyciski nad polem treści wybierają, jak tekst listu jest ułożony w szablonie: justowany (domyślnie), do lewej, wyśrodkowany albo do prawej. Wybór dotyczy całej treści, od razu widać go w podglądzie i jest zapamiętywany dla kolejnych listów. Linia zaczynająca się od `>` jest zawsze wyrównana do prawej (np. podpis).

> **Wskazówka:** W oknie czatu przycisk "Drużyna" filtruje wiadomości od członków drużyny. Przewinięcie historii w górę dzieli okno na dwie części — na dole zostaje przyklejony podgląd najnowszych wiadomości, tak samo jak w oknie głównym i w oknie walki.

## Czas

| Komenda | Opis |
|---------|------|
| `/czas` | Otwórz okno zegara z aktualnym czasem w grze |
| `/czas imperium <godzina> [<dzien>]` | Ustaw czas w Imperium (godzina 0-23, opcjonalnie dzień roku 1-400) |
| `/czas ishtar <godzina> [<dzien>]` | Ustaw czas w Ishtar (godzina 0-23, opcjonalnie dzień roku 1-360) |

> **Wskazówka:** Czas można również ustawić w oknie zegara - wybierz godzinę, miesiąc i dzień, a następnie kliknij "Ustaw".

## Język

| Komenda | Opis |
|---------|------|
| `justaw jezyk` | Ustaw język rozmów (np. `justaw krasnoludzki`) |
| `'tekst` | Mów w ustawionym języku (pojedynczy apostrof przed tekstem) |

## Drużyna

| Komenda | Opis |
|---------|------|
| `/ostatnio` | Sprawdź aktywność członków drużyny (zielony = aktywny, czerwony = nieaktywny) |
| `/bilety` | Kup bilet dla każdego członka drużyny na lokacji i wręcz go (wyciąga monety przed i odkłada po) |
| `/hp` | Wyświetl pomoc dla komendy ostatnio widzianych kondycji |
| `/hp wszystkich` | Wyświetl ostatnio widziane kondycje wszystkich postaci na lokacji |
| `/hp wroga` | Pokaż tylko kondycje oznaczonych wrogów (alias: `/hp przeciwnika`) |
| `/hp imiona` | Pokaż tylko kondycje postaci po imieniu (jednowyrazowe opisy) |
| `/hp <fraza>` | Filtruj kondycje po fragmencie opisu (np. `/hp gobl`) |
| `/hp -` | Wyczyść całą listę zapamiętanych kondycji |
| `/hp -<fraza>` | Usuń z listy wpisy pasujące do frazy |

> **Wskazówka:** Kondycje są zbierane automatycznie z danych GMCP, a wpisy znikają po 15 minutach lub gdy postać umrze. Pasek HP jest kolorowany według poziomu zdrowia, a opisy wrogów podświetlone na czerwono, członków drużyny na zielono. Dla opisów zawierających spacje wyświetlana jest dopasowana postać z bazy ludzi (imię i gildia).

## Przedstawieni

| Komenda | Opis |
|---------|------|
| `/przedstawieni` | Wyświetl listę przedstawionych postaci |

## Bindy

| Komenda | Opis |
|---------|------|
| `/binds` | Wyświetl listę skonfigurowanych bindów |
| `/przycisk nazwa [on\|off]` | Zapal lub zgaś własne przyciski stopki o tym stanie (bez `on`/`off` przełącza) |

## Dźwięk

| Komenda | Opis |
|---------|------|
| `/sounds` | Przełącz wyciszenie/włączenie dźwięków |
| `/mute` | Wycisz dźwięki |
| `/unmute` | Włącz dźwięki |

## Przypływ

| Komenda | Opis |
|---------|------|
| `/przyplyw` | Przełącz system przypływów (zmienia mapę: pokoje przybrzeżne przesuwają się pod wodę, tworzą się pokoje na powierzchni) |

> **Wskazówka:** System przypływów aktywuje się i dezaktywuje również automatycznie na podstawie komunikatów w grze, gdy znajdujesz się w strefie przypływów.

## Dobywanie/Opuszczanie

| Komenda | Opis |
|---------|------|
| `/dob` | Wykonaj komendy dobywania ze slotów 1 i 2 |
| `/dob [1-3]` | Wykonaj komendę dobywania z wybranego slotu |
| `/op` | Wykonaj komendy opuszczania ze slotów 1 i 2 |
| `/op [1-3]` | Wykonaj komendę opuszczania z wybranego slotu |

> **Konfiguracja:** Komendy konfiguruje się w ustawieniach postaci w sekcji "Dobywanie/Opuszczanie". Każdy slot może zawierać wiele komend oddzielonych średnikiem (;).

## Kalendarz słońca

| Komenda | Opis |
|---------|------|
| `/slonce` | Otwórz kalendarz słońca z obserwacjami wschodów i zachodów |

## Kolorowanie

| Komenda | Opis |
|---------|------|
| `/tcolor fraza` | Dodaje tymczasowe kolorowanie frazy na pomarańczowo (tylko na czas sesji) |

> **Wskazówka:** Można wywoływać wielokrotnie, aby kolorować wiele fraz jednocześnie. Kolorowanie znika po zakończeniu sesji.

## Łowienie ryb

| Komenda | Opis |
|---------|------|
| `/wedka` | Otwórz okno łowienia ryb z wyborem przynęty i przyciskami akcji |

> **Wskazówka:** Gdy ryba bierze, kliknij przycisk "Zatnij rybę" lub użyj funkcjonalnego bindu (domyślnie `]`).

## Złom (baza ocenionych przedmiotów)

| Komenda | Opis |
|---------|------|
| `/zlom` | Wyświetl zapisane bronie (alias `/zlom bronie`) |
| `/zlom tarcze` | Wyświetl zapisane tarcze |
| `/zlom zbroje` | Wyświetl zapisane zbroje |
| `/zlomw` | Otwórz okno złomu z tabelami i importem bazy z Mudleta |
| `/zlom-reset` | Wyczyść bazę i zdejmij podświetlenia shortów |

> **Wskazówka:** Baza automatycznie zapisuje wyniki komendy `ocen <przedmiot>` i podświetla rozpoznane shorty w tekście (pogrubienie + podkreślenie dla broni ze srebrem, dymek z typem). Kolory shortów ustawiasz w oknie `/zlomw` (kolumna "Kolor") — te same kolory stosowane są w listach łupu (`loot`) i w pojemnikach (`pretty containers`). Przełącznik "Srebro" w nagłówku okna kontroluje podkreślanie broni ze srebra. Okno pozwala też zaimportować plik `.db` z profilu Mudleta (tabele `bronie`, `tarcze`, `zbroje`).

## Odporności przeciwników

| Alias | Opis |
|-------|------|
| `/odpornosci` | Otwórz okno odporności przeciwników (tabela przeciwnik x rodzaj obrażeń) |
| `/odpornosci <fraza>` | Wypisz w oknie gry przeciwników, których nazwa zawiera frazę (np. `/odpornosci kikimora`) |
| `/odpornosci-usun <nazwa>` | Usuń wpisy przeciwnika ze wszystkich obszarów (rodzaj w mianowniku, np. `kikimora`) |
| `/odpornosci-reset` | Wyczyść całą bazę odporności |

> **Wskazówka:** Baza zapisuje się sama z wyników `ocen <przeciwnik>` — wystarczy linia "Twoje doswiadczenie i umiejetnosci podpowiadaja ci, ze jest on odporny/wrazliwy na ...". Nazwa w mianowniku brana jest z linii porównania ("... niz wielka krwiozercza kikimora."); gdy jej brak, przeciwnik jest dopasowywany do obiektów na lokacji. Przymiotniki są pomijane — "wielka krwiozercza kikimora" i "mala kikimora" to jeden wpis `kikimora` (nazwy dwuczłonowe, np. `zywiolak ognia`, `troll jaskiniowy`, zostają w całości). Postaci z imieniem (gracze, nazwani NPC) nie są zapisywane. Wpis zapamiętuje też obszar mapy, na którym oceniałaś — ten sam rodzaj potrafi mieć inne odporności w różnych obszarach. Dopóki odporności są wszędzie takie same, widzisz jeden wiersz bez żadnej wzmianki o obszarze; dopiero gdy gdzieś wyjdą inne, wiersz rozdziela się na kilka, a przy nazwie pojawia się nazwa obszaru (`X` w wierszu usuwa tylko ten obszar). Pomarańczowy trójkąt przy nazwie oznacza wpis bez obszaru (zapisany, zanim obszary były zapamiętywane, albo poza mapą) — oceń przeciwnika ponownie, żeby go przypisać. Jeśli linii z odpornościami nie da się odczytać albo nie wiadomo, którego przeciwnika dotyczy, pod linią pojawia się pomarańczowy komunikat - kliknięcie kopiuje oryginalną linię do schowka, żeby można ją było zgłosić. Przełącznik Tabela/Lista zmienia widok: lista pokazuje dla każdego przeciwnika wrażliwości i odporności jako ikonki. W oknie `W` (zielone) oznacza wrażliwość, `O` (czerwone) odporność; kliknięcie nagłówka kolumny sortuje najpierw przeciwników wrażliwych na dany rodzaj obrażeń. Okno otworzysz też z menu kontekstowego (pozycja "Odporności").

## Zasłony (debug)

| Alias | Opis |
|-------|------|
| `/zaslony` | Otwórz okno podglądu zasłon (kto jest zasłaniany, przez kogo i przed kim) |

> **Wskazówka:** Okno jest narzędziem diagnostycznym dla mechaniki zasłon. Gra nie wysyła stanu zasłony w GMCP - nie ma żadnego pola `covered_by` - więc stan jest wnioskowany z linii tekstu. Zasłona nie ma własnego czasu trwania: trwa, dopóki nie zostanie przełamana, zdjęta, zastąpiona nową zasłoną przed tym samym atakującym albo któraś ze stron nie umrze. Górna tabela pokazuje wszystkie postacie na lokacji podzielone na `Drużyna` i `Wrogowie`. Kluczowa jest kolumna **przed kim**: zasłona działa tylko przeciw atakującym wymienionym w linii `zaslania ... przed ciosami ...`, więc ten sam cel może być zablokowany dla członka drużyny i całkowicie dostępny dla ciebie. Twój wpis jest pogrubiony, a status `ZASŁONIĘTY` (czerwony) oznacza, że to *ty* nie możesz trafić; `zasłaniany` (pomarańczowy) oznacza zasłonę przed kimś innym. Stan bierze się wyłącznie z tekstu gry. Przeskok `attack_num` w GMCP wygląda tak samo, gdy zasłona przekierowała cios, jak i wtedy, gdy ktoś po prostu zmienił cel, więc trafia tylko do logu (wpis `GMCP`, ukrywany przyciskiem **bez GMCP**) i nigdy nie tworzy zasłony - logowane są przy tym tylko te przeskoki, których nie tłumaczy żadna znana zasłona. Wpisy pisane kursywą są niepewne (nie dało się jednoznacznie dopasować opisu do postaci na lokacji). Licznik `nieznane blokady` liczy sytuacje, w których linia `staje ci na drodze` trafiła na zasłonę, o której nie wiedzieliśmy - wartość większa od zera w normalnej walce oznacza przeoczoną linię założenia zasłony, nie szum. Wpis `WYGASŁO` podaje przyczynę: `zastąpiona nową zasłoną` (przed jednym atakującym stoi naraz tylko jedna zasłona - `attack_num` to jedna wartość i gra przesuwa ją na najnowszego zasłaniającego, więc nowa zasłona przed tym samym atakującym kończy poprzednią), `zniknął z lokacji` (wraz z opisem, kto zniknął), `śmierć`, `ogłuszenie` lub `limit wieku` (10 minut - jedyne ograniczenie czasowe, zabezpieczenie na wypadek zasłony zakończonej bez żadnej czytelnej linii; w normalnej walce nie powinno wystąpić).  Dolny panel to log zdarzeń (najnowsze na górze, do 200 wpisów) z oryginalną linią gry pod każdym wpisem; przycisk **bez GMCP** ukrywa wpisy wywnioskowane wyłącznie z GMCP, **Wyczyść** czyści log i licznik. Udane `przelam obrone` zdejmuje zasłonę dla całej drużyny naraz, nieudane nie zdejmuje jej nikomu.

## Oswajanie

| Komenda | Opis |
|---------|------|
| `/o_pomoc` | Otwórz okno oswajania z pomocą i listą aliasów |
| `/o_pokaz` | Pokaż listę oswajanych zwierząt (z przyciskiem aktywne/nieaktywne) |
| `/o_pokaz <zwierze>` | Pokaż historię karmienia i poziomy oswojenia danego zwierzęcia |
| `/o_ostatnio` | Pokaż historię ostatnio karmionego zwierzęcia |
| `/o_historia` | Pokaż historię karmienia wszystkich aktywnych zwierząt |
| `/o_wylacz <zwierze>` | Oznacz zwierzę jako nieaktywne (ukrywa z historii) |
| `/o_wlacz <zwierze>` | Oznacz zwierzę jako aktywne |
| `/o_przemianuj <stare> na <nowe>` | Zmień nazwę zwierzęcia w bazie |
| `/o_eksport` | Zapisz bazę oswajania tej postaci do pliku JSON |
| `/o_import` | Wczytaj bazę z pliku JSON (nadpisuje bazę tej postaci) |

> **Wskazówka:** Baza buduje się automatycznie z komend `oswajaj zwierze ...`. Po oswojeniu wykonaj `ocen zwierze` (po nakarmieniu jest to automatycznie podstawiane pod funkcjonalny bind), aby zapisać poziom oswojenia. Dane są zapisywane osobno dla każdej postaci. Po nakarmieniu, po upływie czasu odnowienia, pojawi się powiadomienie, że można oswajać ponownie. Okno otworzysz też z menu kontekstowego (prawy przycisk myszy na oknie gry, pozycja "Oswajanie").

> **Widok zwierzęcia:** Na górze wybierasz zwierzę z listy; nieaktywne można włączyć przyciskiem "Aktywuj". W tabeli kolumna "ile" rozwija (klik) poprzednie wpisy danego pokarmu. Różne opisy tego samego pokarmu (np. `miesem` i `kawalkiem miesa`) możesz scalić ikoną połączenia przy pokarmie — wtedy mają wspólny licznik czasu i jedną grupę, a kolejne karmienia automatycznie trafiają do tej grupy. Połączenie pokarmów jest globalne (wspólne dla wszystkich postaci); cofniesz je ikoną rozłączenia.

## Wóz/bryczka

| Komenda | Opis |
|---------|------|
| `/woz` | Przełącz tryb wozu (włącz/wyłącz) |
| `/wozw` | Otwórz okno "Wozy": data najmu, wozownia, koszt, kaucja i miejsce postoju. Przycisk "Blokady" w nagłówku otwiera listę lokacji nieprzejezdnych z podglądem na mapie, usuwaniem pojedynczych wpisów i czyszczeniem całej listy |
| `/wozblok` | Oznacz/odznacz bieżącą lokację jako nieprzejezdną dla wozu (opcjonalnie numer lokacji) |
| `/wozbloki` | Pokaż listę nieprzejezdnych lokacji i linię do skopiowania |
| `/wozbloki+ <numery>` | Wczytaj listę nieprzejezdnych lokacji |
| `/wozbloki-` | Wyczyść listę nieprzejezdnych lokacji |

> **Wskazówka:** Tryb wozu włącza się i wyłącza automatycznie przy wsiadaniu/zsiadaniu, wstawaniu i zwracaniu pojazdu, a także gdy pojazd sam się zatrzyma (rozdroże, brak dalszej drogi). Alias `/woz` pozwala przełączyć go ręcznie, gdyby automatyczne wykrywanie zawiodło. W trybie wozu przycisk trybu ruchu jest zablokowany.

> **Wskazówka:** Tryb wozu włącza się tylko wtedy, gdy to ty powozisz — czyli kiedy jedziesz sam albo prowadzisz drużynę. Jako pasażer (jesteś w drużynie, ale nie ty ją prowadzisz) masz strzałki i klawisz `zerknij` bez zmian, bo i tak nie możesz kierować pojazdem; pojazd jest za to normalnie zapisywany w oknie `/wozw` i na mapie, a bind `usiadz ...` dalej się pokazuje. Jeśli przejmiesz prowadzenie drużyny w trakcie jazdy, tryb wozu włączy się sam (i wyłączy, gdy oddasz prowadzenie). Alias `/woz` ma pierwszeństwo przed tym sprawdzeniem — możesz nim włączyć tryb wozu także jako pasażer.

> **Wskazówka:** Okno "Wozy" (`/wozw`, także z menu pod prawym przyciskiem myszy) pamięta każdy wynajęty pojazd osobno, więc działa także, gdy masz ich kilka. Wozownia i miejsce postoju mają przyciski prowadzenia z odległością w nawiasie. Kaucja w całości wraca tylko przez 6 godzin od najmu; po tym terminie wozownia zatrzymuje jej część, dlatego okno pokazuje godzinę wygaśnięcia i ile czasu zostało (na 30 minut przed końcem wpis się podświetla). Wpis znika po zwrocie pojazdu, można go też usunąć ręcznie przyciskiem `X`.

> **Wskazówka:** Zaparkowane pojazdy są zaznaczone na mapie kołem wozu z nazwą typu pojazdu (`woz`, `bryczka`, `dylizans`). Znacznik znika, kiedy wsiadasz do pojazdu, i wraca w nowym miejscu po zsiadnięciu.

> **Wskazówka:** Okno rozróżnia, czy siedzisz w stojącym pojeździe, czy jedziesz — znacznik przy nazwie pokazuje `stoisz` albo `jedziesz`, na podstawie komunikatów `... rusza na ...` i `... zatrzymuje sie.` twojego pojazdu.

> **Wskazówka:** W czasie jazdy `zerknij` zatrzymuje pojazd — wysyła `zatrzymaj woz` / `zatrzymaj bryczke` / `zatrzymaj dylizans`. Kiedy pojazd stoi, `zerknij` znowu rozgląda się po lokacji. Tak działa klawisz `zerknij` (domyślnie Numpad5) i środkowy przycisk krzyżaka na panelu mobilnym; to samo można przypisać dowolnemu przyciskowi mobilnemu lub desktopowemu, wybierając makro **Zerknij / zatrzymaj pojazd**.

> **Wskazówka:** Po ponownym połączeniu z grą ("przywracam polaczenie" albo "polaczenie zostalo przywrocone") gra wysadza cię z pojazdu, więc klient zapisuje pojazd jako zaparkowany w bieżącej lokacji. Jeśli przerwa była na tyle długa, że logujesz się od nowa, pojazd zostaje zaparkowany w ostatniej znanej lokacji. Jeśli mapa nie nadążyła, miejsce postoju poprawia się samo, gdy zobaczysz pojazd w opisie lokacji.

> **Wskazówka:** Lokacje oznaczone przez `/wozblok` są omijane przy prowadzeniu (`/prowadz`, `/prowadzt`, kliknięcie na mapie) tylko wtedy, gdy jedziesz wozem — pieszo nic się nie zmienia. Jeśli cel jest nieprzejezdny (np. wnętrze budynku), trasa dzieli się na dwa odcinki w różnych kolorach: dojazd wozem i dalsza droga pieszo, a klient wypisuje, gdzie zostawić wóz. Wyjścia specjalne składające się z kilku słów (`wejdz na skaly`, `zejdz na dol`, `przecisnij sie przez szczeline`) są pomijane przy jeździe automatycznie — to czynności, których nie wykonasz, siedząc na wozie, więc nie trzeba ich oznaczać. Kiedy pojazd stanie na końcu drogi (`Nie ma tu zadnej drogi, ktora mozna by dalej jechac.`), klient oznacza wszystkie sąsiednie lokacje poza tą, z której przyjechałeś — ale tylko wtedy, gdy gra wypisała przy opisie lokacji listę wyjść; bez niej nic nie jest zapamiętywane. Klient dopisuje lokacje sam, kiedy gra odmówi przejazdu (`Nie mozna jechac na ...`) — blokowana jest lokacja **za** tym wyjściem, nie ta, w której stoisz. Lista jest wspólna dla wszystkich postaci i na razie zbierana samodzielnie — `/wozbloki` wypisuje ją w formie gotowej do skopiowania. Oznaczone lokacje można pokazać na mapie jako przekreślone kółko — włącza się to w menu mapy ("Nieprzejezdne dla wozu"), domyślnie jest wyłączone. Znaczniki widać także wtedy, gdy idziesz pieszo, bo często dopiero wtedy widać, że wóz tam nie wjedzie.

> **Wskazówka:** Bindy: kiedy wracasz pieszo do lokacji, w której stoi twój pojazd, bind zmienia się na `usiadz na wozie` / `usiadz w bryczce` / `usiadz w dylizansie`. Bind znika, gdy odejdziesz z lokacji. Kiedy prowadzisz trasę wozem, na bindzie głównym pojawia się kolejny krok trasy (a w miejscu, gdzie trzeba zostawić wóz — `zsiadz z ...`). Bind pokazuje się tylko wtedy, gdy wóz stoi, i aktualizuje się, gdy trasa się zmieni; wyłączysz go opcją "Bindy trasy wozu". W ustawieniach (Interfejs → Komendy) można włączyć opcję, która sprawia, że powtórzenie odrzuconej komendy jazdy (`Nie mozna jechac na ...`) wysyła dwie komendy: zsiadnięcie z wozu i przejście pieszo w tym kierunku. Komunikaty kończące jazdę (`Dojechaliscie do rozdrozy.` i `Nie ma tu zadnej drogi, ktora mozna by dalej jechac.`) są podświetlane na żółto, żeby nie zginęły w opisach mijanych lokacji.

## Odkładanie magii

| Komenda | Opis |
|---------|------|
| `/odloz_magie [pojemnik]` | Odłóż magię do pojemnika |

## Labirynty

| Komenda | Opis |
|---------|------|
| `/labirynt` | Przełącz tryb labiryntu (dynamicznie usuwa nieistniejące wyjścia) |
| `/labirynt_mapa` | Przełącz mapper Labiryntu Rinde |
| `/raon_mapa` | Przełącz mapper Labiryntu Raon |
| `/taragorn` | Rozpoznaj ponownie lokację w labiryncie pod świątynią Taragorna |

## Skarbce

| Komenda | Opis |
|---------|------|
| `/lisica` | Wystukaj na drzwiach zapamiętane hasło (pierwsza cyfra = liczba puknięć) |
| `/lisica 1-9-5-2` | Wystukaj podane hasło i zapamiętaj je (działa też `1952`, `1 9 5 2`) |
| `/lisica stop` | Przerwij wystukiwanie hasła |

> **Wskazówka:** Hasło z wiadomości ("aktualnie to: 1-9-5-2") zapamiętuje się samo. Po odpowiedzi drzwi kolejna grupa puknięć trafia na funkcjonalny bind (domyślnie `]`).

## Odświeżanie danych

| Komenda | Opis |
|---------|------|
| `/refresh_magics` | Wymuś odświeżenie danych magii |
| `/refresh_keys` | Wymuś odświeżenie danych kluczy magii |
| `/refresh_knowledge` | Wymuś odświeżenie danych wiedzy |
