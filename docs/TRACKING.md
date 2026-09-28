# Postępy

Liczniki zabitych, postępów, stażu i zleceń.

## Zabici

| Komenda | Opis |
|---------|------|
| `/zabici` | Pokaż tabelę z liczbą zabitych istot w bieżącej sesji |
| `/zabiciw` | Otwórz okno z liczbą zabitych istot |
| `/zabici2` | Wyświetl podsumowanie liczby zabitych istot |
| `/zabici2 data` | Wyświetl zabitych z danego dnia (np. `/zabici2 2017/1/22`) |
| `/zabici2w` | Otwórz okno z globalnym licznikiem zabitych (zakładki: wszystkie, wg dnia, statystyki) |
| `/zabici2!` | Wyświetl globalne statystyki zabitych z uwzględnieniem zabitych/dzień |
| `/zabici_reset` | Zeruj licznik zabitych istot |

## Postępy i cechy

| Komenda | Opis |
|---------|------|
| `cechy` | Uruchom licznik poziomowania i wyświetl postępy |
| `/cechyw` | Otwórz okno z historią zmian cech (postęp sumy podcech, zmiany każdej cechy i koszt w postępach) |
| `/postepy` | Wyświetl postępy |
| `/postepyw` | Otwórz okno z postępami |
| `/postepy_reset` | Zeruj licznik postępów |

> **Wskazówka:** historia cech zapisuje się tylko przy włączonej opcji
> `MODYFIKATORY stanu postaci` (`opcje modyfikatory wlacz`). Bez niej gra nie oznacza
> wzmocnionych cech i nie da się odróżnić prawdziwego wzrostu od chwilowego bonusu
> &mdash; okno `/cechyw` pokazuje wtedy ostrzeżenie z przyciskiem, który włącza tę opcję.
> Cechy z dopiskiem `( +cos )` są pomijane, a odczyt po śmierci
> (`Twoje cechy sa oslabione`) nie jest zapisywany wcale. Do historii trafiają tylko
> odczyty, które faktycznie się zmieniły. Odczyt, w którym któraś cecha jest niższa niż
> ostatnio zapisana, też jest pomijany (cechy spadają tylko po śmierci), a takie wpisy
> zapisane wcześniej są usuwane z historii przy jej wczytaniu.
>
> Każdy zapisany odczyt zapamiętuje też stan globalnego licznika postępów, więc okno
> pokazuje, ile postępów zdobyto między kolejnymi zmianami. Wymaga to prowadzonego
> licznika `/postepy2` &mdash; bez niego przy zmianach nie ma liczby postępów. Koszt
> podcechy rośnie z poziomem cechy, więc są to konkretne pomiary, a nie średnia.

## Globalny licznik postępów

| Komenda | Opis |
|---------|------|
| `/postepy2` | Wyświetl globalny licznik postępów |
| `/postepy2w` | Otwórz okno z globalnym licznikiem postępów (zakładki: dni, miesiące, lata, wykresy) |
| `/postepy2+` | Dodaj jeden postęp do globalnego licznika |
| `/postepy2+ ile` | Dodaj *ile* postępów (maksymalnie 15) |
| `/postepy2+ id ile` | Kopiuj *ile* postępów z wpisu o numerze *id* |
| `/postepy2- id` | Usuń wpis o numerze *id* z globalnego licznika |
| `/postepy2- id ile` | Usuń *ile* wpisów, zaczynając od *id* |
| `/postepy2_reset` | Resetuj globalny licznik postępów |
| `/postepy2_off` | Wyłącz automatyczne dodawanie do globalnego licznika |
| `/postepy2_on` | Włącz automatyczne dodawanie do globalnego licznika |

## Staż zawodowy

| Komenda | Opis |
|---------|------|
| `/staz` | Wyświetl aktualny postęp treningu zawodu (procent ukończenia) |
| `/staz liczba` | Rozpocznij zliczanie stażu od podanej wartości punktów |

> **Wskazówka:** 240 = pełny staż, 10 punktów tygodniowo, 3 punkty za +staż.

## Umiejętności

| Komenda | Opis |
|---------|------|
| `um` | Wyświetl zestawienie umiejętności w tabeli z kolorowymi poziomami i modyfikatorami (np. `(-teren)`) |
| `jezyki` | Wyświetl umiejętności językowe w tabeli z kolorowymi poziomami |
| `jezyki maksymalne` | Wyświetl umiejętności językowe z maksymalnymi wartościami |

## Wiedza i biblioteki

| Komenda | Opis |
|---------|------|
| `/zglebiaj` | Wyświetl kategorie wiedzy w aktualnej bibliotece |
| `/biblioteki` | Wyświetl raport z bibliotek |
| `/wiedza` | Otwórz okno raportu wiedzy |
| `/wiedza_buduj` | Wykonaj komendy `wiedza o ...` i aktualizuj raport dla bieżącej postaci |

## Paczki

| Komenda | Opis |
|---------|------|
| `/paczki` | Wyświetl statystyki dostarczonych paczek (dziś, tydzień, miesiąc, łącznie) |

> **Wskazówka:** Statystyki zapisują się automatycznie po każdym dostarczeniu paczki. Spóźnione dostawy są oznaczane osobno.

## Zlecenia

| Komenda | Opis |
|---------|------|
| `/zlecenia` | Otwórz okno z listą aktywnych zleceń od rzemieślników |
