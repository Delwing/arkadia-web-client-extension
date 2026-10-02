# Walka

Komendy do walki, zasłaniania i zarządzania celami ataku.

## Tryb ataku

| Komenda | Opis |
|---------|------|
| `/awr` | Przełącz tryb ataku: A (atak) → AW (atak + wskazanie) → AWR (atak + wskazanie + rozkaz) |

> **Wskazówka:** Tryb ataku można też przełączać, klikając na wskaźnik "Atk:" w stopce.

## Wskazywanie celu

Aliasy przyjmujące `id` (`/z`, `/x`, `/prze`, `/za`, `/zas`, `/za2`-`/za4`, `/w`, `/pro`, `/zap`, `/ra`, `/rz`, `/wa`, `/wz`) przyjmują skrót obiektu z listy albo imię lub fragment opisu - bez względu na wielkość liter i ogonki, np. `/za gerw`, `/z zolty`. Wystarczy najkrótszy jednoznaczny fragment. Gdy pasuje kilka osób, aliasy wsparcia (`/za`, `/w`, `/pro`, `/rz`, `/wz`) wybierają jedynego członka drużyny, a pozostałe (atak, `/zap`) jedyną osobę spoza drużyny; w pozostałych przypadkach nic nie jest wysyłane i wypisywana jest lista kandydatów ze skrótami.

## Atakowanie

| Komenda | Opis |
|---------|------|
| `/z id` | Zabij obiekt o podanym id |
| `/z` | Atakuj cel oznaczony jako cel ataku |
| `/z_id id` | Zaatakuj obiekt po ID (przyjmuje id lub `ob_id`) |
| `/zz cel` | Zaatakuj podany cel (bez ob_), np. `/zz rusalke` → `zabij rusalke` |
| `/x id` | Zaskocz obiekt o podanym id |
| `/x` | Zaskocz cel oznaczony jako cel ataku |
| `/prze [id]` | Przełamuje obronę wskazanego obiektu, celu ataku, a gdy go brak - aktualnie atakowanego przeciwnika |
| `/z_all` | Atakuj wrogów drużyny na lokacji: tych, którzy atakują członka drużyny, oraz tych, których drużyna już atakuje (pomija sojuszników, gwardię i postronnych) |
| `/z_all!` | Atakuj wszystkich nie-drużynowych na lokacji, łącznie z postronnymi (pomija sojuszników) |

## Kolejka ataku

| Komenda | Opis |
|---------|------|
| `/q id` | Dodaj przeciwnika do kolejki ataku (przyjmuje id lub `ob_id`) |
| `/cq` | Wyczyść kolejkę ataku |
| `/nn` | Atakuj następny cel z kolejki |

W komendach `@>` oznacza następny cel z kolejki, np. `/z @>` albo `zabij @>`.

## Własne referencje

| Komenda | Opis |
|---------|------|
| `/ref nazwa id` | Nazwij obiekt, np. `/ref tank @A` albo `/ref tank gerw`; potem `@tank` działa jak `@A`, np. `/zas @tank` |
| `/ref nazwa` | Pokaż, na kogo wskazuje `@nazwa` |
| `/ref` | Pokaż wszystkie referencje |
| `/unref nazwa` | Usuń referencję |

Referencja wskazuje osobę, a nie skrót - gdy skróty się przetasują, `@tank` dalej oznacza tę samą postać. Nazwa zaczyna się od litery i ma co najmniej 2 znaki (litery i cyfry); skróty z listy mają pierwszeństwo przed referencjami. Referencje znikają po wylogowaniu, bo numery obiektów się wtedy zmieniają.

## Zasłanianie

| Komenda | Opis |
|---------|------|
| `/zas id` | Zasłoń obiekt (używa `zaslon przed`, gdy nie w drużynie) |
| `/za id` | Alias do `/zas` |
| `/zas` | Zasłoń cel oznaczony jako cel obrony |
| `/za` | Alias do `/zas` |
| `/w id` | Wycofaj postać za wskazany obiekt |
| `/puszczaj` | Przełącz automatyczne zwalnianie zasłony |

## Zasłona grupowa

| Komenda | Opis |
|---------|------|
| `/za2 id` | Zasłoń z poziomem krycia 2 |
| `/za3 id` | Zasłoń z poziomem krycia 3 |
| `/za4 id` | Zasłoń z poziomem krycia 4 |

## Oznaczanie celów

| Komenda | Opis |
|---------|------|
| `/wa id` | Oznacz obiekt jako cel ataku |
| `/wz id` | Oznacz obiekt z drużyny jako cel obrony |

## Rozkazy drużyny

| Komenda | Opis |
|---------|------|
| `/ra id` | Rozkaż drużynie atakować osobę o podanym numerze |
| `/ra` | Rozkaż drużynie atakować aktualny cel ataku |
| `/rz id` | Rozkaż drużynie zasłonić obiekt |
| `/rz` | Rozkaż drużynie zasłonić aktualny cel obrony |
| `/zap numer` | Zaproś do drużyny obiekt o podanym numerze |
| `/zap 0` | Zaproś do drużyny wszystkich przedstawionych na lokacji (pomija wrogów i wrogie gildie) |
| `/zap *` | Zaproś do drużyny wszystkich sojuszników (gildie sojusznicze + osoby oznaczone jako sojusznicy), niezależnie czy walczą |
| `/pro id` | Przekaż prowadzenie obiektowi |

## Wrogowie na bindach

| Komenda | Opis |
|---------|------|
| `/nabindach` | Wyświetl aktualnie przypisanych wrogów na bindach |
| `/nabindach--` | Wyczyść bindy wrogów (tymczasowo do zmiany lokacji) |

W Ustawieniach (Postać -> Walka, sekcja "Bindy wrogów") można podać własne
komendy dla bindu ataku (F1-F3) i bindu blokowania (CTRL+F1-F3). W komendzie
`{wrog}` zastępuje wroga ze slotu (`ob_12345`), np. `wesprzyj {wrog}`. Kolejne
komendy oddziela się średnikiem, a `{atak}` i `{blok}` to domyślne zachowanie
bindów (zwykły atak klienta razem ze wskazaniem celu drużynie, `zablokuj {wrog}`),
np. `dobadz broni; {atak}` albo `{blok}; {atak}`. Puste pole zostawia domyślne
zachowanie.

## Reset skrótów drużyny

| Komenda | Opis |
|---------|------|
| `/walka_restart` | Resetuj skróty drużyny i przypisz je od nowa od A |

## Loot

| Komenda | Opis |
|---------|------|
| `/loot` | Przeszukaj wszystkie ciała na lokacji (ob 1. cialo, ob 2. cialo, ...) |

> **Wskazówka:** `/loot` otwiera okno z przedmiotami ze wszystkich ciał, w którym można kliknąć przedmiot, aby go podnieść. Samodzielne `ob cialo` koloruje i podlinkowuje przedmioty bezpośrednio w tekście gry.

## Okno walki

| Komenda | Opis |
|---------|------|
| `/walkaw` lub `/walka okno` | Otwórz okno walki z logiem komunikatów walki |

> **Wskazówka:** przewinięcie loga w górę dzieli okno walki na dwie części — na dole zostaje przyklejony podgląd najnowszych linii, więc walka leci dalej, a przewijany log stoi w miejscu. Powrót na sam dół zamyka podgląd. Wysokość dolnej części zmienia się przeciąganiem paska między nimi. Tak samo działa okno główne.
