# Mapa i nawigacja

Komendy do poruszania sie, mapy i automatycznego chodzenia.

## Podstawowy ruch

| Komenda | Opis |
|---------|------|
| `/cofnij` | Cofnij postac do poprzedniego pomieszczenia na mapie |
| `/move kierunek` | Przesun mape bez wysylania komendy do serwera |
| `/ustaw id` | Ustaw biezaca pozycje na mapie na podany identyfikator |
| `/zlok` | Wymus odswiezenie biezacej pozycji na mapie |
| `/idz kierunek` | Wybierz przeciwne wyjscie w pomieszczeniu |
| `n!` `s!` `e!` `w!` `ne!` `nw!` `se!` `sw!` `u!` `d!` | Wyslij czysty kierunek do serwera z pominieciem ruchu po mapie |

## Automatyczne chodzenie

| Komenda | Opis |
|---------|------|
| `/idz id [opoznienie]` | Automatycznie idz do wskazanej lokacji |
| `/stop` | Zatrzymaj automatyczne chodzenie |
| `/dalej [opoznienie]` | Wznow wedrowke z opcjonalnym opoznieniem |
| `/opoz sekundy` | Ustaw domyslne opoznienie krokow |
| `/szybciej` | Zmniejsz opoznienie o 0.5 s |
| `/wolniej` | Zwieksz opoznienie o 0.5 s |
| `/walkerw` | Otworz okno walkera |

## Komendy przed/po kroku

| Komenda | Opis |
|---------|------|
| `/pre_walk komendy` | Ustaw komendy wykonywane przed kazdym krokiem (rozdzielone `#`) |
| `/pre_walk-` | Wyczysc komendy pre-walk |
| `/post_walk komendy` | Ustaw komendy wykonywane po kazdym kroku (rozdzielone `#`) |
| `/post_walk-` | Wyczysc komendy post-walk |

## Prowadzenie

| Komenda | Opis |
|---------|------|
| `/prowadz id` | Rozpocznij prowadzenie innej osoby do wskazanego pokoju |
| `/prowadz-` | Zakoncz prowadzenie (czysci tez trase z transportem) |
| `/prowadzt id` | Prowadz z uwzglednieniem transportow (statki, dylizanse) - przesiadki widoczne jako kolorowe pierscienie na mapie |
| `/prowadzt! id` | Jak `/prowadzt`, ale agresywnie minimalizuje chodzenie pieszo (zero kary za przesiadki, transport ~10x tanszy) |
| `/go` | Wybierz wyjscie zgodnie z wyznaczona trasa (gdy aktywne prowadzenie) |

> **Wskazowka:** `/prowadzt` rysuje pieszej odcinki na mapie tak jak `/prowadz`, a punkty wsiadania/wysiadania znaczy pierscieniami w kolorze odcinka. Pelna instrukcja (na ktora lodz wsiasc, jaka komenda, gdzie wysiasc) trafia do okna wyjscia.

## Wyszukiwanie na mapie

| Komenda | Opis |
|---------|------|
| `/przeszukaj tekst` | Wyszukaj pokoje z nazwami zawierajacymi tekst (do 10 najblizszych) |

## Roza wiatrow

| Komenda | Opis |
|---------|------|
| `/roza` | Przelacz roze wiatrow (wl./wyl.) |
| `/roza 0` | Wylacz roze wiatrow |
| `/roza 1` | Wlacz tryb 1 - inline (wyswietlana w tekscie) |
| `/roza 2` | Wlacz tryb 2 - ramka (staly element w rogu obszaru gry) |

> **Wskazowka:** Przelaczanie trybu (`/roza 1`, `/roza 2`) wlacza roze jesli byla wylaczona. Tryb mozna rowniez zmienic w ustawieniach postaci (opcja "Roza wiatrow").

## Zaznaczanie lokacji

| Komenda | Opis |
|---------|------|
| `/zaznaczaj` | Wlacz zaznaczanie odwiedzanych lokacji na mapie |
| `/zaznaczaj-` | Wylacz zaznaczanie i usun dotychczasowe zaznaczenia |

## Informacje o lokacji

| Komenda | Opis |
|---------|------|
| `/info` | Wyswietl informacje o biezacej lokacji w oknie wyjscia |
| `/info id` | Wyswietl informacje o lokacji o podanym id |

## Notatki lokacji

| Komenda | Opis |
|---------|------|
| `/note` | Otworz edytor notatki dla biezacej lokacji |

## Okno mapy

| Komenda | Opis |
|---------|------|
| `/mapa` | Otworz nowe okno mapy na biezacej lokacji |
| `/mapa id` | Otworz nowe okno mapy na lokacji o podanym id |
| `/mapa nazwa` | Otworz nowe okno mapy wycentrowane na obszarze o podanej nazwie |

> **Wskazowka:** Okna mapy sa niezalezne od glownej mapy - nie sledza ruchu gracza. Mozna otworzyc wiele okien jednoczesnie. Kliknij prawym przyciskiem na lokacje i wybierz "Otworz okno mapy" aby otworzyc okno na wybranej lokacji.

## Multibindy lokacji

| Komenda | Opis |
|---------|------|
| `/mbind numer akcja` | Ustaw multibind 1-4 dla biezacej lokacji |
| `/mbind+ akcja` | Dodaj akcje do pierwszego wolnego multibinda |
| `/mbind-` | Usun wszystkie multibindy z biezacej lokacji |
| `/mbind- numer` | Usun wskazany multibind |
| `/mbind` | Wyswietl multibindy biezacej lokacji |
| `/mbind id` | Wyswietl multibindy dla lokacji o podanym id |
