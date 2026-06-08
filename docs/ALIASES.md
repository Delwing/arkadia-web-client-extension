# Inne aliasy

Pozostale aliasy i funkcje rozszerzenia.

## Wlasne aliasy

Mozesz tworzyc wlasne aliasy w ustawieniach klienta:
- **Wzorzec** - wyrazenie regularne dopasowujace komende
- **Komenda** - tekst wysylany do serwera, moze uzywac `$1`, `$2` itp. dla grup z dopasowania
- **Skroty obiektow** - `@1`, `@A`, `@@` zostana zamienione na identyfikatory obiektow
- **Wieloliniowe komendy** - kazda nowa linia w komendzie dziala jak osobna komenda (jak srednik)

### Zakresy ($i)

Uzyj `$i` w komendzie, aby powtorzyc ja dla zakresu liczb. Zakres podajesz jako argument aliasu w formacie `X-Y`.

**Przyklad:**
- Wzorzec: `kok (.+)`
- Komenda: `rozerwij $i. kokon`
- Wpisz: `kok 1-7`
- Wynik: `rozerwij 1. kokon`, `rozerwij 2. kokon`, ..., `rozerwij 7. kokon`

Zakresy dzialaja rosnaco (`1-7`) i malejaco (`7-1`). Maksymalnie 50 iteracji.

## Komunikacja

| Komenda | Opis |
|---------|------|
| `/fake tekst` | Wyswietl podany tekst jak zwykle wiadomosc klienta |
| `/chat` | Wyswietl ostatnie 20 wiadomosci z czatu GMCP |
| `/chatw` lub `/chat okno` | Otworz okno czatu z historia 100 wiadomosci |
| `/list` | Otworz edytor pisania listow w kliencie |
| `/poczta` | Otworz okno poczty z lista listow |

> **Wskazowka:** W oknie czatu przycisk "Druzyna" filtruje wiadomosci od czlonkow druzyny.

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

> **Wskazowka:** Tryb wozu wlacza sie i wylacza automatycznie przy wsiadaniu/zsiadaniu, wstawaniu i zwracaniu pojazdu. Alias `/woz` pozwala przelaczyc go recznie, gdyby automatyczne wykrywanie zawiodlo. W trybie wozu przycisk trybu ruchu jest zablokowany.
