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

## Zarzadzanie woreczkami

| Komenda | Opis |
|---------|------|
| `/ziola_przepakuj from to` | Przepakuj ziola z woreczka `from` do woreczka `to` |
| `/ziola_daj cel ziolo` | Daj 1 sztuke ziola wskazanemu celowi |
| `/ziola_daj cel ziolo ilosc` | Daj wskazana ilosc ziola wskazanemu celowi |
| `/ziola_odloz_woreczek numer` | Odloz woreczek (odbezpiecz, odtrocz, odloz) |

> **Wskazowka:** Cel mozna podac jako skrot (litera/numer z listy obiektow, jak w `/z`, `/zas`) albo jako imie czlonka druzyny.

## Ustawienia

W ustawieniach skryptow mozna zdefiniowac komendy wykonywane przed i po uzyciu ziol. Wiele komend nalezy oddzielic srednikiem (`;`).

> Informacje o zliczonych ziolach sa przechowywane w pamieci przegladarki osobno dla kazdej postaci.
