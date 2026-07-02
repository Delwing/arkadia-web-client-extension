# Synchronizacja Firebase

Rozszerzenie umozliwia synchronizacje ustawien miedzy urzadzeniami za pomoca Firebase. Dzieki temu mozesz korzystac z tych samych ustawien na roznych komputerach, telefonach i przegladarkach.

## Spis tresci

- [Logowanie](#logowanie)
- [Synchronizowane kategorie](#synchronizowane-kategorie)
- [Automatyczna synchronizacja](#automatyczna-synchronizacja)
- [Reczna synchronizacja](#reczna-synchronizacja)
- [Szyfrowanie](#szyfrowanie)
- [Konflikty](#konflikty)
- [Zarzadzanie urzadzeniami](#zarzadzanie-urzadzeniami)
- [Grupy synchronizacji](#grupy-synchronizacji)
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

Mozesz wybrac, ktore kategorie danych maja byc synchronizowane. Kazda kategorie mozna wlaczyc lub wylaczyc niezaleznie.

| Kategoria | Opis |
|-----------|------|
| **Ustawienia interfejsu** | Kolory, czcionki, motyw, uklad okien |
| **Bindy klawiszy** | Przypisania klawiszy do komend |
| **Skroty** | Zapisane lokacje na mapie |
| **Ustawienia postaci** | Ustawienia rozgrywki (profesja, staz, itp.) |
| **Triggery** | Triggery reagujace na tekst z gry |
| **Aliasy** | Aliasy komend |
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

### Kategorie powiazane z urzadzeniem

Dwie kategorie sa traktowane specjalnie - **Ustawienia interfejsu** i **Przyciski**. Te ustawienia sa powiazane z konkretnym urzadzeniem, poniewaz rozne urzadzenia moga miec rozne rozmiary ekranu i ukady. Nie sa automatycznie stosowane na innych urzadzeniach, chyba ze naleza do tej samej [grupy synchronizacji](#grupy-synchronizacji).

Kategoria **Ustawienia interfejsu** obejmuje takze uklad okien, trasy podrozy (trip planner) i aktywna mape klawiszy.

---

## Automatyczna synchronizacja

Po wlaczeniu automatycznej synchronizacji, zmiany w ustawieniach sa automatycznie wysylane do chmury.

### Jak to dziala

1. **Szybka synchronizacja** - Wiekszossc kategorii (triggery, aliasy, bindy, skroty, itp.) jest synchronizowana z opoznieniem **30 sekund** od ostatniej zmiany. Dzieki temu wiele szybkich zmian jest laczonych w jedna operacje.

2. **Wolna synchronizacja** - Kategorie, ktore zmieniaja sie czesto podczas gry (odwiedzone lokacje, licznik zabitych), sa synchronizowane z opoznieniem **10 minut**. Zapobiega to nadmiernemu obciazeniu serwera.

3. **Synchronizacja przy zamykaniu** - Przy zamykaniu strony wszystkie oczekujace zmiany sa wysylane natychmiast. Przy samym ukryciu zakladki (np. przelaczenie okna) wysylane sa tylko zmiany z "wolnych" kategorii.

4. **Synchronizacja przy starcie** - Po uruchomieniu klienta stan lokalny jest porownywany z chmura: zmiany, ktore nie zdazyly sie wyslac w poprzedniej sesji, sa wysylane, a zmiany wykonane w miedzyczasie na innym urzadzeniu - pobierane i stosowane.

### Odbieranie zmian z chmury

Gdy inne urzadzenie wysle zmiany do chmury, Twoje urzadzenie odbiera je **w czasie rzeczywistym** dzieki nasluchiwaniu Firebase. Zmiany sa automatycznie stosowane lokalnie bez potrzeby odswiezania strony.

### Wiele kart przegladarki

Mozesz miec otwartych kilka kart klienta jednoczesnie - wysylaniem zmian zajmuje sie tylko jedna z nich (pozostale przejmuja te role automatycznie po jej zamknieciu), wiec dane nie sa wysylane wielokrotnie.

### Wlaczanie automatycznej synchronizacji

1. Przejdz do **Ustawienia > Firebase**
2. Zaloguj sie na konto
3. Zaznacz "Automatyczna synchronizacja"
4. Wybierz kategorie, ktore chcesz synchronizowac

---

## Reczna synchronizacja

Jesli nie chcesz korzystac z automatycznej synchronizacji, mozesz synchronizowac dane recznie.

### Wysylanie do chmury

Kliknij przycisk **"Synchronizuj teraz"** w zakladce Firebase. Wyslane zostana wszystkie wlaczone kategorie.

### Pobieranie z chmury

Mozesz pobrac konkretne kategorie z chmury. W sekcji metadanych chmury przy kazdej kategorii znajdziesz informacje o tym, czy dane istnieja w chmurze, kiedy zostaly ostatnio zsynchronizowane i z jakiego urzadzenia.

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

## Konflikty

Konflikt wystepuje, gdy dane zostaly zmienione zarowno lokalnie, jak i w chmurze od ostatniej synchronizacji (np. edytowales ustawienia na dwoch urzadzeniach jednoczesnie).

### Rozwiazywanie konfliktow

Gdy wykryty zostanie konflikt, pojawi sie okno z lista kategorii, w ktorych wystepuja roznice (wraz z podgladem roznic). Jesli okno ustawien jest zamkniete, w rogu ekranu pojawi sie powiadomienie - konflikt czeka na rozwiazanie do momentu otwarcia zakladki synchronizacji.

Masz trzy opcje:

| Opcja | Dzialanie |
|-------|-----------|
| **Zachowaj lokalne** | Twoje lokalne dane zostana wyslane do chmury, nadpisujac dane z innego urzadzenia |
| **Uzyj chmury** | Dane z chmury zostana zastosowane lokalnie, zastepujac Twoje zmiany |
| **Anuluj** | Synchronizacja zostanie przerwana, nic sie nie zmieni |

### Automatyczne laczenie danych

Dla czesci kategorii wybor "lokalne czy chmura" nie powoduje utraty danych z drugiej strony:

- **Odwiedzone lokacje, licznik zabitych, wiedza** - dane sa laczone (suma zbiorow); niezaleznie od wyboru nic nie ginie.
- **Depozyty, pojemniki, liczniki postepow, ustawienia postaci, edycje bazy postaci** - dane sa laczone per postac: wybrana strona wygrywa tylko dla postaci wystepujacych po obu stronach, a postacie znane tylko jednej stronie sa zawsze zachowywane. Dzieki temu gra na roznych postaciach na roznych urzadzeniach nie kasuje danych zadnej z nich.

### Unikanie konfliktow

- Korzystaj z automatycznej synchronizacji - minimalizuje ryzyko konfliktow
- Poczekaj, az synchronizacja sie zakonczy, zanim zaczniesz edytowac ustawienia na innym urzadzeniu
- Jesli czesto przelaczasz sie miedzy urzadzeniami, ustaw krotszy czas synchronizacji

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
- Konflikty sa wykrywane i rozwiazywane tak samo jak dla zwyklych kategorii
- Reczna synchronizacja odbywa sie przyciskami "Wyslij do chmury" / "Pobierz z chmury" w zakladce Synchronizacja konfiguracji

### Opuszczanie grupy

Kliknij "Opusc grupe" aby odlaczyc urzadzenie od grupy. Twoje lokalne ustawienia pozostana bez zmian, ale nie beda juz synchronizowane z innymi urzadzeniami w grupie. Jesli jestes ostatnim urzadzeniem w grupie, grupa zostanie automatycznie usunieta.

---

## Usuwanie danych z chmury

Jesli chcesz usunac wszystkie swoje dane z chmury:

1. Przejdz do **Ustawienia > Firebase**
2. Przewin do sekcji "Dane w chmurze"
3. Kliknij "Usun wszystkie dane"
4. Potwierdz usuniecie

**Uwaga**: Ta operacja jest nieodwracalna i usuwa z chmury takze dane powiazane z pozostalymi urzadzeniami (uklady interfejsu, przyciski). Lokalne dane na Twoim urzadzeniu nie zostana usuniete.

---

## Rozwiazywanie problemow

### Nie moge sie zalogowac

- **"Popup zostal zablokowany"** - Odblokuj wyskakujace okna (popupy) dla strony klienta w ustawieniach przegladarki.
- **"Nieprawidlowe haslo"** - Sprawdz, czy wpisujesz poprawne haslo. Mozesz je zresetowac przez email.
- **"Ten adres email jest juz uzywany"** - Masz juz konto. Uzyj logowania zamiast rejestracji.
- **"Blad polaczenia z serwerem"** - Sprawdz polaczenie internetowe i sprobuj ponownie.

### Synchronizacja nie dziala

- Sprawdz, czy jestes zalogowany
- Sprawdz, czy automatyczna synchronizacja jest wlaczona
- Sprawdz, czy wybrane kategorie sa zaznaczone do synchronizacji
- Sprawdz polaczenie internetowe

### Nie moge odszyfrowac danych

- Upewnij sie, ze wpisujesz **dokladnie to samo haslo**, ktore zostalo uzyte do szyfrowania
- Haslo jest wrazliwe na wielkosc liter
- Jesli zapomniales hasla, nie ma mozliwosci odzyskania zaszyfrowanych danych - musisz wyslac dane ponownie z urzadzenia, na ktorym sa zapisane lokalnie

### Dane nie pojawiaja sie na drugim urzadzeniu

- Poczekaj do 30 sekund (szybka synchronizacja) lub 10 minut (wolna synchronizacja)
- Sprawdz, czy na obu urzadzeniach jestes zalogowany na to samo konto
- Sprawdz, czy kategoria jest wlaczona na obu urzadzeniach
- Dla ustawien interfejsu i przyciskow - sprawdz, czy urzadzenia sa w tej samej [grupie synchronizacji](#grupy-synchronizacji)
- Sprobuj recznie zsynchronizowac przyciskiem "Synchronizuj teraz"

### Widzialem komunikat o konflikcie, ale go zignorowalem

Jesli zamkniesz okno konfliktu przyciskiem "Anuluj", synchronizacja zostanie wstrzymana. Przy nastepnej probie synchronizacji konflikt pojawi sie ponownie. Aby go rozwiazac, musisz wybrac "Zachowaj lokalne" lub "Uzyj chmury".
