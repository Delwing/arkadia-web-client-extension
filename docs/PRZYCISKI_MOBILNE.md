# Przyciski mobilne

Przyciski mobilne to panel na ekranie gry do grania palcem: kierunki, atak, listy celów, dowolne komendy. Panel włączasz w **☰ → Ustawienia → Interfejs → Przyciski mobilne**, sekcja **Wyświetlanie**: **Pokaż przyciski na ekranie**. Tam też jest **Wibracje przycisków mobilnych** (krótka wibracja przy dotknięciu).

## Na ekranie

- **Przesuwanie** - przytrzymaj panel około sekundy, aż da się go złapać, i przeciągnij. Pozycja jest zapamiętywana osobno dla telefonu trzymanego pionowo i poziomo.
- **Zablokuj** w edytorze wyłącza przesuwanie, żeby panel nie ruszył się przy dłuższym przytrzymaniu. **Resetuj pozycje** wraca do pozycji domyślnej.
- **Przytrzymanie** - przycisk może mieć drugą akcję: krótkie dotknięcie robi jedno, przytrzymanie (pół sekundy) drugie. Przy odblokowanym panelu dłuższe przytrzymanie zaczyna przesuwanie, więc przyciski z przytrzymaniem najlepiej działają przy zablokowanym.
- **Kierunki podświetlają się**, gdy z lokacji jest wyjście w tę stronę (kolor **Aktywny** ze stylu przycisku).
- **Wyjście specjalne** pokazuje i wysyła wyjście specjalne lokacji o wybranym numerze (np. `wejscie do chaty`).
- **Listy** (`/z`, `/za`, `/w`, `/prze`) rozwijają rząd skrótów obiektów z lokacji - dotknięcie wysyła np. `/z 2`. **Lista idz** daje tempa marszu (`idz niespiesznie` … `idz szybkim biegiem`).
- **Przełącz przyciski** zwija panel do samego przycisku przełączania i rozwija go z powrotem.

## Solo, Drużyna, Prowadzący

Panel ma trzy zestawy, a klient sam wybiera, który pokazać: **Solo**, gdy grasz sam, **Drużyna**, gdy jesteś w drużynie, **Prowadzący**, gdy ją prowadzisz.

![Prowadzący dziedziczy z Drużyny, Drużyna z Solo](img/przyciski/dziedziczenie.svg)

Zestawy nie są trzema osobnymi kopiami:

- **Solo to baza** - ma wszystkie przyciski.
- **Drużyna dziedziczy z Solo, Prowadzący z Drużyny.** Dopóki czegoś nie zmienisz, wyglądają tak samo jak Solo, a zmiana w Solo od razu pojawia się w pozostałych.
- **Nadpisanie** - zmiana przycisku w Drużynie albo u Prowadzącego tworzy jego własną wersję w tym trybie (cały przycisk: akcja, etykieta, styl). Reszta dalej dziedziczy. **Przywróć** usuwa nadpisanie.
- **Układ siatki i tło panelu** też są dziedziczone. Tryb może mieć własny układ (np. dodatkową kolumnę dla Prowadzącego), a przyciski w nim nadal biorą treść z trybu nadrzędnego.
- **Rozmiar przycisku i Odstęp** są wspólne dla wszystkich trybów.

## Edytor

Edytor jest w **☰ → Ustawienia → Interfejs → Przyciski mobilne**, sekcja **Układ przycisków**. Zmiany widać od razu na podglądzie, a do gry trafiają po **Zapisz**.

U góry są zakładki **Solo / Drużyna / Prowadzący** - liczba przy zakładce mówi, ile przycisków tryb ma własnych. Pod nimi łańcuch dziedziczenia (np. „Prowadzący ← Drużyna ← Solo”) i podsumowanie, np. „2 własne · układ z Solo”.

Na podglądzie:

- **przygaszony** przycisk jest dziedziczony z trybu nadrzędnego,
- **pomarańczowa kropka** oznacza przycisk własny w tym trybie,
- **puste pole** z przerywaną ramką to miejsce na nowy przycisk.

Nad podglądem są cztery narzędzia.

### Edytuj

Kliknij przycisk, żeby go ustawić:

- **Skąd jest** - karta mówi, czy to przycisk bazowy, dziedziczony (z przyciskiem **Edytuj w Solo**), czy własny w tym trybie (z przyciskiem **Przywróć**). Edycja dziedziczonego przycisku tworzy nadpisanie i klient o tym informuje.
- **Makro** - co przycisk robi (lista niżej), **Etykieta** i ustawienia makra (komenda, kierunek, numer wroga…).
- **Styl** - wybór stylu kolorów. **+ Nowy styl** daje temu jednemu przyciskowi kopię stylu do przekolorowania. **Zmień kolory stylu** pozwala zmienić kolory stylu od razu stąd - z ostrzeżeniem, jeśli styl ma też inne przyciski.
- **Przytrzymanie (hold)** - druga akcja po przytrzymaniu.

Wybranie makra dla pustego pola tworzy nowy przycisk. Makro **Puste** zamienia przycisk w puste pole.

### Zaznacz

Zmiany na wielu przyciskach naraz:

- **Zaznaczanie** - klikaj przyciski na podglądzie albo wybierz grupę w **Zaznacz szybko**: **Wszystkie**, **Wszystkie kierunki** (kierunki i wyjście specjalne) albo wszystkie przyciski danego stylu. Na komputerze **Ctrl+klik** lub **Shift+klik** zaznacza też z pozostałych narzędzi.
- **Nadaj styl** - jeden styl dla wszystkich zaznaczonych.
- **Nadpisz tutaj** - kopiuje zaznaczone dziedziczone przyciski do tego trybu bez zmian, żeby późniejsze zmiany w Solo już do nich nie docierały.
- **Przywróć dziedziczone** - usuwa nadpisania zaznaczonych.
- **Opróżnij pola** - zamienia zaznaczone w puste pola.

W Drużynie i u Prowadzącego zmiana stylu dziedziczonych przycisków nadpisuje je tylko w tym trybie. Żeby zmienić wszędzie, zrób to w Solo.

### Style

Lista wszystkich stylów z liczbą przycisków w bieżącym trybie. Kliknij styl, żeby go rozwinąć:

- **Nazwa stylu**, kolory **Tło**, **Tekst** i **Aktywny (kierunek dostępny)**,
- **kliknięcie przycisku na podglądzie nadaje mu ten styl** (przyciski w tym stylu są obwiedzione),
- **Zaznacz przyciski w tym stylu** przechodzi do Zaznacz z tymi przyciskami,
- **Kopiuj styl** i **kosz** - usunięcie przenosi przyciski usuniętego stylu na pierwszy styl z listy. Ostatniego stylu nie da się usunąć.

**+ Nowy styl** pod listą dodaje styl, który od razu można nadawać klikaniem.

### Układ

- **Z Drużyny / Z Solo** albo **Własny** - czy tryb dziedziczy układ siatki, czy ma swój. Pierwsza zmiana układu w trybie dziedziczącym sama tworzy własny.
- **+ i −** na każdej krawędzi podglądu dodają i usuwają wiersz lub kolumnę.
- **Zamiana miejscami** - kliknij dwa pola po kolei.
- **Poza układem** - przyciski, które tryb ma, ale nie są na siatce. Kliknięcie wstawia przycisk w pierwsze puste pole.
- **Tło panelu** - kolor i krycie, dziedziczone jak układ. ↺ wraca do tła z trybu nadrzędnego.

Pod narzędziami są **Rozmiar przycisku** i **Odstęp**, wspólne dla wszystkich trybów. Na dole **Domyślne** (w Solo) przywraca domyślny zestaw, a **Dziedzicz wszystko** (w Drużynie i u Prowadzącego) usuwa wszystkie zmiany tego trybu.

## Style

Przyciski nie mają własnych kolorów - każdy wskazuje styl, a styl ma trzy kolory: **Tło**, **Tekst** i **Aktywny** (używany przez kierunki i wyjście specjalne, gdy wyjście jest dostępne). Style są wspólne dla wszystkich trybów, więc zmiana koloru stylu zmienia każdy przycisk, który go używa, w każdym trybie.

Domyślnie są dwa style: **Podstawowy** (górne rzędy) i **Kierunki** (krzyżak i wyjście specjalne). Kolor tylko jednego przycisku zmienisz, dając mu własny styl przez **+ Nowy styl**.

## Akcje przycisków

| Makro | Co robi |
|-------|---------|
| **Wyślij komendę** | Wysyła komendę; kilka linii to kilka komend po kolei |
| **Kierunek** | Idzie w wybranym kierunku (albo wysyła podaną komendę) |
| **Wyjście specjalne** | Wysyła wyjście specjalne lokacji o wybranym numerze |
| **Zerknij / zatrzymaj pojazd** | Rozgląda się po lokacji, a w czasie jazdy zatrzymuje wóz |
| **Bind funkcyjny** | To samo co klawisz `]`: akcja kontekstowa (zbieranie łupów, powtarzanie poleceń) |
| **Wesprzyj prowadzącego** | Jak bind Wesprzyj |
| **Tryb ruchu** | Przełącza: zwykły, przemknij, przemknij z drużyną (ostatni tylko dla prowadzącego) |
| **Atakuj wroga**, **Zablokuj wroga** | Atakuje lub blokuje wroga z wybranego slotu |
| **Atakuj wszystkich wrogów** | Atakuje wszystkich wrogów |
| **Lista /z**, **/za**, **/w**, **/prze** | Rozwija skróty obiektów z lokacji dla tej komendy |
| **Lista idz** | Rozwija tempa marszu |
| **Przełącz przyciski** | Zwija i rozwija panel |
| **Wycisz dźwięki**, **Włącz dźwięki** | Wycisza lub włącza dźwięki klienta |
| **Złożone (wiele akcji)** | Wykonuje po kolei kilka kroków, każdy z własnym makrem |
| **Puste** | Puste pole |

Wtyczki mogą dodawać własne makra - pojawiają się na liście pod nazwą wtyczki. Jeśli wtyczka nie jest załadowana, edytor ostrzega, że jej makro nie będzie działać.

## Przykłady

- **Wszystkie kierunki w jednym kolorze** - w **Style** rozwiń **Kierunki** i zmień **Tło**. Zmieni się w każdym trybie.
- **Inny przycisk tylko w drużynie** - zakładka **Drużyna**, **Edytuj**, kliknij przycisk i zmień makro lub komendę. W Solo zostaje po staremu.
- **Dodatkowa kolumna dla prowadzącego** - zakładka **Prowadzący**, **Układ**, **+** z prawej, potem ustaw nowe pola w **Edytuj**.
- **Czerwone przyciski ataku** - **Zaznacz**, kliknij przyciski ataku, **Nadaj styl**; albo w **Style** dodaj nowy styl, ustaw kolor i klikaj przyciski na podglądzie.
