# Przechowywanie danych

Klient trzyma wszystkie dane w przeglądarce, na twoim urządzeniu. Nie ma konta na serwerze klienta - do chmury trafia tylko to, co sam wyślesz przez synchronizację albo kopię zapasową.

## Gdzie są dane

Dane należą do **jednej przeglądarki i jednego adresu strony**. Inna przeglądarka, inny profil przeglądarki albo okno prywatne to osobny, pusty klient. Zainstalowanie klienta jako aplikacji (menu przeglądarki -> Zainstaluj) korzysta z tych samych danych co karta.

| Rodzaj | Co tam jest |
|--------|-------------|
| **Ustawienia** (pamięć strony) | Wygląd, bindy, skróty, aliasy, triggery, skrypty, przyciski, układ okien - wspólne dla wszystkich postaci |
| **Dane postaci** (pamięć strony) | Ustawienia rozgrywki, liczniki zabitych i postępów, depozyty, pojemniki, woreczki z ziołami, znajomi - osobno dla każdej postaci |
| **Bazy danych** (IndexedDB) | Mapa, baza postaci i NPC, zioła, magie, wiedza, odwiedzone lokacje, notatki lokacji, statystyki, logi i nagrania sesji, wtyczki, wgrane czcionki i dźwięki |
| **Pamięć karty** | Hasło szyfrowania synchronizacji i identyfikator sesji proxy - znikają po zamknięciu karty |

Dane postaci są przypisane do imienia postaci, więc kilka postaci na jednym urządzeniu się nie miesza. Zmiany zrobione w jednej karcie od razu widać w pozostałych otwartych kartach klienta.

## Dane pobierane z sieci

Mapa, baza postaci i inne bazy referencyjne są pobierane przy pierwszym uruchomieniu i zapisywane lokalnie. Później klient korzysta z kopii na urządzeniu i co jakiś czas sprawdza, czy jest nowsza wersja. Klient nie działa bez internetu - potrzebuje połączenia z grą - ale nie pobiera mapy przy każdym starcie.

## Co zostaje tylko na urządzeniu

Tych danych nie wysyła ani synchronizacja, ani kopia zapasowa:

- **Logi sesji** - przeglądasz je w oknie **Logi**; możesz je zapisać do pliku.
- **Pliki wgranych czcionek i dźwięków** - synchronizowana jest tylko ich nazwa lub lista, nie same pliki.
- **Klucz API asystenta** - wysyłany wyłącznie do wybranego dostawcy.
- **Dostęp do Google Drive** - token logowania do kopii zapasowej.

Nagrania sesji i zainstalowane wtyczki nie są synchronizowane, ale trafiają do kopii zapasowej. Szczegóły synchronizacji i lista synchronizowanych kategorii są w dziale **Synchronizacja**.

## Trwałość danych

Przy starcie klient prosi przeglądarkę o trwałe przechowywanie, żeby przy braku miejsca na dysku nie usunęła logów i mapy. Przeglądarka może się na to nie zgodzić bez pytania - wtedy przy bardzo małej ilości wolnego miejsca może sama wyczyścić dane strony.

## Czyszczenie danych

**Wyczyszczenie danych strony** w przeglądarce (albo "Wyczyść historię" z zaznaczonymi plikami cookie i danymi witryn) usuwa wszystko powyżej: ustawienia, liczniki, logi, nagrania, wtyczki i czcionki. Wróci tylko to, co było w chmurze albo w kopii zapasowej.

Zanim wyczyścisz dane, przeniesiesz klienta do innej przeglądarki albo zmienisz komputer:

1. Zrób kopię zapasową w **Ustawienia > Kopia zapasowa** (plik albo Google Drive), albo
2. Zaloguj się do synchronizacji i poczekaj, aż zmiany zostaną wysłane (przycisk **Wyślij do chmury** robi to od razu).

Logi sesji, których potrzebujesz, zapisz osobno do pliku - nie ma ich w kopii ani w chmurze.
