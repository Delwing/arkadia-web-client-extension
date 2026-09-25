# Inne aliasy

Pozostale aliasy i funkcje rozszerzenia.

## Wlasne aliasy

Wlasne aliasy tworzysz w oknie **Automatyzacja** (Menu → Automatyzacja), razem z triggerami (wyzwalaczami):
- **Wzorzec** - wyrazenie regularne dopasowujace komende
- **Akcje** - co ma sie stac, po kolei: komenda wysylana do serwera, dzwiek, powiadomienie (takze na telefon), czytanie na glos, funkcyjny bind, uruchomienie skryptu, wlaczenie lub wylaczenie grupy. W tekstach akcji `$1`, `$2` itp. wstawiaja grupy z dopasowania
- **Skroty obiektow** - `@1`, `@A`, `@@` zostana zamienione na identyfikatory obiektow
- **Kilka komend** - srednik rozdziela kilka komend w jednym polu
- **Inaczej dla postaci** - dla wybranej postaci alias moze wysylac inna komende; zastepuje ona wszystkie komendy z akcji

### Okno Automatyzacja

- **Lista** - aliasy i wyzwalacze razem, podzielone na grupy. Po lewej wybierasz rodzaj (Wszystko, Aliasy, Wyzwalacze) i to, co pokazac (wylaczone, tylko to, co dziala na tej postaci). Przelacznik przy kazdym wierszu wlacza i wylacza element od razu
- **Grupy** - `+` → Grupa (albo przycisk z folderem obok) tworzy nowa grupe; od razu wpisujesz jej nazwe. Elementy przeciagasz na grupe albo miedzy innymi elementami, zeby zmienic kolejnosc - aliasy, wyzwalacze i skrypty moga byc w grupie wymieszane. Grupy tez mozna przeciagac. Przelacznik przy grupie wlacza lub wylacza wszystko, co w niej jest. Menu grupy (`...` albo prawy przycisk) pozwala dodac do niej nowy element, zmienic nazwe, wyeksportowac ja do pliku albo usunac razem ze wszystkim, co w niej jest
- **Prawy przycisk na elemencie** - edycja, duplikat, wlaczenie/wylaczenie, przeniesienie do grupy (takze do nowej; tak przenosisz elementy na telefonie) i usuniecie
- **Edytor** - krok 1 *Kiedy* (wzorzec i linia testowa, ktora od razu pokazuje, czy wzorzec pasuje i co trafi do `$1`), krok 2 *Co zrobic* (akcje po kolei; kolejnosc zmienisz, przeciagajac za uchwyt, a pod spodem widac, co zostanie wyslane), krok 3 *Dla kogo*. Zmiany zapisuje **Zapisz** (albo `Ctrl+Enter`); kropka przy wierszu oznacza niezapisane zmiany
- **Wlaczony** - wylaczony alias lub wyzwalacz zostaje zapisany, ale nie dziala
- **Dla kogo** - wszystkie postacie albo tylko wybrane; na innej postaci element nie dziala
- **Eksport i import** - "Eksportuj wszystko" albo eksport jednej grupy zapisuje plik `.json`, ktory ktos inny wczyta przez "Importuj" → "Plik automatyzacji". Import niczego nie nadpisuje: alias o istniejacym wzorcu i identyczny wyzwalacz zostaja pominiete

### Zakresy ($i)

Uzyj `$i` w komendzie, aby powtorzyc ja dla zakresu liczb. Zakres podajesz jako argument aliasu w formacie `X-Y`.

**Przyklad:**
- Wzorzec: `kok (.+)`
- Komenda: `rozerwij $i. kokon`
- Wpisz: `kok 1-7`
- Wynik: `rozerwij 1. kokon`, `rozerwij 2. kokon`, ..., `rozerwij 7. kokon`

Zakresy dzialaja rosnaco (`1-7`) i malejaco (`7-1`). Maksymalnie 50 iteracji.

## Asystent AI

| Komenda | Opis |
|---------|------|
| `/pomoc` | Otworz panel asystenta AI |
| `/pomoc <pytanie>` | Otworz panel i od razu zadaj pytanie |

> **Wskazowka:** Asystent odpowiada po polsku i zna ustawienia, komendy i zdarzenia tego klienta. Jesli w odpowiedzi jest konkretna zmiana (ustawienie, alias, trigger, bind), pojawi sie karta z przyciskami **Zastosuj** / **Odrzuc** - nic nie zostanie zapisane, dopoki sam nie klikniesz "Zastosuj". Panel jest zwyklym oknem: mozna go zadokowac, przypiac i odlaczyc do osobnego okna. Wlasny klucz API (opcjonalny) ustawisz przyciskiem "Ustawienia" w naglowku panelu; jest zapisywany tylko na tym urzadzeniu i nie trafia do synchronizacji w chmurze.

## Komunikacja

| Komenda | Opis |
|---------|------|
| `/fake tekst` | Wyswietl podany tekst jak zwykle wiadomosc klienta |
| `/chat` | Wyswietl ostatnie 20 wiadomosci z czatu GMCP |
| `/chatw` lub `/chat okno` | Otworz okno czatu z historia 100 wiadomosci |
| `/list` | Otworz edytor pisania listow w kliencie |
| `/poczta` | Otworz okno poczty z lista listow |

> **Wlasne szablony listow:** w edytorze listow przycisk "Szablony..." otwiera edytor wlasnych ramek. Nowy szablon powstaje jako kopia wybranego (wbudowanego lub wlasnego) i sklada sie z naglowka, poczatku i konca kazdej linii tresci oraz stopki. W naglowku i stopce `{x}` oznacza znak `x` powtorzony na szerokosc tresci, np. ` +--{-}--+ `, dzieki czemu ramka dopasowuje sie do szerokosci linii z ustawien. Wlasne szablony sa wspolne dla wszystkich postaci i synchronizuja sie miedzy urzadzeniami.

> **Wskazowka:** W oknie czatu przycisk "Druzyna" filtruje wiadomosci od czlonkow druzyny. Przewiniecie historii w gore dzieli okno na dwie czesci — na dole zostaje przyklejony podglad najnowszych wiadomosci, tak samo jak w oknie glownym i w oknie walki.

## Czas

| Komenda | Opis |
|---------|------|
| `/czas` | Otworz okno zegara z aktualnym czasem w grze |
| `/czas imperium <godzina> [<dzien>]` | Ustaw czas w Imperium (godzina 0-23, opcjonalnie dzien roku 1-400) |
| `/czas ishtar <godzina> [<dzien>]` | Ustaw czas w Ishtar (godzina 0-23, opcjonalnie dzien roku 1-360) |

> **Wskazowka:** Czas mozna rowniez ustawic w oknie zegara - wybierz godzine, miesiac i dzien, a nastepnie kliknij "Ustaw".

## Jezyk

| Komenda | Opis |
|---------|------|
| `justaw jezyk` | Ustaw jezyk rozmow (np. `justaw krasnoludzki`) |
| `'tekst` | Mow w ustawionym jezyku (pojedynczy apostrof przed tekstem) |

## Druzyna

| Komenda | Opis |
|---------|------|
| `/ostatnio` | Sprawdz aktywnosc czlonkow druzyny (zielony = aktywny, czerwony = nieaktywny) |
| `/bilety` | Kup bilet dla kazdego czlonka druzyny na lokacji i wreczaj go (wyciaga monety przed i odklada po) |
| `/hp` | Wyswietl pomoc dla komendy ostatnio widzianych kondycji |
| `/hp wszystkich` | Wyswietl ostatnio widziane kondycje wszystkich postaci na lokacji |
| `/hp wroga` | Pokaz tylko kondycje oznaczonych wrogow (alias: `/hp przeciwnika`) |
| `/hp imiona` | Pokaz tylko kondycje postaci po imieniu (jednowyrazowe opisy) |
| `/hp <fraza>` | Filtruj kondycje po fragmencie opisu (np. `/hp gobl`) |
| `/hp -` | Wyczysc cala liste zapamietanych kondycji |
| `/hp -<fraza>` | Usun z listy wpisy pasujace do frazy |

> **Wskazowka:** Kondycje sa zbierane automatycznie z danych GMCP, a wpisy znikaja po 15 minutach lub gdy postac umrze. Pasek HP jest kolorowany wedlug poziomu zdrowia, a opisy wrogow podswietlone na czerwono, czlonkow druzyny na zielono. Dla opisow zawierajacych spacje wyswietlana jest dopasowana postac z bazy ludzi (imie i gildia).

## Przedstawieni

| Komenda | Opis |
|---------|------|
| `/przedstawieni` | Wyswietl liste przedstawionych postaci |

## Bindy

| Komenda | Opis |
|---------|------|
| `/binds` | Wyswietl liste skonfigurowanych bindow |
| `/przycisk nazwa [on\|off]` | Zapal lub zgas wlasne przyciski stopki o tym stanie (bez `on`/`off` przelacza) |

## Dzwiek

| Komenda | Opis |
|---------|------|
| `/sounds` | Przelacz wyciszenie/wlaczenie dzwiekow |
| `/mute` | Wycisz dzwieki |
| `/unmute` | Wlacz dzwieki |

## Przyplyw

| Komenda | Opis |
|---------|------|
| `/przyplyw` | Przelacz system przyplywow (zmienia mape: pokoje przybrzezne przesuwaja sie pod wode, tworza sie pokoje na powierzchni) |

> **Wskazowka:** System przyplywow aktywuje sie i dezaktywuje rowniez automatycznie na podstawie komunikatow w grze, gdy znajdujesz sie w strefie przyplywow.

## Dobywanie/Opuszczanie

| Komenda | Opis |
|---------|------|
| `/dob` | Wykonaj komendy dobywania ze slotow 1 i 2 |
| `/dob [1-3]` | Wykonaj komende dobywania z wybranego slotu |
| `/op` | Wykonaj komendy opuszczania ze slotow 1 i 2 |
| `/op [1-3]` | Wykonaj komende opuszczania z wybranego slotu |

> **Konfiguracja:** Komendy konfiguruje sie w ustawieniach postaci w sekcji "Dobywanie/Opuszczanie". Kazdy slot moze zawierac wiele komend oddzielonych srednikiem (;).

## Kalendarz slonca

| Komenda | Opis |
|---------|------|
| `/slonce` | Otworz kalendarz slonca z obserwacjami wschodow i zachodow |

## Kolorowanie

| Komenda | Opis |
|---------|------|
| `/tcolor fraza` | Dodaje tymczasowe kolorowanie frazy na pomaranczowo (tylko na czas sesji) |

> **Wskazowka:** Mozna wywolywac wielokrotnie, aby kolorowac wiele fraz jednoczesnie. Kolorowanie znika po zakonczeniu sesji.

## Lowienie ryb

| Komenda | Opis |
|---------|------|
| `/wedka` | Otworz okno lowienia ryb z wyborem przynety i przyciskami akcji |

> **Wskazowka:** Gdy ryba bierze, kliknij przycisk "Zatnij rybe" lub uzyj funkcjonalnego bindu (domyslnie `]`).

## Zlom (baza ocenionych przedmiotow)

| Komenda | Opis |
|---------|------|
| `/zlom` | Wyswietl zapisane bronie (alias `/zlom bronie`) |
| `/zlom tarcze` | Wyswietl zapisane tarcze |
| `/zlom zbroje` | Wyswietl zapisane zbroje |
| `/zlomw` | Otworz okno zlomu z tabelami i importem bazy z Mudleta |
| `/zlom-reset` | Wyczysc baze i zdejmij podswietlenia shortow |

> **Wskazowka:** Baza automatycznie zapisuje wyniki komendy `ocen <przedmiot>` i podswietla rozpoznane shorty w tekscie (pogrubienie + podkreslenie dla broni ze srebrem, dymek z typem). Kolory shortow ustawiasz w oknie `/zlomw` (kolumna "Kolor") — te same kolory stosowane sa w listach lupu (`loot`) i w pojemnikach (`pretty containers`). Przelacznik "Srebro" w naglowku okna kontroluje podkreslanie broni ze srebra. Okno pozwala tez zaimportowac plik `.db` z profilu Mudleta (tabele `bronie`, `tarcze`, `zbroje`).

## Odpornosci przeciwnikow

| Alias | Opis |
|-------|------|
| `/odpornosci` | Otworz okno odpornosci przeciwnikow (tabela przeciwnik x rodzaj obrazen) |
| `/odpornosci <fraza>` | Wypisz w oknie gry przeciwnikow, ktorych nazwa zawiera fraze (np. `/odpornosci kikimora`) |
| `/odpornosci-usun <nazwa>` | Usun wpisy przeciwnika ze wszystkich obszarow (rodzaj w mianowniku, np. `kikimora`) |
| `/odpornosci-reset` | Wyczysc cala baze odpornosci |

> **Wskazowka:** Baza zapisuje sie sama z wynikow `ocen <przeciwnik>` — wystarczy linia "Twoje doswiadczenie i umiejetnosci podpowiadaja ci, ze jest on odporny/wrazliwy na ...". Nazwa w mianowniku brana jest z linii porownania ("... niz wielka krwiozercza kikimora."); gdy jej brak, przeciwnik jest dopasowywany do obiektow na lokacji. Przymiotniki sa pomijane — "wielka krwiozercza kikimora" i "mala kikimora" to jeden wpis `kikimora` (nazwy dwuczlonowe, np. `zywiolak ognia`, `troll jaskiniowy`, zostaja w calosci). Postaci z imieniem (gracze, nazwani NPC) nie sa zapisywane. Wpis zapamietuje tez obszar mapy, na ktorym ocenialas — ten sam rodzaj potrafi miec inne odpornosci w roznych obszarach. Dopoki odpornosci sa wszedzie takie same, widzisz jeden wiersz bez zadnej wzmianki o obszarze; dopiero gdy gdzies wyjda inne, wiersz rozdziela sie na kilka, a przy nazwie pojawia sie nazwa obszaru (`X` w wierszu usuwa tylko ten obszar). Pomaranczowy trojkat przy nazwie oznacza wpis bez obszaru (zapisany, zanim obszary byly zapamietywane, albo poza mapa) — ocen przeciwnika ponownie, zeby go przypisac. Jesli linii z odpornosciami nie da sie odczytac albo nie wiadomo, ktorego przeciwnika dotyczy, pod linia pojawia sie pomaranczowy komunikat - klikniecie kopiuje oryginalna linie do schowka, zeby mozna ja bylo zglosic. Przelacznik Tabela/Lista zmienia widok: lista pokazuje dla kazdego przeciwnika wrazliwosci i odpornosci jako ikonki. W oknie `W` (zielone) oznacza wrazliwosc, `O` (czerwone) odpornosc; klikniecie naglowka kolumny sortuje najpierw przeciwnikow wrazliwych na dany rodzaj obrazen. Okno otworzysz tez z menu kontekstowego (pozycja "Odpornosci").

## Zaslony (debug)

| Alias | Opis |
|-------|------|
| `/zaslony` | Otworz okno podgladu zaslon (kto jest zaslaniany, przez kogo i przed kim) |

> **Wskazowka:** Okno jest narzedziem diagnostycznym dla mechaniki zaslon. Gra nie wysyla stanu zaslony w GMCP - nie ma zadnego pola `covered_by` - wiec stan jest wnioskowany z linii tekstu. Zaslona nie ma wlasnego czasu trwania: trwa, dopoki nie zostanie przelamana, zdjeta, zastapiona nowa zaslona przed tym samym atakujacym albo ktoras ze stron nie umrze. Gorna tabela pokazuje wszystkie postacie na lokacji podzielone na `Druzyna` i `Wrogowie`. Kluczowa jest kolumna **przed kim**: zaslona dziala tylko przeciw atakujacym wymienionym w linii `zaslania ... przed ciosami ...`, wiec ten sam cel moze byc zablokowany dla czlonka druzyny i calkowicie dostepny dla ciebie. Twoj wpis jest pogrubiony, a status `ZASLONIETY` (czerwony) oznacza, ze to *ty* nie mozesz trafic; `zaslaniany` (pomaranczowy) oznacza zaslone przed kims innym. Stan bierze sie wylacznie z tekstu gry. Przeskok `attack_num` w GMCP wyglada tak samo, gdy zaslona przekierowala cios, jak i wtedy, gdy ktos po prostu zmienil cel, wiec trafia tylko do logu (wpis `GMCP`, ukrywany przyciskiem **bez GMCP**) i nigdy nie tworzy zaslony - logowane sa przy tym tylko te przeskoki, ktorych nie tlumaczy zadna znana zaslona. Wpisy pisane kursywa sa niepewne (nie dalo sie jednoznacznie dopasowac opisu do postaci na lokacji). Licznik `nieznane blokady` liczy sytuacje, w ktorych linia `staje ci na drodze` trafila na zaslone, o ktorej nie wiedzielismy - wartosc wieksza od zera w normalnej walce oznacza przeoczona linie zalozenia zaslony, nie szum. Wpis `WYGASLO` podaje przyczyne: `zastapiona nowa zaslona` (przed jednym atakujacym stoi naraz tylko jedna zaslona - `attack_num` to jedna wartosc i gra przesuwa ja na najnowszego zaslaniajacego, wiec nowa zaslona przed tym samym atakujacym konczy poprzednia), `znikl z lokacji` (wraz z opisem, kto znikl), `smierc`, `ogluszenie` lub `limit wieku` (10 minut - jedyne ograniczenie czasowe, zabezpieczenie na wypadek zaslony zakonczonej bez zadnej czytelnej linii; w normalnej walce nie powinno wystapic).  Dolny panel to log zdarzen (najnowsze na gorze, do 200 wpisow) z oryginalna linia gry pod kazdym wpisem; przycisk **bez GMCP** ukrywa wpisy wywnioskowane wylacznie z GMCP, **Wyczysc** czysci log i licznik. Udane `przelam obrone` zdejmuje zaslone dla calej druzyny naraz, nieudane nie zdejmuje jej nikomu.

## Oswajanie

| Komenda | Opis |
|---------|------|
| `/o_pomoc` | Otworz okno oswajania z pomoca i lista aliasow |
| `/o_pokaz` | Pokaz liste oswajanych zwierzat (z przyciskiem aktywne/nieaktywne) |
| `/o_pokaz <zwierze>` | Pokaz historie karmienia i poziomy oswojenia danego zwierzecia |
| `/o_ostatnio` | Pokaz historie ostatnio karmionego zwierzecia |
| `/o_historia` | Pokaz historie karmienia wszystkich aktywnych zwierzat |
| `/o_wylacz <zwierze>` | Oznacz zwierze jako nieaktywne (ukrywa z historii) |
| `/o_wlacz <zwierze>` | Oznacz zwierze jako aktywne |
| `/o_przemianuj <stare> na <nowe>` | Zmien nazwe zwierzecia w bazie |
| `/o_eksport` | Zapisz baze oswajania tej postaci do pliku JSON |
| `/o_import` | Wczytaj baze z pliku JSON (nadpisuje baze tej postaci) |

> **Wskazowka:** Baza buduje sie automatycznie z komend `oswajaj zwierze ...`. Po oswojeniu wykonaj `ocen zwierze` (po nakarmieniu jest to automatycznie podstawiane pod funkcjonalny bind), aby zapisac poziom oswojenia. Dane sa zapisywane osobno dla kazdej postaci. Po nakarmieniu, po uplywie czasu odnowienia, pojawi sie powiadomienie, ze mozna oswajac ponownie. Okno otworzysz tez z menu kontekstowego (prawy przycisk myszy na oknie gry, pozycja "Oswajanie").

> **Widok zwierzecia:** Na gorze wybierasz zwierze z listy; nieaktywne mozna wlaczyc przyciskiem "Aktywuj". W tabeli kolumna "ile" rozwija (klik) poprzednie wpisy danego pokarmu. Rozne opisy tego samego pokarmu (np. `miesem` i `kawalkiem miesa`) mozesz scalic ikona polaczenia przy pokarmie — wtedy maja wspolny licznik czasu i jedna grupe, a kolejne karmienia automatycznie trafiaja do tej grupy. Polaczenie pokarmow jest globalne (wspolne dla wszystkich postaci); cofniesz je ikona rozlaczenia.

## Woz/bryczka

| Komenda | Opis |
|---------|------|
| `/woz` | Przelacz tryb wozu (wlacz/wylacz) |
| `/wozw` | Otworz okno "Wozy": data najmu, wozownia, koszt, kaucja i miejsce postoju. Przycisk "Blokady" w naglowku otwiera liste lokacji nieprzejezdnych z podgladem na mapie, usuwaniem pojedynczych wpisow i czyszczeniem calej listy |
| `/wozblok` | Oznacz/odznacz biezaca lokacje jako nieprzejezdna dla wozu (opcjonalnie numer lokacji) |
| `/wozbloki` | Pokaz liste nieprzejezdnych lokacji i linie do skopiowania |
| `/wozbloki+ <numery>` | Wczytaj liste nieprzejezdnych lokacji |
| `/wozbloki-` | Wyczysc liste nieprzejezdnych lokacji |

> **Wskazowka:** Tryb wozu wlacza sie i wylacza automatycznie przy wsiadaniu/zsiadaniu, wstawaniu i zwracaniu pojazdu, a takze gdy pojazd sam sie zatrzyma (rozdroze, brak dalszej drogi). Alias `/woz` pozwala przelaczyc go recznie, gdyby automatyczne wykrywanie zawiodlo. W trybie wozu przycisk trybu ruchu jest zablokowany.

> **Wskazowka:** Tryb wozu wlacza sie tylko wtedy, gdy to ty powozisz — czyli kiedy jedziesz sam albo prowadzisz druzyne. Jako pasazer (jestes w druzynie, ale nie ty ja prowadzisz) masz strzalki i klawisz `zerknij` bez zmian, bo i tak nie mozesz kierowac pojazdem; pojazd jest za to normalnie zapisywany w oknie `/wozw` i na mapie, a bind `usiadz ...` dalej sie pokazuje. Jesli przejmiesz prowadzenie druzyny w trakcie jazdy, tryb wozu wlaczy sie sam (i wylaczy, gdy oddasz prowadzenie). Alias `/woz` ma pierwszenstwo przed tym sprawdzeniem — mozesz nim wlaczyc tryb wozu takze jako pasazer.

> **Wskazowka:** Okno "Wozy" (`/wozw`, takze z menu pod prawym przyciskiem myszy) pamieta kazdy wynajety pojazd osobno, wiec dziala takze gdy masz ich kilka. Wozownia i miejsce postoju maja przyciski prowadzenia z odlegloscia w nawiasie. Kaucja w calosci wraca tylko przez 6 godzin od najmu; po tym terminie wozownia zatrzymuje jej czesc, dlatego okno pokazuje godzine wygasniecia i ile czasu zostalo (na 30 minut przed koncem wpis sie podswietla). Wpis znika po zwrocie pojazdu, mozna go tez usunac recznie przyciskiem `X`.

> **Wskazowka:** Zaparkowane pojazdy sa zaznaczone na mapie kolem wozu z nazwa typu pojazdu (`woz`, `bryczka`, `dylizans`). Znacznik znika, kiedy wsiadasz do pojazdu, i wraca w nowym miejscu po zsiadnieciu.

> **Wskazowka:** Okno rozroznia, czy siedzisz w stojacym pojezdzie, czy jedziesz — znacznik przy nazwie pokazuje `stoisz` albo `jedziesz`, na podstawie komunikatow `... rusza na ...` i `... zatrzymuje sie.` twojego pojazdu.

> **Wskazowka:** W czasie jazdy `zerknij` zatrzymuje pojazd — wysyla `zatrzymaj woz` / `zatrzymaj bryczke` / `zatrzymaj dylizans`. Kiedy pojazd stoi, `zerknij` znowu rozglada sie po lokacji. Tak dziala klawisz `zerknij` (domyslnie Numpad5) i srodkowy przycisk krzyzaka na panelu mobilnym; to samo mozna przypisac dowolnemu przyciskowi mobilnemu lub desktopowemu, wybierajac makro **Zerknij / zatrzymaj pojazd**.

> **Wskazowka:** Po ponownym polaczeniu z gra ("przywracam polaczenie" albo "polaczenie zostalo przywrocone") gra wysadza cie z pojazdu, wiec klient zapisuje pojazd jako zaparkowany w biezacej lokacji. Jesli przerwa byla na tyle dluga, ze logujesz sie od nowa, pojazd zostaje zaparkowany w ostatniej znanej lokacji. Jesli mapa nie nadazyla, miejsce postoju poprawia sie samo, gdy zobaczysz pojazd w opisie lokacji.

> **Wskazowka:** Lokacje oznaczone przez `/wozblok` sa omijane przy prowadzeniu (`/prowadz`, `/prowadzt`, klikniecie na mapie) tylko wtedy, gdy jedziesz wozem — pieszo nic sie nie zmienia. Jesli cel jest nieprzejezdny (np. wnetrze budynku), trasa dzieli sie na dwa odcinki w roznych kolorach: dojazd wozem i dalsza droga pieszo, a klient wypisuje, gdzie zostawic woz. Wyjscia specjalne skladajace sie z kilku slow (`wejdz na skaly`, `zejdz na dol`, `przecisnij sie przez szczeline`) sa pomijane przy jezdzie automatycznie — to czynnosci, ktorych nie wykonasz siedzac na wozie, wiec nie trzeba ich oznaczac. Kiedy pojazd stanie na koncu drogi (`Nie ma tu zadnej drogi, ktora mozna by dalej jechac.`), klient oznacza wszystkie sasiednie lokacje poza ta, z ktorej przyjechales — ale tylko wtedy, gdy gra wypisala przy opisie lokacji liste wyjsc; bez niej nic nie jest zapamietywane. Klient dopisuje lokacje sam, kiedy gra odmowi przejazdu (`Nie mozna jechac na ...`) — blokowana jest lokacja **za** tym wyjsciem, nie ta, w ktorej stoisz. Lista jest wspolna dla wszystkich postaci i na razie zbierana samodzielnie — `/wozbloki` wypisuje ja w formie gotowej do skopiowania. Oznaczone lokacje mozna pokazac na mapie jako przekreslone kolko — wlacza sie to w menu mapy ("Nieprzejezdne dla wozu"), domyslnie jest wylaczone. Znaczniki widac takze wtedy, gdy idziesz pieszo, bo czesto dopiero wtedy widac, ze woz tam nie wjedzie.

> **Wskazowka:** Bindy: kiedy wracasz pieszo do lokacji, w ktorej stoi twoj pojazd, bind zmienia sie na `usiadz na wozie` / `usiadz w bryczce` / `usiadz w dylizansie`. Bind znika, gdy odejdziesz z lokacji. Kiedy prowadzisz trase wozem, na bindzie glownym pojawia sie kolejny krok trasy (a w miejscu, gdzie trzeba zostawic woz — `zsiadz z ...`). Bind pokazuje sie tylko wtedy, gdy woz stoi, i aktualizuje sie, gdy trasa sie zmieni; wylaczysz go opcja "Bindy trasy wozu". W ustawieniach (Interfejs → Komendy) mozna wlaczyc opcje, ktora sprawia, ze powtorzenie odrzuconej komendy jazdy (`Nie mozna jechac na ...`) wysyla dwie komendy: zsiadniecie z wozu i przejscie pieszo w tym kierunku. Komunikaty konczace jazde (`Dojechaliscie do rozdrozy.` i `Nie ma tu zadnej drogi, ktora mozna by dalej jechac.`) sa podswietlane na zolto, zeby nie zginely w opisach mijanych lokacji.

## Odkladanie magii

| Komenda | Opis |
|---------|------|
| `/odloz_magie [pojemnik]` | Odloz magie do pojemnika |

## Labirynty

| Komenda | Opis |
|---------|------|
| `/labirynt` | Przelacz tryb labiryntu (dynamicznie usuwa nieistniejace wyjscia) |
| `/labirynt_mapa` | Przelacz mapper Labiryntu Rinde |
| `/raon_mapa` | Przelacz mapper Labiryntu Raon |
| `/taragorn` | Rozpoznaj ponownie lokacje w labiryncie pod swiatynia Taragorna |

## Skarbce

| Komenda | Opis |
|---------|------|
| `/lisica` | Wystukaj na drzwiach zapamietane haslo (pierwsza cyfra = liczba pukniec) |
| `/lisica 1-9-5-2` | Wystukaj podane haslo i zapamietaj je (dziala tez `1952`, `1 9 5 2`) |
| `/lisica stop` | Przerwij wystukiwanie hasla |

> **Wskazowka:** Haslo z wiadomosci ("aktualnie to: 1-9-5-2") zapamietuje sie samo. Po odpowiedzi drzwi kolejna grupa pukniec trafia na funkcjonalny bind (domyslnie `]`).

## Odswiezanie danych

| Komenda | Opis |
|---------|------|
| `/refresh_magics` | Wymus odswiezenie danych magii |
| `/refresh_keys` | Wymus odswiezenie danych kluczy magii |
| `/refresh_knowledge` | Wymus odswiezenie danych wiedzy |
