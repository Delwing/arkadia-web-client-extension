# Postepy

Liczniki zabitych, postepow, stazu i zlecen.

## Zabici

| Komenda | Opis |
|---------|------|
| `/zabici` | Pokaz tabele z liczba zabitych istot w biezacej sesji |
| `/zabiciw` | Otworz okno z liczba zabitych istot |
| `/zabici2` | Wyswietl podsumowanie liczby zabitych istot |
| `/zabici2 data` | Wyswietl zabitych z danego dnia (np. `/zabici2 2017/1/22`) |
| `/zabici2w` | Otworz okno z globalnym licznikiem zabitych (zakladki: wszystkie, wg dnia, statystyki) |
| `/zabici2!` | Wyswietl globalne statystyki zabitych z uwzglednieniem zabitych/dzien |
| `/zabici_reset` | Zeruj licznik zabitych istot |

## Postepy i cechy

| Komenda | Opis |
|---------|------|
| `cechy` | Uruchom licznik poziomowania i wyswietl postepy |
| `/cechyw` | Otworz okno z historia zmian cech (postep sumy podcech, zmiany kazdej cechy i koszt w postepach) |
| `/postepy` | Wyswietl postepy |
| `/postepyw` | Otworz okno z postepami |
| `/postepy_reset` | Zeruj licznik postepow |

> **Wskazowka:** historia cech zapisuje sie tylko przy wlaczonej opcji
> `MODYFIKATORY stanu postaci` (`opcje modyfikatory wlacz`). Bez niej gra nie oznacza
> wzmocnionych cech i nie da sie odroznic prawdziwego wzrostu od chwilowego bonusu
> &mdash; okno `/cechyw` pokazuje wtedy ostrzezenie z przyciskiem, ktory wlacza ta opcje.
> Cechy z dopiskiem `( +cos )` sa pomijane, a odczyt po smierci
> (`Twoje cechy sa oslabione`) nie jest zapisywany wcale. Do historii trafiaja tylko
> odczyty, ktore faktycznie sie zmienily.
>
> Kazdy zapisany odczyt zapamietuje tez stan globalnego licznika postepow, wiec okno
> pokazuje, ile postepow zdobyto miedzy kolejnymi zmianami. Wymaga to prowadzonego
> licznika `/postepy2` &mdash; bez niego przy zmianach nie ma liczby postepow. Koszt
> podcechy rosnie z poziomem cechy, wiec sa to konkretne pomiary, a nie srednia.

## Globalny licznik postepow

| Komenda | Opis |
|---------|------|
| `/postepy2` | Wyswietl globalny licznik postepow |
| `/postepy2w` | Otworz okno z globalnym licznikiem postepow (zakladki: dni, miesiace, lata, wykresy) |
| `/postepy2+` | Dodaj jeden postep do globalnego licznika |
| `/postepy2+ ile` | Dodaj *ile* postepow (maksymalnie 15) |
| `/postepy2+ id ile` | Kopiuj *ile* postepow z wpisu o numerze *id* |
| `/postepy2- id` | Usun wpis o numerze *id* z globalnego licznika |
| `/postepy2- id ile` | Usun *ile* wpisow zaczynajac od *id* |
| `/postepy2_reset` | Resetuj globalny licznik postepow |
| `/postepy2_off` | Wylacz automatyczne dodawanie do globalnego licznika |
| `/postepy2_on` | Wlacz automatyczne dodawanie do globalnego licznika |

## Staz zawodowy

| Komenda | Opis |
|---------|------|
| `/staz` | Wyswietl aktualny postep treningu zawodu (procent ukonczenia) |
| `/staz liczba` | Rozpocznij zliczanie stazu od podanej wartosci punktow |

> **Wskazowka:** 240 = pelny staz, 10 punktow tygodniowo, 3 punkty za +staz.

## Umiejetnosci

| Komenda | Opis |
|---------|------|
| `um` | Wyswietl zestawienie umiejetnosci w tabeli z kolorowymi poziomami |
| `jezyki` | Wyswietl umiejetnosci jezykowe w tabeli z kolorowymi poziomami |
| `jezyki maksymalne` | Wyswietl umiejetnosci jezykowe z maksymalnymi wartosciami |

## Wiedza i biblioteki

| Komenda | Opis |
|---------|------|
| `/zglebiaj` | Wyswietl kategorie wiedzy w aktualnej bibliotece |
| `/biblioteki` | Wyswietl raport z bibliotek |
| `/wiedza` | Otworz okno raportu wiedzy |
| `/wiedza_buduj` | Wykonaj komendy `wiedza o ...` i aktualizuj raport dla biezacej postaci |

## Paczki

| Komenda | Opis |
|---------|------|
| `/paczki` | Wyswietl statystyki dostarczonych paczek (dzis, tydzien, miesiac, lacznie) |

> **Wskazowka:** Statystyki zapisuja sie automatycznie po kazdym dostarczeniu paczki. Spoznione dostawy sa oznaczane osobno.

## Zlecenia

| Komenda | Opis |
|---------|------|
| `/zlecenia` | Otworz okno z lista aktywnych zlecen od rzemieslnikow |
