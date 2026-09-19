# Przypisanie postaci do logow

Spec pracy do wykonania **po** scaleniu PR-a fazy 2 (fold `@ui/logViewer`).
Dotyka `Timeline.tsx` i `model/events.ts`, ktore ten PR przebudowuje — stad
kolejnosc, a nie rownolegle.

Companion do `LOG_VIEWER.md` i `UI_MIGRATION.md`.

---

## 1. Problem

Sesja logu nie wie, czyja jest. `log-viewer/sessionAdapter.ts:107-112` stawia
w miejscu postaci date i mowi wprost dlaczego:

> The store name carries no character; the first `Welcome back` line would, but
> reading it would mean parsing game text. Until the logger records the
> character, the date is the honest label.

Do tego jedna sesja logu **nie ma jednej postaci**. Log leci od zaladowania
strony do jej zamkniecia, a gracz w tym czasie moze sie przelogowac. Sa tez
sesje bez zadnego polaczenia z gra — tam postaci nie ma wcale.

Wniosek: `character: string` to zle pole. Ma byc **lista**, chronologicznie,
i ma umiec byc pusta.

## 2. Skad wziac nazwe — dwa poziomy, nie jeden

### Poziom 1: GMCP, dokladny — logi nagrywane od teraz

`gmcp.char.info` niesie nazwe postaci (`src/shared/events/clientEvents.ts:532`,
typ `GmcpCharInfo`). Tego dzis **nie ma w logu w ogole**: `sessionLogger`
(`src/web/sessionLogger.ts`, 163 linie) zapisuje wylacznie
`{ text, type, timestamp }` i sluchaa `client.on('message')`, czyli **tekstu
wyjscia gry**. Ramka GMCP tam nie dociera.

To jest zmiana **write-time** i dziala tylko w przod.

**Zrodlem nazwy ma byc `PlayerIdentity` (`src/client/PlayerIdentity.ts`), nie
surowy `gmcp.char.info`.** PlayerIdentity juz obsluguje przeobrazenie i ma
`CHAR_INFO_GRACE_MS = 3000` wlasnie po to, zeby zmiana ciala nie wygladala jak
zmiana postaci. Podpiecie sie pod surowa ramke omija te ochrone i
przeobrazenie zacznie w logu wygladac jak przelogowanie.

Nazwa z GMCP przychodzi malymi literami (`dargoth`) — **tu stosujemy
titlecase**, i to jest jedyne miejsce, gdzie cokolwiek titlecase'ujemy.

### Poziom 2: dopasowanie po rdzeniu — logi juz nagrane

Stare logi nie maja ramek GMCP i **nigdy ich nie beda mialy**. Jedyny slad
postaci to banner logowania w tekscie:

```
Witaj, Dargocie. Podaj swe haslo:
```

`Dargocie` to wolacz. Generowanie polskiej deklinacji jest trudne — ale my
**nie generujemy, tylko rozpoznajemy**, i to w obrebie malego, zamknietego
zbioru. To zupelnie inny, duzo latwiejszy problem.

Zbior kandydatow juz istnieje: **`collectCharacters()`**
(`src/web/options/exportUtils.ts:166`) przechodzi `localStorage`, parsuje
prefiksy `{postac}:{klucz}` i zwraca posortowana liste postaci, ktorych
ustawienia sa na tym urzadzeniu.

Deklinacja zmienia **koncowke**, a zostawia **rdzen**:

```
Dargoth  -> Dargocie     wspolny prefiks  Dargo
Zgredek  -> Zgredku      wspolny prefiks  Zgred
Kethra   -> Kethro       wspolny prefiks  Kethr
Dorn     -> Dornie       wspolny prefiks  Dorn
```

Wiec: wyciagnij token z bannera, porownaj z kazdym kandydatem, policz najdluzszy
wspolny prefiks (bez wzgledu na wielkosc liter), wybierz zwyciezce. Zadnych
tablic deklinacyjnych, zadnego Levenshteina.

**Wzorzec bannera zostaje ASCII** — `/^Witaj, ([A-Za-z]+)\./`. Arkadia wysyla
polski bez znakow diakrytycznych, wiec regula z `AGENTS.md` ("zadnych polskich
liter w wyrazeniach regularnych") jest spelniona naturalnie, a nie obejsciem.

## 3. Trzy zasady, bez ktorych to jest zgadywanie

**(a) Wyliczaj przy odczycie, nie przepisuj magazynow.** Slowo "migracja"
kusi, zeby wejsc w `IndexedDB` i dopisac postac do rekordow. Nie robimy tego:
to jest destrukcyjne i jednorazowe. Liczymy w `sessionAdapter.ts`, dokladnie
tam, gdzie dzis stoi placeholder `character: formatDateLong(startedAt)`.
Efekt dla uzytkownika ten sam, ryzyko zerowe, a heurystyke mozna pozniej
poprawic, nie majac po drodze zepsutych danych.

**(b) Niejednoznaczne = brak postaci, nigdy rzut moneta.** Jesli dwie postacie
dziela rdzen (`Dargoth` i `Dargon`, oba `Dargo...`), wynik ma byc **pusty**.
Wymagaj, zeby zwyciezca wygrywal o wyrazny margines i zeby wspolny prefiks byl
sensowna czescia nazwy kandydata. Zla nazwa na logu jest gorsza niz jej brak —
z dokladnie tego samego powodu, ktory `model/events.ts` podaje przy markerach:

> a marker that fires on the wrong line is worse than no marker, because the
> timeline is the one place a player trusts

Brak dopasowania -> zostaje dzisiejsza etykieta z data.

**(c) Wyswietlaj nazwe z listy kandydatow, nie z tekstu.** Dopasowanie sluzy
tylko do **wskazania**, ktory kandydat to jest. Pokazujemy jego mianownik po
titlecase, nigdy tokenu wyciagnietego z bannera (bo to wolacz).

Ograniczenie, ktore trzeba przyjac, a nie scigac: postac, w ktora nikt nigdy
nie gral na tym urzadzeniu, nie ma wpisow w `localStorage`, wiec nie ma
kandydata i zostanie nierozpoznana. To jest wlasciwosc metody, nie blad.

## 4. Model danych

`src/ui/logViewer/model/types.ts:33` — `character: string` staje sie lista
postaci w kolejnosci pojawienia sie. Miejsca do przerobienia:

| Miejsce | Co robi dzis |
|---|---|
| `model/viewerState.ts:176` | `character` wchodzi do haystacka wyszukiwania sesji |
| `model/viewerState.ts:296` | `character` w powiadomieniu o skoku miedzy sesjami |
| `components/ViewerHeader.tsx:60` | tytul okna |
| `components/SessionSidebar.tsx:88` | nazwa na liscie sesji |
| `LogViewer.tsx:311` | tytul przy eksporcie |
| `log-viewer/sessionAdapter.ts:112` | placeholder z data |
| `design/mockSessions.ts` | dane pokazowe (`:62`, `:174`, `:199`, `:218`, `:234`, `:260`) |

Sesja bez postaci ma dalej dzialac wszedzie — pusta lista jest normalnym
stanem, nie przypadkiem brzegowym.

Uwaga na `viewerState.ts:296`: powiadomienie o skoku trafia do
`.lv-search__sub`, ktora po poprawkach fazy 2 **nie zawija**. Lista postaci
wpychana w calosci w ten tekst przestanie sie miescic — w powiadomieniu ma byc
jedna, trafna nazwa (ta z docelowego trafienia), nie cala lista.

## 5. Os czasu

- **`login`** — juz istnieje, zrodlem jest typ GMCP `system.login`
  (`detectEvent` w `model/events.ts`). Ma **niesc nazwe postaci**, zeby na osi
  bylo widac przelogowania. To jest cel calej tej pracy: przelaczenia postaci
  maja byc widoczne.
- **`death`** — zostaje bez zmian. Zrodlem jest linia, ktora gra sama drukuje
  (`DEATH_LINE`). Uzyteczne.
- **`trait`** ("Awans cechy", tag `AWANS`, glif `▲`) — **do usuniecia**.
  Wypada z `LOG_EVENT_KINDS`, z `LOG_EVENT_META`, razem ze stala `TRAIT_LINE`
  i galezia w `detectEvent`. Legenda i pas zdarzen buduja sie z `LOG_EVENTS`,
  wiec znikniecie propaguje sie samo.

## 6. Testy

Dopasowanie po rdzeniu to czysta funkcja i ma miec wlasne testy jednostkowe,
osobno od UI. Przypadki, ktore musza byc pokryte:

- kazda para z tabeli w sekcji 2 (wolacz -> mianownik),
- **niejednoznacznosc**: dwoch kandydatow o wspolnym rdzeniu -> brak wyniku,
- kandydat spoza listy (postac nigdy nie grana na tym urzadzeniu) -> brak wyniku,
- brak bannera w logu -> brak wyniku,
- pusta lista kandydatow -> brak wyniku, bez wyjatku,
- roznice wielkosci liter (`dargoth` z GMCP vs `Dargocie` z tekstu),
- sesja z **dwoma** przelogowaniami -> dwie pozycje na liscie, w kolejnosci.

## 7. Zasady projektu, ktore tu obowiazuja

- **Zadnych polskich liter w wyrazeniach regularnych** — wzorce ASCII.
- **Zadnych atrybutow `aria-*`.**
- `yarn`, nigdy `npm`. Nie modyfikowac `data/`.
- Zadnego hexa w arkuszach stylow komponentow — tylko tokeny `--ark-*`.
- Pelna suite e2e puszczac na CI (12 shardow, ~2 min 40 s), lokalnie tylko
  celowane spece.
