# Synchronizacja Firebase

Rozszerzenie umożliwia synchronizację ustawień między urządzeniami za pomocą Firebase. Dzięki temu możesz korzystać z tych samych ustawień na różnych komputerach, telefonach i przeglądarkach.

## Spis treści

- [Logowanie](#logowanie)
- [Synchronizowane kategorie](#synchronizowane-kategorie)
- [Automatyczna synchronizacja](#automatyczna-synchronizacja)
- [Ręczne wysyłanie](#ręczne-wysyłanie)
- [Szyfrowanie](#szyfrowanie)
- [Łączenie zmian z wielu urządzeń](#łączenie-zmian-z-wielu-urządzeń)
- [Zarządzanie urządzeniami](#zarządzanie-urządzeniami)
- [Grupy synchronizacji](#grupy-synchronizacji)
- [Przejęcie sesji na innym urządzeniu](#przejęcie-sesji-na-innym-urządzeniu)
- [Usuwanie danych z chmury](#usuwanie-danych-z-chmury)
- [Rozwiązywanie problemów](#rozwiązywanie-problemów)

---

## Logowanie

Aby korzystać z synchronizacji, musisz najpierw zalogować się na konto. Przejdź do **Ustawienia > Firebase**.

### Metody logowania

1. **Email i hasło** - Wpisz adres email i hasło. Jeśli nie masz konta, użyj formularza rejestracji.
2. **Logowanie przez Google** - Kliknij przycisk "Zaloguj przez Google". Otworzy się okno logowania Google.

### Resetowanie hasła

Jeśli zapomniałeś hasła, wpisz swój adres email i kliknij "Resetuj hasło". Na podany adres zostanie wysłany link do zmiany hasła.

### Wylogowanie

Po zalogowaniu zobaczysz informacje o koncie (email, metoda logowania). Kliknij "Wyloguj", aby zakończyć sesję. Wylogowanie zatrzymuje automatyczną synchronizację.

---

## Synchronizowane kategorie

Synchronizowane są zawsze wszystkie poniższe kategorie - nie trzeba (i nie da się) wybierać, co ma być wysyłane. Dotyczy to też wszystkich postaci.

| Kategoria | Opis |
|-----------|------|
| **Ustawienia interfejsu** | Kolory, czcionki, motyw, układ okien |
| **Bindy klawiszy** | Przypisania klawiszy do komend |
| **Skróty** | Zapisane lokacje na mapie |
| **Ustawienia postaci** | Ustawienia rozgrywki (profesja, staż itp.) |
| **Triggery** | Triggery reagujące na tekst z gry |
| **Aliasy** | Aliasy komend |
| **Grupy automatyzacji** | Grupy aliasów i triggerów oraz to, czy są włączone |
| **Skrypty automatyzacji** | Skrypty JavaScript z okna Automatyzacja |
| **Multibindy** | Wielokrotne przypisania klawiszy |
| **Przyciski** | Konfiguracja przycisków na ekranie |
| **Menu radialne** | Ustawienia menu radialnego |
| **Odwiedzone lokacje** | Lista odwiedzonych lokacji na mapie |
| **Notatki lokacji** | Notatki przypisane do lokacji |
| **Licznik zabitych** | Statystyki zabitych przeciwników |
| **Licznik postępów** | Statystyki postępów umiejętności |
| **Depozyty** | Dane o depozytach |
| **Pojemniki** | Konfiguracja pojemników |
| **Edycje bazy postaci** | Lokalne edycje bazy postaci |
| **Wiedza** | Postępy w bibliotekach i książkach, wiedza, ticki i poziomy |
| **Oswajanie** | Karmienia, poziomy zwierząt i grupy pokarmów |
| **Odporności przeciwników** | Zapisane odporności i wrażliwości |
| **Złom** | Baza ocenionych przedmiotów |
| **Czasy transportu** | Najkrótsze i najdłuższe czasy przejazdów |
| **Dostawy** | Historia dostarczonych paczek |

Kopia zapasowa (plik lub Google Drive, w **Ustawienia > Kopia zapasowa**) zawiera zawsze wszystkie te dane, a dodatkowo nagrania sesji i zainstalowane skrypty. Przywrócenie kopii (po potwierdzeniu) zastępuje ustawienia na wszystkich Twoich urządzeniach; dane postępów (wiedza, licznik zabitych, odwiedzone lokacje itp.) są łączone, a nie zastępowane.

### Kategorie powiązane z urządzeniem

Dwie kategorie są traktowane specjalnie - **Ustawienia interfejsu** i **Przyciski**. Te ustawienia są powiązane z konkretnym urządzeniem, ponieważ różne urządzenia mogą mieć różne rozmiary ekranu i układy. Nie są automatycznie stosowane na innych urządzeniach, chyba że należą do tej samej [grupy synchronizacji](#grupy-synchronizacji).

Kategoria **Ustawienia interfejsu** obejmuje także układ okien, trasy podróży (trip planner) i aktywną mapę klawiszy.

---

## Automatyczna synchronizacja

Po włączeniu automatycznej synchronizacji zmiany są wysyłane do chmury i odbierane na innych urządzeniach bez Twojego udziału.

### Jak to działa

1. **Wysyłanie w trakcie gry** - zmiany są zbierane i wysyłane razem co **5 minut**. Każda zmiana trafia do chmury tylko raz, więc synchronizacja nie obciąża serwera.
2. **Wysyłanie przy przełączaniu** - gdy ukrywasz kartę klienta (przełączasz okno, blokujesz telefon) albo zamykasz stronę, oczekujące zmiany są wysyłane natychmiast. Urządzenie, na które się przesiadasz, ma już wszystko.
3. **Podgląd na drugim urządzeniu** - gdy klient jest otwarty i widoczny na innym Twoim urządzeniu, zmiany są wysyłane co kilkanaście sekund, żeby było je widać na bieżąco (np. postępy na telefonie w trakcie gry na komputerze).
4. **Odbieranie zmian** - widoczna karta klienta odbiera zmiany z innych urządzeń na bieżąco i stosuje je bez odświeżania strony. Ukryta karta nie nasłuchuje; po powrocie do niej od razu pobiera to, co się zmieniło.

### Wiele kart przeglądarki

Możesz mieć otwartych kilka kart klienta jednocześnie - synchronizacja działa tylko w jednej z nich (pozostałe przejmują tę rolę automatycznie po jej zamknięciu), więc dane nie są wysyłane wielokrotnie.

### Pierwsze uruchomienie na urządzeniu

Przy pierwszym uruchomieniu nowej synchronizacji urządzenie pobiera dane zapisane przez poprzednią wersję i dopiero potem wysyła swoje. Ustawienia, które już są w chmurze, mają pierwszeństwo przed domyślnymi ustawieniami nowego urządzenia; dane, które ma tylko to urządzenie, są dodawane.

Zanim nowa synchronizacja cokolwiek zmieni, urządzenie zapisuje u siebie pełną kopię danych. Znajdziesz ją w zakładce kopii zapasowej: możesz ją przywrócić ("Przywróć stan sprzed aktualizacji") albo pobrać jako plik.

### Włączanie automatycznej synchronizacji

1. Przejdź do **Ustawienia > Firebase**
2. Zaloguj się na konto
3. Zaznacz "Automatyczna synchronizacja"

### Ręczne wysyłanie

Przycisk **"Wyślij do chmury"** wysyła oczekujące zmiany od razu, bez czekania na kolejną synchronizację. **"Pobierz z chmury"** pobiera wszystko, co jest w chmurze, i łączy to z danymi na urządzeniu.

Oba przyciski działają także przy wyłączonej automatycznej synchronizacji: wykonują wtedy jednorazową synchronizację (najpierw pobierają zmiany z chmury, potem wysyłają swoje) i synchronizacja znów się zatrzymuje.

---

## Szyfrowanie

Możesz zabezpieczyć swoje dane w chmurze, szyfrując je hasłem.

### Jak włączyć szyfrowanie

1. Przejdź do **Ustawienia > Firebase**
2. Zaznacz "Szyfrowanie"
3. Wpisz hasło szyfrowania

### Ważne informacje

- Dane są szyfrowane algorytmem **AES-256-GCM** - jest to silne szyfrowanie stosowane w bankach i wojsku.
- **Hasło nie jest nigdzie zapisywane** na serwerze. Jeśli je zapomnisz, nie ma możliwości odzyskania zaszyfrowanych danych.
- Hasło jest pamiętane lokalnie tylko do zamknięcia karty przeglądarki - po ponownym otwarciu klienta trzeba je podać ponownie.
- Musisz użyć **tego samego hasła** na wszystkich urządzeniach, które chcą odczytać zaszyfrowane dane. Klient weryfikuje hasło przed wysłaniem danych - urządzenie z innym hasłem dostanie błąd, zamiast po cichu nadpisać dane niemożliwym do odczytania wpisem.
- Jeśli inne urządzenie odbierze zaszyfrowane dane bez podanego hasła, zostaniesz poproszony o wprowadzenie hasła. Dane zostaną odszyfrowane po jego podaniu.
- Aby zmienić hasło: wyłącz szyfrowanie (dane zostaną zapisane w chmurze bez szyfrowania), a następnie włącz je ponownie z nowym hasłem.

---

## Łączenie zmian z wielu urządzeń

Nie ma konfliktów do rozwiązywania - zmiany z różnych urządzeń są łączone automatycznie, osobno dla każdego elementu (każdego aliasu, triggera, lokacji, wpisu wiedzy itd.):

- **Ustawienia, aliasy, triggery, bindy, notatki** - wygrywa najnowsza zmiana danego elementu. Edycja aliasu na telefonie nie nadpisuje innego aliasu zmienionego na komputerze.
- **Odwiedzone lokacje, ticki wiedzy, karmienia, dostawy** - dane z obu urządzeń są sumowane, nic nie ginie.
- **Licznik zabitych, ręczne zmiany licznika postępów** - liczby z urządzeń są dodawane.
- **Postępy zliczone w grze (`/postepy`, `/postepy2`)** - przypisane do sesji w grze (numeru obiektu postaci). Gdy przejmiesz tę samą sesję na innym urządzeniu, lista `/postepy` (z czasami) jest kontynuowana, a postępy tej sesji nie są liczone w `/postepy2` drugi raz. Nowe zalogowanie (nowy numer obiektu) zaczyna nową listę.
- **Postępy w bibliotekach i książkach** - postęp tylko rośnie.
- **Awans poziomu wiedzy lub zwierzęcia** - liczy się pierwsza obserwacja; urządzenie, które zobaczyło nowy poziom później, nie przesuwa momentu awansu (ticki i karmienia od awansu liczą się poprawnie).

---

## Zarządzanie urządzeniami

Przejdź do **Ustawienia > Zarządzanie urządzeniami**, aby zarządzać swoimi urządzeniami.

### Informacje o urządzeniu

Każde urządzenie jest automatycznie identyfikowane na podstawie przeglądarki i systemu operacyjnego (np. "Chrome on Windows"). Możesz ustawić własną nazwę urządzenia, aby łatwiej je rozpoznać.

### Zmiana nazwy urządzenia

1. Przejdź do **Ustawienia > Zarządzanie urządzeniami**
2. Kliknij przycisk edycji obok nazwy urządzenia
3. Wpisz nową nazwę
4. Kliknij "Zapisz"

### Rejestracja urządzenia w chmurze

Po zalogowaniu Twoje urządzenie jest automatycznie rejestrowane w chmurze. Dzięki temu inne urządzenia mogą zobaczyć listę Twoich urządzeń i kopiować z nich ustawienia.

### Kopiowanie ustawień z innego urządzenia

Jeśli chcesz przenieść ustawienia z jednego urządzenia na drugie:

1. Zaloguj się na to samo konto na obu urządzeniach
2. Na urządzeniu docelowym przejdź do **Zarządzanie urządzeniami**
3. W sekcji "Urządzenia w chmurze" znajdź urządzenie źródłowe
4. Kliknij "Kopiuj ustawienia"

### Importowane urządzenia

Jeśli zaimportujesz ustawienia z pliku (np. backup), pojawią się one w sekcji "Importowane urządzenia". Możesz:
- **Skopiować ustawienia** z zaimportowanego urządzenia na bieżące
- **Usunąć** zaimportowane urządzenie z listy

---

## Grupy synchronizacji

Grupy synchronizacji pozwalają na synchronizację ustawień powiązanych z urządzeniem (układ interfejsu, przyciski) między wybranymi urządzeniami.

### Po co są grupy?

Domyślnie ustawienia interfejsu i przycisków **nie są automatycznie stosowane** na innych urządzeniach, ponieważ różne urządzenia mogą mieć różne rozmiary ekranów. Jeśli jednak masz np. dwa komputery z podobnymi monitorami i chcesz mieć identyczny układ na obu, możesz połączyć je w grupę.

### Tworzenie grupy

1. Przejdź do **Zarządzanie urządzeniami**
2. W sekcji "Grupa synchronizacji" wpisz nazwę grupy
3. Kliknij "Utwórz grupę"

Grupa zostanie utworzona i bieżące urządzenie automatycznie do niej dołączy.

### Dołączanie do grupy

Aby drugie urządzenie dołączyło do istniejącej grupy:

1. Na drugim urządzeniu przejdź do **Zarządzanie urządzeniami**
2. W sekcji "Grupy w chmurze" znajdź swoją grupę
3. Kliknij "Dołącz"

Po dołączeniu ustawienia grupy zostaną zastosowane na tym urządzeniu.

### Synchronizacja w grupie

Gdy urządzenia są w tej samej grupie:
- Zmiany w układzie interfejsu i przyciskach są synchronizowane między urządzeniami w grupie automatycznie, razem z pozostałymi kategoriami (zakładka **Synchronizacja konfiguracji**)
- Wygrywa najnowszy układ spośród urządzeń grupy

### Opuszczanie grupy

Kliknij "Opuść grupę", aby odłączyć urządzenie od grupy. Twoje lokalne ustawienia pozostaną bez zmian, ale nie będą już synchronizowane z innymi urządzeniami w grupie. Jeśli jesteś ostatnim urządzeniem w grupie, grupa zostanie automatycznie usunięta.

---

## Usuwanie danych z chmury

Jeśli chcesz usunąć wszystkie swoje dane z chmury:

1. Przejdź do **Ustawienia > Firebase**
2. Przewiń do sekcji "Dane w chmurze"
3. Kliknij "Usuń wszystkie dane"
4. Potwierdź usunięcie

**Uwaga**: Ta operacja jest nieodwracalna i usuwa z chmury także dane powiązane z pozostałymi urządzeniami (układy interfejsu, przyciski). Lokalne dane na Twoim urządzeniu nie zostaną usunięte - zaraz potem to urządzenie wyśle je ponownie, więc chmura zaczyna od jego danych. Pozostałe urządzenia przy najbliższej synchronizacji przejmują dane z chmury (czyli z tego urządzenia); dodają do nich tylko to, czego w chmurze nie ma, np. lokacje odwiedzone tylko na nich.

---

## Przejęcie sesji na innym urządzeniu

Gdy zalogujesz się postacią na drugim urządzeniu, gra rozłącza pierwsze. Jeśli na obu jesteś zalogowany do tego samego konta Firebase, nowe urządzenie od razu ustawi mapę w lokacji, w której postać została na poprzednim - bez czekania na synchronizację.

- Lokację zapisuje urządzenie, które **widzi** koniec swojej sesji: przejęcie przez inne urządzenie albo rozłączenie przez ciebie. Po rozłączeniu można wrócić na innym urządzeniu do 30 minut później.
- Nic nie jest zapisywane, gdy karta była w tle (np. telefon w kieszeni) albo mapa zgubiła pozycję - klient nie wie wtedy na pewno, gdzie jest postać, więc lepiej nie zgadywać.
- Lokacja nie zostanie ustawiona, jeśli na nowym urządzeniu zdążysz się już ruszyć.
- Lokacja jest ustawiana tylko wtedy, gdy postać wciąż była w świecie gry (przejęcie albo powrót przed rozłączeniem przez grę). Po wyjściu z gry, rozłączeniu za bezczynność lub restarcie gry postać pojawia się w innym miejscu i zapisana lokacja jest pomijana.

## Rozwiązywanie problemów

### Nie mogę się zalogować

- **"Popup został zablokowany"** - Odblokuj wyskakujące okna (popupy) dla strony klienta w ustawieniach przeglądarki.
- **"Nieprawidłowe hasło"** - Sprawdź, czy wpisujesz poprawne hasło. Możesz je zresetować przez email.
- **"Ten adres email jest już używany"** - Masz już konto. Użyj logowania zamiast rejestracji.
- **"Błąd połączenia z serwerem"** - Sprawdź połączenie internetowe i spróbuj ponownie.

### Synchronizacja nie działa

- Sprawdź, czy jesteś zalogowany
- Sprawdź, czy automatyczna synchronizacja jest włączona
- Sprawdź połączenie internetowe

### Nie mogę odszyfrować danych

- Upewnij się, że wpisujesz **dokładnie to samo hasło**, które zostało użyte do szyfrowania
- Hasło jest wrażliwe na wielkość liter
- Jeśli zapomniałeś hasła, nie ma możliwości odzyskania zaszyfrowanych danych - musisz wysłać dane ponownie z urządzenia, na którym są zapisane lokalnie

### Dane nie pojawiają się na drugim urządzeniu

- Ukryj kartę klienta na pierwszym urządzeniu (albo poczekaj do 5 minut) - zmiany wysyłają się przy ukryciu karty
- Sprawdź, czy na obu urządzeniach jesteś zalogowany na to samo konto
- Dla ustawień interfejsu i przycisków - sprawdź, czy urządzenia są w tej samej [grupie synchronizacji](#grupy-synchronizacji)
- Spróbuj wysłać zmiany ręcznie przyciskiem "Wyślij do chmury"
- Synchronizacja działa w jednej karcie przeglądarki - jeśli masz kilka kart, zmiany wysyła pierwsza otwarta
