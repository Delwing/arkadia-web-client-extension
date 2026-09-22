# Walka

Komendy do walki, zaslaniania i zarzadzania celami ataku.

## Tryb ataku

| Komenda | Opis |
|---------|------|
| `/awr` | Przelacz tryb ataku: A (atak) → AW (atak + wskazanie) → AWR (atak + wskazanie + rozkaz) |

> **Wskazowka:** Tryb ataku mozna tez przelaczac klikajac na wskaznik "Atk:" w stopce.

## Atakowanie

| Komenda | Opis |
|---------|------|
| `/z id` | Zabij obiekt o podanym id |
| `/z` | Atakuj cel oznaczony jako cel ataku |
| `/z_id id` | Zaatakuj obiekt po ID (przyjmuje id lub `ob_id`) |
| `/zz cel` | Zaatakuj podany cel (bez ob_), np. `/zz rusalke` → `zabij rusalke` |
| `/x id` | Zaskocz obiekt o podanym id |
| `/x` | Zaskocz cel oznaczony jako cel ataku |
| `/prze [id]` | Przelamuje obrone wskazanego obiektu, celu ataku, a gdy go brak - aktualnie atakowanego przeciwnika |
| `/z_all` | Atakuj wrogow druzyny na lokacji: tych, ktorzy atakuja czlonka druzyny, oraz tych, ktorych druzyna juz atakuje (pomija sojusznikow, gwardie i postronnych) |
| `/z_all!` | Atakuj wszystkich nie-druzynowych na lokacji, lacznie z postronnymi (pomija sojusznikow) |

## Kolejka ataku

| Komenda | Opis |
|---------|------|
| `/q id` | Dodaj przeciwnika do kolejki ataku (przyjmuje id lub `ob_id`) |
| `/cq` | Wyczysc kolejke ataku |
| `/nn` | Atakuj nastepny cel z kolejki |

## Zaslanianie

| Komenda | Opis |
|---------|------|
| `/zas id` | Zaslon obiekt (uzywa `zaslon przed` gdy nie w druzynie) |
| `/za id` | Alias do `/zas` |
| `/zas` | Zaslon cel oznaczony jako cel obrony |
| `/za` | Alias do `/zas` |
| `/w id` | Wycofaj postac za wskazany obiekt |
| `/puszczaj` | Przelacz automatyczne zwalnianie zaslony |

## Zaslona grupowa

| Komenda | Opis |
|---------|------|
| `/za2 id` | Zaslon z poziomem krycia 2 |
| `/za3 id` | Zaslon z poziomem krycia 3 |
| `/za4 id` | Zaslon z poziomem krycia 4 |

## Oznaczanie celow

| Komenda | Opis |
|---------|------|
| `/wa id` | Oznacz obiekt jako cel ataku |
| `/wz id` | Oznacz obiekt z druzyny jako cel obrony |

## Rozkazy druzyny

| Komenda | Opis |
|---------|------|
| `/ra id` | Rozkaz druzynie atakowac osobe o podanym numerze |
| `/ra` | Rozkaz druzynie atakowac aktualny cel ataku |
| `/rz id` | Rozkaz druzynie zaslonic obiekt |
| `/rz` | Rozkaz druzynie zaslonic aktualny cel obrony |
| `/zap numer` | Zapros do druzyny obiekt o podanym numerze |
| `/zap 0` | Zapros do druzyny wszystkich przedstawionych na lokacji (pomija wrogow i wrogie gildie) |
| `/zap *` | Zapros do druzyny wszystkich sojusznikow (gildie sojusznicze + osoby oznaczone jako sojusznicy), niezaleznie czy walcza |
| `/pro id` | Przekaz prowadzenie obiektowi |

## Wrogowie na bindach

| Komenda | Opis |
|---------|------|
| `/nabindach` | Wyswietl aktualnie przypisanych wrogow na bindach |
| `/nabindach--` | Wyczysc bindy wrogow (tymczasowo do zmiany lokacji) |

W Ustawieniach (Postac -> Walka, sekcja "Bindy wrogow") mozna podac wlasne
komendy dla bindu ataku (F1-F3) i bindu blokowania (CTRL+F1-F3). W komendzie
`{wrog}` zastepuje wroga ze slotu (`ob_12345`), np. `wesprzyj {wrog}`. Kolejne
komendy oddziela sie srednikiem, a `{atak}` i `{blok}` to domyslne zachowanie
bindow (zwykly atak klienta razem ze wskazaniem celu druzynie, `zablokuj {wrog}`),
np. `dobadz broni; {atak}` albo `{blok}; {atak}`. Puste pole zostawia domyslne
zachowanie.

## Reset skrotow druzyny

| Komenda | Opis |
|---------|------|
| `/walka_restart` | Resetuj skroty druzyny i przypisz je od nowa od A |

## Loot

| Komenda | Opis |
|---------|------|
| `/loot` | Przeszukaj wszystkie ciala na lokacji (ob 1. cialo, ob 2. cialo, ...) |

> **Wskazowka:** `/loot` otwiera okno z przedmiotami ze wszystkich cial, w ktorym mozna kliknac przedmiot aby go podniesc. Samodzielne `ob cialo` koloruje i podlinkuje przedmioty bezposrednio w tekscie gry.

## Okno walki

| Komenda | Opis |
|---------|------|
| `/walkaw` lub `/walka okno` | Otworz okno walki z logiem komunikatow walki |

> **Wskazowka:** przewiniecie loga w gore dzieli okno walki na dwie czesci — na dole zostaje przyklejony podglad najnowszych linii, wiec walka leci dalej, a przewijany log stoi w miejscu. Powrot na sam dol zamyka podglad. Wysokosc dolnej czesci zmienia sie przeciaganiem paska miedzy nimi. Tak samo dziala okno glowne.
