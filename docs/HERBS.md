# Ziola

Modul licznika ziol pozwala zliczyc zawartosc wszystkich noszonych woreczkow z ziolami i zapisac te dane w pamieci przegladarki.

## Komendy

| Komenda | Opis |
|---------|------|
| `/ziola_buduj` | Przegladaj woreczki i zapisz ich zawartosc |
| `/woreczki_buduj` | Ocen stan wszystkich woreczkow i zapisz w liczniku |
| `/ziola_pokaz` | Wyswietl ostatnie podsumowanie ziol (bez listy woreczkow) |
| `/ziola` | Otworz okno zarzadzania woreczkami ziol |
| `/ziola2` | Wyswietl alternatywne podsumowanie ziol |

## Wyjmowanie ziol

| Komenda | Opis |
|---------|------|
| `/wezz ziolo` | Wyjmij jedna sztuke ziola z woreczkow |
| `/wezz ziolo ilosc` | Wyjmij wskazana liczbe ziola |
| `/zi akcja ziolo` | Wyjmij ziolo i od razu wykonaj akcje |
| `/zi akcja ziolo ilosc` | Wyjmij wskazana liczbe ziola i wykonaj akcje |
| `/z_akcja ziolo` | Alternatywa dla `/zi` - np. `/z_zjedz deliona` |
| `/z_akcja ziolo ilosc` | Alternatywa dla `/zi` z iloscia - np. `/z_przyloz lawenda 3` |

## Leczenie

Przy komunikacie o chorobie lub zatruciu (np. `Cierpisz na chorobe pluc.`) klient wypisuje liste ziol, ktorymi mozna sie wyleczyc. Ziola, ktore masz w woreczkach, sa zielone i klikalne - klikniecie wysyla odpowiednia komende `/zi`.

| Komenda | Opis |
|---------|------|
| `/leczenie` | Wyswietl liste wszystkich chorob i zapisanych na nie ziol |

> **Wskazowka:** Dostepnosc ziol jest sprawdzana na podstawie licznika woreczkow, wiec warto najpierw uzyc `/ziola_buduj`.

## Zarzadzanie woreczkami

| Komenda | Opis |
|---------|------|
| `/ziola_przepakuj from to` | Przepakuj ziola z woreczka `from` do woreczka `to` |
| `/ziola_daj cel ziolo` | Daj 1 sztuke ziola wskazanemu celowi |
| `/ziola_daj cel ziolo ilosc` | Daj wskazana ilosc ziola wskazanemu celowi |
| `/ziola_odloz_woreczek numer` | Odloz woreczek (odbezpiecz, odtrocz, odloz) |

> **Wskazowka:** Cel mozna podac jako skrot (litera/numer z listy obiektow, jak w `/z`, `/zas`) albo jako imie czlonka druzyny.

## Dawanie ziol z okna woreczkow

W oknie `/ziola` przycisk **Daj** wlacza panel przekazywania ziol:

1. Wybierz cel z listy (wszystkie postacie obecne na lokacji; druzyna jest wyswietlana osobno, przycisk odswiezania obok).
2. Przeciagnij ziola z woreczkow do panelu - shift+klik dzieli stos na pol, jesli chcesz dac tylko czesc.
3. Klikniecie ziola w panelu odklada je z powrotem do woreczka.
4. Przycisk **Daj** wyjmuje wszystkie zebrane ziola z woreczkow i przekazuje je jedna komenda `daj`.

## Ustawienia

W ustawieniach skryptow mozna zdefiniowac komendy wykonywane przed i po uzyciu ziol. Wiele komend nalezy oddzielic srednikiem (`;`).

> Informacje o zliczonych ziolach sa przechowywane w pamieci przegladarki osobno dla kazdej postaci.
