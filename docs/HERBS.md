# Zioła

Moduł licznika ziół pozwala zliczyć zawartość wszystkich noszonych woreczków z ziołami i zapisać te dane w pamięci przeglądarki.

## Komendy

| Komenda | Opis |
|---------|------|
| `/ziola_buduj` | Przeglądaj woreczki i zapisz ich zawartość |
| `/woreczki_buduj` | Oceń stan wszystkich woreczków i zapisz w liczniku |
| `/ziola_pokaz` | Wyświetl ostatnie podsumowanie ziół (bez listy woreczków) |
| `/ziola` | Otwórz okno zarządzania woreczkami ziół |
| `/ziola2` | Wyświetl alternatywne podsumowanie ziół |

## Wyjmowanie ziół

| Komenda | Opis |
|---------|------|
| `/wezz ziolo` | Wyjmij jedną sztukę zioła z woreczków |
| `/wezz ziolo ilosc` | Wyjmij wskazaną liczbę zioła |
| `/zi akcja ziolo` | Wyjmij zioło i od razu wykonaj akcję |
| `/zi akcja ziolo ilosc` | Wyjmij wskazaną liczbę zioła i wykonaj akcję |
| `/z_akcja ziolo` | Alternatywa dla `/zi` - np. `/z_zjedz deliona` |
| `/z_akcja ziolo ilosc` | Alternatywa dla `/zi` z ilością - np. `/z_przyloz lawenda 3` |

## Leczenie

Przy komunikacie o chorobie lub zatruciu (np. `Cierpisz na chorobe pluc.`) klient wypisuje listę ziół, którymi można się wyleczyć. Zioła, które masz w woreczkach, są zielone i klikalne - kliknięcie wysyła odpowiednią komendę `/zi`.

| Komenda | Opis |
|---------|------|
| `/leczenie` | Wyświetl listę wszystkich chorób i zapisanych na nie ziół |

> **Wskazówka:** Dostępność ziół jest sprawdzana na podstawie licznika woreczków, więc warto najpierw użyć `/ziola_buduj`.

## Zarządzanie woreczkami

| Komenda | Opis |
|---------|------|
| `/ziola_przepakuj from to` | Przepakuj zioła z woreczka `from` do woreczka `to` |
| `/ziola_daj cel ziolo` | Daj 1 sztukę zioła wskazanemu celowi |
| `/ziola_daj cel ziolo ilosc` | Daj wskazaną ilość zioła wskazanemu celowi |
| `/ziola_odloz_woreczek numer` | Odłóż woreczek (odbezpiecz, odtrocz, odłóż) |

> **Wskazówka:** Cel można podać jako skrót (litera/numer z listy obiektów, jak w `/z`, `/zas`) albo jako imię członka drużyny.

## Dawanie ziół z okna woreczków

W oknie `/ziola` przycisk **Daj** włącza panel przekazywania ziół:

1. Wybierz cel z listy (wszystkie postacie obecne na lokacji; drużyna jest wyświetlana osobno, przycisk odświeżania obok).
2. Przeciągnij zioła z woreczków do panelu - shift+klik dzieli stos na pół, jeśli chcesz dać tylko część.
3. Kliknięcie zioła w panelu odkłada je z powrotem do woreczka.
4. Przycisk **Daj** wyjmuje wszystkie zebrane zioła z woreczków i przekazuje je jedną komendą `daj`.

## Ustawienia

W ustawieniach skryptów można zdefiniować komendy wykonywane przed i po użyciu ziół. Wiele komend należy oddzielić średnikiem (`;`).

> Informacje o zliczonych ziołach są przechowywane w pamięci przeglądarki osobno dla każdej postaci.
