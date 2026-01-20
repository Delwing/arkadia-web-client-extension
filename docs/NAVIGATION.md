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
| `/prowadz-` | Zakoncz prowadzenie |
| `/go` | Wybierz wyjscie zgodnie z wyznaczona trasa (gdy aktywne prowadzenie) |

## Wyszukiwanie na mapie

| Komenda | Opis |
|---------|------|
| `/przeszukaj tekst` | Wyszukaj pokoje z nazwami zawierajacymi tekst (do 10 najblizszych) |

## Zaznaczanie lokacji

| Komenda | Opis |
|---------|------|
| `/zaznaczaj` | Wlacz zaznaczanie odwiedzanych lokacji na mapie |
| `/zaznaczaj-` | Wylacz zaznaczanie i usun dotychczasowe zaznaczenia |

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
