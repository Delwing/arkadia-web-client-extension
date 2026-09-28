# Mapa i nawigacja

Komendy do poruszania się, mapy i automatycznego chodzenia.

## Podstawowy ruch

| Komenda | Opis |
|---------|------|
| `/cofnij` | Cofnij postać do poprzedniego pomieszczenia na mapie |
| `/move kierunek` | Przesuń mapę bez wysyłania komendy do serwera |
| `/ustaw id` | Ustaw bieżącą pozycję na mapie na podany identyfikator |
| `/zlok` | Wymuś odświeżenie bieżącej pozycji na mapie |
| `/idz kierunek` | Wybierz przeciwne wyjście w pomieszczeniu |
| `n!` `s!` `e!` `w!` `ne!` `nw!` `se!` `sw!` `u!` `d!` | Wyślij czysty kierunek do serwera z pominięciem ruchu po mapie |

> **Wskazówka:** Kiedy mapper na pewno zgubi pozycję - nie udało mu się odtworzyć ruchu za drużyną albo gra podaje lokację spoza mapy - w prawym górnym rogu mapy zapala się czerwona plakietka **ZGUBIONY**. Znacznik zostaje na ostatnim pewnym pomieszczeniu; plakietka gaśnie sama, gdy gra poda znane mapie położenie, albo po ręcznym ustawieniu pozycji (`/ustaw id`, `/zlok`, GPS, menu mapy).

## Automatyczne chodzenie

| Komenda | Opis |
|---------|------|
| `/idz id [opoznienie]` | Automatycznie idź do wskazanej lokacji |
| `/stop` | Zatrzymaj automatyczne chodzenie |
| `/dalej [opoznienie]` | Wznów wędrówkę z opcjonalnym opóźnieniem |
| `/opoz sekundy` | Ustaw domyślne opóźnienie kroków |
| `/szybciej` | Zmniejsz opóźnienie o 0.5 s |
| `/wolniej` | Zwiększ opóźnienie o 0.5 s |
| `/walkerw` | Otwórz okno walkera |

## Komendy przed/po kroku

| Komenda | Opis |
|---------|------|
| `/pre_walk komendy` | Ustaw komendy wykonywane przed każdym krokiem (rozdzielone `#`) |
| `/pre_walk-` | Wyczyść komendy pre-walk |
| `/post_walk komendy` | Ustaw komendy wykonywane po każdym kroku (rozdzielone `#`) |
| `/post_walk-` | Wyczyść komendy post-walk |

## Prowadzenie

| Komenda | Opis |
|---------|------|
| `/prowadz id` | Rozpocznij prowadzenie innej osoby do wskazanego pokoju (gdy pieszo nie da się dojść, trasa jest liczona z transportem) |
| `/prowadz-` | Zakończ prowadzenie (czyści też trasę z transportem) |
| `/prowadzt id` | Prowadź z uwzględnieniem transportów (statki, dyliżanse) - przesiadki widoczne jako kolorowe pierścienie na mapie |
| `/prowadzt! id` | Jak `/prowadzt`, ale agresywnie minimalizuje chodzenie pieszo (zero kary za przesiadki, transport ~10x tańszy) |
| `/prowadzt` / `/prowadzt!` | Bez celu: przełącz bieżące prowadzenie na trasę z transportem (do tego samego celu) |
| `/prowadz` | Bez celu: przełącz bieżące prowadzenie z powrotem na trasę pieszo |
| `/go` | Wybierz wyjście zgodnie z wyznaczoną trasą (gdy aktywne prowadzenie, także trasa `/prowadzt` ze statkami i dyliżansami) |

> **Wskazówka:** `/prowadzt` rysuje piesze odcinki na mapie tak jak `/prowadz`, a punkty wsiadania/wysiadania znaczy pierścieniami w kolorze odcinka. Pełna instrukcja (na którą łódź wsiąść, jaka komenda, gdzie wysiąść) trafia do okna wyjścia.

> **Wskazówka:** Kiedy `/prowadz` nie znajduje drogi pieszo, klient sam szuka trasy z transportem i wypisuje ją tak, jak zrobiłby to `/prowadzt`. Jeśli w tym czasie jedziesz wozem, dojazd i rejs są liczone razem. Wóz można zabrać na statek, więc zostaje on dopiero tam, gdzie naprawdę nie wjedzie — instrukcja pokazuje to jako `Jedz wozem`, `Wsiadz z wozem` i `zostaw woz na`.

> **Wskazówka:** Przy wjeździe wozem na statek bind wejścia kupuje bilety także dla członków drużyny obecnych na lokacji i wręcza im je (tak jak `/bilety`), bez podwajania `wem`/`wlm`. Można to wyłączyć w ustawieniach postaci (opcja "Bilety dla drużyny przy wjeździe wozem") — wtedy kupowany jest tylko własny bilet.

## Wyszukiwanie na mapie

| Komenda | Opis |
|---------|------|
| `/przeszukaj tekst` | Wyszukaj pokoje z nazwami zawierającymi tekst (do 10 najbliższych) |

## Róża wiatrów

| Komenda | Opis |
|---------|------|
| `/roza` | Przełącz różę wiatrów (wł./wył.) |
| `/roza 0` | Wyłącz różę wiatrów |
| `/roza 1` | Włącz tryb 1 - inline (wyświetlana w tekście) |
| `/roza 2` | Włącz tryb 2 - ramka (stały element w rogu obszaru gry) |

> **Wskazówka:** Przełączanie trybu (`/roza 1`, `/roza 2`) włącza różę, jeśli była wyłączona. Tryb można również zmienić w ustawieniach postaci (opcja "Róża wiatrów").

## Zaznaczanie lokacji

| Komenda | Opis |
|---------|------|
| `/zaznaczaj` | Włącz zaznaczanie odwiedzanych lokacji na mapie |
| `/zaznaczaj-` | Wyłącz zaznaczanie i usuń dotychczasowe zaznaczenia |

## Informacje o lokacji

| Komenda | Opis |
|---------|------|
| `/info` | Wyświetl informacje o bieżącej lokacji w oknie wyjścia |
| `/info id` | Wyświetl informacje o lokacji o podanym id |

## Notatki lokacji

| Komenda | Opis |
|---------|------|
| `/note` | Otwórz okno Miejsca na bieżącej lokacji, z kursorem w notatce |

> **Wskazówka:** Skróty (`/idz`, `/prowadz`) i notatki lokacji są w jednym oknie **Miejsca** (menu). Każde miejsce to lokacja z opcjonalnym skrótem i notatką; przycisk "Tutaj" dodaje bieżącą lokację, a notatka zapisuje się sama.

## Okno mapy

| Komenda | Opis |
|---------|------|
| `/mapa` | Otwórz nowe okno mapy na bieżącej lokacji |
| `/mapa id` | Otwórz nowe okno mapy na lokacji o podanym id |
| `/mapa nazwa` | Otwórz nowe okno mapy wycentrowane na obszarze o podanej nazwie |

> **Wskazówka:** Okna mapy są niezależne od głównej mapy - nie śledzą ruchu gracza. Można otworzyć wiele okien jednocześnie. Kliknij prawym przyciskiem na lokację i wybierz "Otwórz okno mapy", aby otworzyć okno na wybranej lokacji.

## Multibindy lokacji

| Komenda | Opis |
|---------|------|
| `/mbind numer akcja` | Ustaw multibind 1-4 dla bieżącej lokacji |
| `/mbind+ akcja` | Dodaj akcję do pierwszego wolnego multibinda |
| `/mbind-` | Usuń wszystkie multibindy z bieżącej lokacji |
| `/mbind- numer` | Usuń wskazany multibind |
| `/mbind` | Wyświetl multibindy bieżącej lokacji |
| `/mbind id` | Wyświetl multibindy dla lokacji o podanym id |
