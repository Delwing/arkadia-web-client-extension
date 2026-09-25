# Synchronizacja Firebase

Rozszerzenie umozliwia synchronizacje ustawien miedzy urzadzeniami za pomoca Firebase. Dzieki temu mozesz korzystac z tych samych ustawien na roznych komputerach, telefonach i przegladarkach.

## Spis tresci

- [Logowanie](#logowanie)
- [Synchronizowane kategorie](#synchronizowane-kategorie)
- [Automatyczna synchronizacja](#automatyczna-synchronizacja)
- [Reczna synchronizacja](#reczna-synchronizacja)
- [Szyfrowanie](#szyfrowanie)
- [Laczenie zmian z wielu urzadzen](#laczenie-zmian-z-wielu-urzadzen)
- [Zarzadzanie urzadzeniami](#zarzadzanie-urzadzeniami)
- [Grupy synchronizacji](#grupy-synchronizacji)
- [Przejecie sesji na innym urzadzeniu](#przejecie-sesji-na-innym-urzadzeniu)
- [Usuwanie danych z chmury](#usuwanie-danych-z-chmury)
- [Rozwiazywanie problemow](#rozwiazywanie-problemow)

---

## Logowanie

Aby korzystac z synchronizacji, musisz najpierw zalogowac sie na konto. Przejdz do **Ustawienia > Firebase**.

### Metody logowania

1. **Email i haslo** - Wpisz adres email i haslo. Jesli nie masz konta, uzyj formularza rejestracji.
2. **Logowanie przez Google** - Kliknij przycisk "Zaloguj przez Google". Otworzy sie okno logowania Google.

### Resetowanie hasla

Jesli zapomnialesz hasla, wpisz swoj adres email i kliknij "Resetuj haslo". Na podany adres zostanie wyslany link do zmiany hasla.

### Wylogowanie

Po zalogowaniu zobaczysz informacje o koncie (email, metoda logowania). Kliknij "Wyloguj" aby zakonczyc sesje. Wylogowanie zatrzymuje automatyczna synchronizacje.

---

## Synchronizowane kategorie

Synchronizowane sa zawsze wszystkie ponizsze kategorie - nie trzeba (i nie da sie) wybierac, co ma byc wysylane. Dotyczy to tez wszystkich postaci.

| Kategoria | Opis |
|-----------|------|
| **Ustawienia interfejsu** | Kolory, czcionki, motyw, uklad okien |
| **Bindy klawiszy** | Przypisania klawiszy do komend |
| **Skroty** | Zapisane lokacje na mapie |
| **Ustawienia postaci** | Ustawienia rozgrywki (profesja, staz, itp.) |
| **Triggery** | Triggery reagujace na tekst z gry |
| **Aliasy** | Aliasy komend |
| **Grupy automatyzacji** | Grupy aliasow i triggerow oraz to, czy sa wlaczone |
| **Skrypty automatyzacji** | Skrypty JavaScript z okna Automatyzacja |
| **Multibindy** | Wielokrotne przypisania klawiszy |
| **Przyciski** | Konfiguracja przyciskow na ekranie |
| **Menu radialne** | Ustawienia menu radialnego |
| **Odwiedzone lokacje** | Lista odwiedzonych lokacji na mapie |
| **Notatki lokacji** | Notatki przypisane do lokacji |
| **Licznik zabitych** | Statystyki zabitych przeciwnikow |
| **Licznik postepow** | Statystyki postepow umiejetnosci |
| **Depozyty** | Dane o depozytach |
| **Pojemniki** | Konfiguracja pojemnikow |
| **Edycje bazy postaci** | Lokalne edycje bazy postaci |
| **Wiedza** | Postepy w bibliotekach i ksiazkach, wiedza, ticki i poziomy |
| **Oswajanie** | Karmienia, poziomy zwierzat i grupy pokarmow |
| **Odpornosci przeciwnikow** | Zapisane odpornosci i wrazliwosci |
| **Zlom** | Baza ocenionych przedmiotow |
| **Czasy transportu** | Najkrotsze i najdluzsze czasy przejazdow |
| **Dostawy** | Historia dostarczonych paczek |

Kopia zapasowa (plik lub Google Drive, w **Ustawienia > Kopia zapasowa**) zawiera zawsze wszystkie te dane, a dodatkowo nagrania sesji i zainstalowane skrypty. Przywrocenie kopii (po potwierdzeniu) zastepuje ustawienia na wszystkich Twoich urzadzeniach; dane postepow (wiedza, licznik zabitych, odwiedzone lokacje itp.) sa laczone, a nie zastepowane.

### Kategorie powiazane z urzadzeniem

Dwie kategorie sa traktowane specjalnie - **Ustawienia interfejsu** i **Przyciski**. Te ustawienia sa powiazane z konkretnym urzadzeniem, poniewaz rozne urzadzenia moga miec rozne rozmiary ekranu i ukady. Nie sa automatycznie stosowane na innych urzadzeniach, chyba ze naleza do tej samej [grupy synchronizacji](#grupy-synchronizacji).

Kategoria **Ustawienia interfejsu** obejmuje takze uklad okien, trasy podrozy (trip planner) i aktywna mape klawiszy.

---

## Automatyczna synchronizacja

Po wlaczeniu automatycznej synchronizacji zmiany sa wysylane do chmury i odbierane na innych urzadzeniach bez Twojego udzialu.

### Jak to dziala

1. **Wysylanie w trakcie gry** - zmiany sa zbierane i wysylane razem co **5 minut**. Kazda zmiana trafia do chmury tylko raz, wiec synchronizacja nie obciaza serwera.
2. **Wysylanie przy przelaczaniu** - gdy ukrywasz karte klienta (przelaczasz okno, blokujesz telefon) albo zamykasz strone, oczekujace zmiany sa wysylane natychmiast. Urzadzenie, na ktore sie przesiadasz, ma juz wszystko.
3. **Podglad na drugim urzadzeniu** - gdy klient jest otwarty i widoczny na innym Twoim urzadzeniu, zmiany sa wysylane co kilkanascie sekund, zeby bylo je widac na biezaco (np. postepy na telefonie w trakcie gry na komputerze).
4. **Odbieranie zmian** - widoczna karta klienta odbiera zmiany z innych urzadzen na biezaco i stosuje je bez odswiezania strony. Ukryta karta nie nasluchuje; po powrocie do niej od razu pobiera to, co sie zmienilo.

### Wiele kart przegladarki

Mozesz miec otwartych kilka kart klienta jednoczesnie - synchronizacja dziala tylko w jednej z nich (pozostale przejmuja te role automatycznie po jej zamknieciu), wiec dane nie sa wysylane wielokrotnie.

### Pierwsze uruchomienie na urzadzeniu

Przy pierwszym uruchomieniu nowej synchronizacji urzadzenie pobiera dane zapisane przez poprzednia wersje i dopiero potem wysyla swoje. Ustawienia, ktore juz sa w chmurze, maja pierwszenstwo przed domyslnymi ustawieniami nowego urzadzenia; dane, ktore ma tylko to urzadzenie, sa dodawane.

Zanim nowa synchronizacja cokolwiek zmieni, urzadzenie zapisuje u siebie pelna kopie danych. Znajdziesz ja w zakladce kopii zapasowej: mozesz ja przywrocic ("Przywroc stan sprzed aktualizacji") albo pobrac jako plik.

### Wlaczanie automatycznej synchronizacji

1. Przejdz do **Ustawienia > Firebase**
2. Zaloguj sie na konto
3. Zaznacz "Automatyczna synchronizacja"

### Reczne wysylanie

Przycisk **"Wyslij do chmury"** wysyla oczekujace zmiany od razu, bez czekania na kolejna synchronizacje.

---

## Szyfrowanie

Mozesz zabezpieczyc swoje dane w chmurze szyfrujac je haslem.

### Jak wlaczyc szyfrowanie

1. Przejdz do **Ustawienia > Firebase**
2. Zaznacz "Szyfrowanie"
3. Wpisz haslo szyfrowania

### Wazne informacje

- Dane sa szyfrowane algorytmem **AES-256-GCM** - jest to silne szyfrowanie stosowane w bankach i wojsku.
- **Haslo nie jest nigdzie zapisywane** na serwerze. Jesli je zapomnisz, nie ma mozliwosci odzyskania zaszyfrowanych danych.
- Haslo jest pamietane lokalnie tylko do zamkniecia karty przegladarki - po ponownym otwarciu klienta trzeba je podac ponownie.
- Musisz uzyc **tego samego hasla** na wszystkich urzadzeniach, ktore chca odczytac zaszyfrowane dane. Klient weryfikuje haslo przed wyslaniem danych - urzadzenie z innym haslem dostanie blad zamiast po cichu nadpisac dane niemozliwym do odczytania wpisem.
- Jesli inne urzadzenie odbierze zaszyfrowane dane bez podanego hasla, zostaniesz poproszony o wprowadzenie hasla. Dane zostana odszyfrowane po jego podaniu.
- Aby zmienic haslo: wylacz szyfrowanie (dane zostana zapisane w chmurze bez szyfrowania), a nastepnie wlacz je ponownie z nowym haslem.

---

## Laczenie zmian z wielu urzadzen

Nie ma konfliktow do rozwiazywania - zmiany z roznych urzadzen sa laczone automatycznie, osobno dla kazdego elementu (kazdego aliasu, triggera, lokacji, wpisu wiedzy itd.):

- **Ustawienia, aliasy, triggery, bindy, notatki** - wygrywa najnowsza zmiana danego elementu. Edycja aliasu na telefonie nie nadpisuje innego aliasu zmienionego na komputerze.
- **Odwiedzone lokacje, ticki wiedzy, karmienia, dostawy** - dane z obu urzadzen sa sumowane, nic nie ginie.
- **Licznik zabitych, licznik postepow** - liczby z urzadzen sa dodawane.
- **Postepy w bibliotekach i ksiazkach** - postep tylko rosnie.
- **Awans poziomu wiedzy lub zwierzecia** - liczy sie pierwsza obserwacja; urzadzenie, ktore zobaczylo nowy poziom pozniej, nie przesuwa momentu awansu (ticki i karmienia od awansu licza sie poprawnie).

---

## Zarzadzanie urzadzeniami

Przejdz do **Ustawienia > Zarzadzanie urzadzeniami** aby zarzadzac swoimi urzadzeniami.

### Informacje o urzadzeniu

Kazde urzadzenie jest automatycznie identyfikowane na podstawie przegladarki i systemu operacyjnego (np. "Chrome on Windows"). Mozesz ustawic wlasna nazwe urzadzenia, aby latwiej je rozpoznac.

### Zmiana nazwy urzadzenia

1. Przejdz do **Ustawienia > Zarzadzanie urzadzeniami**
2. Kliknij przycisk edycji obok nazwy urzadzenia
3. Wpisz nowa nazwe
4. Kliknij "Zapisz"

### Rejestracja urzadzenia w chmurze

Po zalogowaniu, Twoje urzadzenie jest automatycznie rejestrowane w chmurze. Dzieki temu inne urzadzenia moga zobaczyc liste Twoich urzadzen i kopiowac z nich ustawienia.

### Kopiowanie ustawien z innego urzadzenia

Jesli chcesz przeniesc ustawienia z jednego urzadzenia na drugie:

1. Zaloguj sie na to samo konto na obu urzadzeniach
2. Na urzadzeniu docelowym przejdz do **Zarzadzanie urzadzeniami**
3. W sekcji "Urzadzenia w chmurze" znajdz urzadzenie zrodlowe
4. Kliknij "Kopiuj ustawienia"

### Importowane urzadzenia

Jesli zaimportujesz ustawienia z pliku (np. backup), pojawia sie one w sekcji "Importowane urzadzenia". Mozesz:
- **Skopiowac ustawienia** z zaimportowanego urzadzenia na biezace
- **Usunac** zaimportowane urzadzenie z listy

---

## Grupy synchronizacji

Grupy synchronizacji pozwalaja na synchronizacje ustawien powiazanych z urzadzeniem (uklad interfejsu, przyciski) miedzy wybranymi urzadzeniami.

### Po co sa grupy?

Domyslnie ustawienia interfejsu i przyciskow **nie sa automatycznie stosowane** na innych urzadzeniach, poniewaz rozne urzadzenia moga miec rozne rozmiary ekranow. Jesli jednak masz np. dwa komputery z podobnymi monitorami i chcesz miec identyczny uklad na obu, mozesz polaczyc je w grupe.

### Tworzenie grupy

1. Przejdz do **Zarzadzanie urzadzeniami**
2. W sekcji "Grupa synchronizacji" wpisz nazwe grupy
3. Kliknij "Utworz grupe"

Grupa zostanie utworzona i biezace urzadzenie automatycznie do niej dolaczy.

### Dolaczanie do grupy

Aby drugie urzadzenie dolaczilo do istniejace grupy:

1. Na drugim urzadzeniu przejdz do **Zarzadzanie urzadzeniami**
2. W sekcji "Grupy w chmurze" znajdz swoja grupe
3. Kliknij "Dolacz"

Po dolaczeniu ustawienia grupy zostana zastosowane na tym urzadzeniu.

### Synchronizacja w grupie

Gdy urzadzenia sa w tej samej grupie:
- Zmiany w ukladzie interfejsu i przyciskach sa synchronizowane miedzy urzadzeniami w grupie automatycznie, razem z pozostalymi kategoriami (zakladka **Synchronizacja konfiguracji**)
- Wygrywa najnowszy uklad sposrod urzadzen grupy

### Opuszczanie grupy

Kliknij "Opusc grupe" aby odlaczyc urzadzenie od grupy. Twoje lokalne ustawienia pozostana bez zmian, ale nie beda juz synchronizowane z innymi urzadzeniami w grupie. Jesli jestes ostatnim urzadzeniem w grupie, grupa zostanie automatycznie usunieta.

---

## Usuwanie danych z chmury

Jesli chcesz usunac wszystkie swoje dane z chmury:

1. Przejdz do **Ustawienia > Firebase**
2. Przewin do sekcji "Dane w chmurze"
3. Kliknij "Usun wszystkie dane"
4. Potwierdz usuniecie

**Uwaga**: Ta operacja jest nieodwracalna i usuwa z chmury takze dane powiazane z pozostalymi urzadzeniami (uklady interfejsu, przyciski). Lokalne dane na Twoim urzadzeniu nie zostana usuniete - zaraz potem to urzadzenie wysle je ponownie, wiec chmura zaczyna od jego danych. Pozostale urzadzenia przy najblizszej synchronizacji przejmuja dane z chmury (czyli z tego urzadzenia); dodaja do nich tylko to, czego w chmurze nie ma, np. lokacje odwiedzone tylko na nich.

---

## Przejecie sesji na innym urzadzeniu

Gdy zalogujesz sie postacia na drugim urzadzeniu, gra rozlacza pierwsze. Jesli na obu jestes zalogowany do tego samego konta Firebase, nowe urzadzenie od razu ustawi mape w lokacji, w ktorej postac zostala na poprzednim - bez czekania na synchronizacje.

- Lokacje zapisuje urzadzenie, ktore **widzi** koniec swojej sesji: przejecie przez inne urzadzenie albo rozlaczenie przez ciebie. Po rozlaczeniu mozna wrocic na innym urzadzeniu do 30 minut pozniej.
- Nic nie jest zapisywane, gdy karta byla w tle (np. telefon w kieszeni) albo mapa zgubila pozycje - klient nie wie wtedy na pewno, gdzie jest postac, wiec lepiej nie zgadywac.
- Lokacja nie zostanie ustawiona, jesli na nowym urzadzeniu zdazysz sie juz ruszyc.

## Rozwiazywanie problemow

### Nie moge sie zalogowac

- **"Popup zostal zablokowany"** - Odblokuj wyskakujace okna (popupy) dla strony klienta w ustawieniach przegladarki.
- **"Nieprawidlowe haslo"** - Sprawdz, czy wpisujesz poprawne haslo. Mozesz je zresetowac przez email.
- **"Ten adres email jest juz uzywany"** - Masz juz konto. Uzyj logowania zamiast rejestracji.
- **"Blad polaczenia z serwerem"** - Sprawdz polaczenie internetowe i sprobuj ponownie.

### Synchronizacja nie dziala

- Sprawdz, czy jestes zalogowany
- Sprawdz, czy automatyczna synchronizacja jest wlaczona
- Sprawdz polaczenie internetowe

### Nie moge odszyfrowac danych

- Upewnij sie, ze wpisujesz **dokladnie to samo haslo**, ktore zostalo uzyte do szyfrowania
- Haslo jest wrazliwe na wielkosc liter
- Jesli zapomniales hasla, nie ma mozliwosci odzyskania zaszyfrowanych danych - musisz wyslac dane ponownie z urzadzenia, na ktorym sa zapisane lokalnie

### Dane nie pojawiaja sie na drugim urzadzeniu

- Ukryj karte klienta na pierwszym urzadzeniu (albo poczekaj do 5 minut) - zmiany wysylaja sie przy ukryciu karty
- Sprawdz, czy na obu urzadzeniach jestes zalogowany na to samo konto
- Dla ustawien interfejsu i przyciskow - sprawdz, czy urzadzenia sa w tej samej [grupie synchronizacji](#grupy-synchronizacji)
- Sprobuj wyslac zmiany recznie przyciskiem "Wyslij do chmury"
- Synchronizacja dziala w jednej karcie przegladarki - jesli masz kilka kart, zmiany wysyla pierwsza otwarta
