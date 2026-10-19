# Skrypty

Aliasy, triggery i skrypty tworzysz w jednym oknie: **Menu → Skrypty**. Nie trzeba pisać kodu — wystarczy wzorzec i lista akcji.

## Okno Skrypty

![Okno Skrypty z grupą Walka](img/automatyzacje/lista.png)

Okno ma trzy kolumny:

- **Po lewej** — filtr rodzaju (*Wszystko*, *Aliasy*, *Triggery*, *Skrypty*) z liczbą elementów, a pod nim **Biblioteka** gotowych aliasów, triggerów i skryptów. **Wyłączone** pokazuje też to, co wyłączyłeś, a **Tylko tej postaci** chowa to, co na zalogowanej postaci nie działa. Na dole **Importuj** i **Eksportuj wszystko**
- **Na środku** — lista w grupach, z polem **Szukaj** (po wzorcu, komendzie albo nazwie). Przycisk **+** dodaje alias, trigger, skrypt albo grupę; ikona folderu obok tworzy nową grupę
- **Po prawej** — edytor zaznaczonego elementu. **Zapisz** (albo `Ctrl+Enter`) zapisuje zmiany, **Cofnij zmiany** wraca do zapisanej wersji

Element ze zmianami, których jeszcze nie zapisałeś, ma przy nazwie pomarańczową kropkę. Przełącznik przy każdym wierszu włącza go i wyłącza bez otwierania edytora, a menu **…** pozwala go zduplikować, przenieść do innej grupy albo usunąć.

## Biblioteka

**Biblioteka** w lewej kolumnie zbiera gotowe aliasy, triggery i skrypty na to, o co gracze pytają najczęściej, np.:

- **Dźwięk na nieodebraną pocztę** — dźwięk, gdy na poczcie czeka list do odebrania
- **Dźwięk na każdy atak** — dźwięk, gdy ktokolwiek cię zaatakuje, nie tylko ktoś z wrogiej gildii
- **Powiadomienie na telefon przy niskim życiu** — gdy kondycja spadnie do progu *Alarmu niskiego zdrowia*. Telefon parujesz w *Ustawieniach interfejsu → Dźwięk i powiadomienia*
- **Przyjazd transportu na głos** — czyta nazwę pojazdu, który podjechał, gdy czekasz na przystanku
- **Rozrywanie kokonów** — alias `kok 1-5` wysyła `rozerwij 1. kokon`, `rozerwij 2. kokon`... aż do 5

**Dodaj** wstawia wybraną pozycję na twoją listę jako zwykły element w grupie (np. *Dźwięki*), który możesz potem zmienić, wyłączyć albo usunąć. Dodana ma znaczek **Dodano**, a **Pokaż** otwiera ją w edytorze.

## Grupy

Grupa zbiera powiązane elementy — np. wszystko, czego używasz w walce. Jej przełącznik włącza i wyłącza całą grupę naraz.

- Elementy przenosisz między grupami, przeciągając je, albo z menu **…** przy elemencie
- Menu **…** przy grupie dodaje do niej nowy alias, trigger lub skrypt, zmienia jej nazwę i **eksportuje grupę** do pliku `.json`. Pojedynczy alias, trigger lub skrypt eksportujesz z jego menu **…** (albo prawym przyciskiem na liście) — razem ze skryptami, które uruchamia
- Taki plik ktoś inny wczyta przez **Importuj → Plik ze Skryptów (.json)**
- Akcja **Włącz / wyłącz grupę** pozwala przełączać grupę z innego aliasu lub triggera — np. wejście w walkę włącza grupę "Walka", a jej koniec ją wyłącza

> Paczkę od kogoś obcego przejrzyj przed importem — zwłaszcza skrypty, bo mają dostęp do całego API klienta.

## Aliasy

Alias zamienia to, co wpisujesz, na komendę (albo kilka akcji). Dodajesz go przez **+ → Alias**.

![Edytor aliasu](img/automatyzacje/alias.png)

1. **Kiedy wpiszesz** — wzorzec (wyrażenie regularne). Nawiasy łapią fragmenty: we wzorcu `^zab (.+)$` część po `zab ` trafia do `$1`. Grupę możesz też nazwać: z `^zab (?<cel>.+)$` w akcji używasz `{cel}`. Każda grupa ma w polu swój kolor i numer nad nawiasem — ten sam kolor ma na przyciskach wstawiania, w przykładowej komendzie i przy wyniku testu. Nazwana grupa dalej ma numer: `{cel}` i `$1` znaczą to samo. Przycisk z klamrami obok wzorca wstawia gotowe kawałki: **Słowo**, **Dowolny tekst**, **Liczba**, **Zakres** (dla `$i`), **Imię**, **Krótki opis (3 słowa)** i inne — zaznaczony fragment wzorca zastępuje grupą. Wpisaną przykładową komendę, która jeszcze nie pasuje, zamienisz we wzorzec przyciskiem **jako wzorzec** W polu z kolbą wpisz przykładową komendę, a od razu zobaczysz, czy pasuje i co trafi do `$1`
2. **Co zrobić** — lista akcji. Najczęściej **Komenda**, np. `zabij $1`. Pod listą jest ściągawka: `$1`, `$2` to grupy ze wzorca, `@1`, `@A`, `@@` to obiekty z lokacji, `$i` powtarza komendę dla każdej liczby z zakresu, który wpiszesz (np. `kok 1-7`), a `;` rozdziela kilka komend w jednym polu. Na dole widać, co alias wyśle dla przykładowej komendy
3. **Dla kogo** — wszystkie postacie albo tylko wybrane. W **Inaczej dla postaci** możesz podać inną komendę dla konkretnej postaci

Aliasy z innych klientów wczytasz przez **Importuj → Aliasy z klienta Arkadii** albo **Aliasy z Blowtorch**.

## Triggery

Trigger reaguje na to, co wypisze gra. Dodajesz go przez **+ → Trigger**.

![Edytor wyzwalacza tekstu gry](img/automatyzacje/wyzwalacz.png)

1. **Kiedy** — przełącznik **Tekst gry** / **Zdarzenie**. Dla tekstu podajesz wzorzec; przyciski `i`, `g`, `m` po prawej to flagi (bez rozróżniania wielkości liter, globalnie, wieloliniowo). Grupy w nawiasach są pokolorowane jak w aliasach, a przycisk z klamrami wstawia gotowe kawałki, także **Początek linii**, **Koniec linii** i **Kropka na końcu**. Najprościej: wklej linię z gry do testu, kliknij **jako wzorzec**, zaznacz we wzorcu np. imię i wstaw w jego miejsce **Słowo** albo **Tekst do...**. `$3` albo `{nazwa}`, których wzorzec nie ma, edytor podświetla na czerwono pod akcjami
2. **Linia do testu** — wpisz albo wybierz **z ostatnich linii** gry tekst, a zobaczysz, czy wzorzec pasuje, co jest w `$1` i jak linia będzie wyglądać po akcjach (**Wynik dla linii z testu**)
3. **Tylko w** — zawęża trigger do wybranych rodzajów wiadomości: walki, rozmów, opisów lokacji, poczty i ponad 20 innych. Zaznacz ich tyle, ile trzeba, np. **Długi opis żywej istoty** i **Długi opis obiektu**: opis jednej istoty gra wysyła jako pierwszy, a kilku naraz (`ob krasnoludy`) jako drugi
4. **Co zrobić** — dowolnie wiele akcji, wykonywanych po kolei. Kolejność zmienisz, przeciągając za uchwyt po lewej

Akcje, które zmieniają linię na ekranie:

- **Koloruj / formatuj** — kolor tekstu i tła, pogrubienie, kursywa, podkreślenie, przekreślenie
- **Wielkie litery**, **Zamień**, **Otocz tekstem**
- **Wolne miganie**, **Szybkie miganie**, **Pulsowanie**

Akcje, które robią coś poza linią (działają też w aliasach i zdarzeniach):

- **Komenda** — wysyła komendę do gry, z `$1`, `$2` z wzorca
- **Dźwięk** — domyślny beep albo własny plik (**Dodaj dźwięk…**); **Wycisz dźwięki** / **Włącz dźwięki**
- **Powiadomienie** i **Powiadomienie na telefon**
- **Czytaj na głos** — głos, tempo i głośność ustawiasz w *Ustawieniach interfejsu → Dźwięk i powiadomienia*
- **Wypisz tekst** — wypisuje własny tekst w oknie gry
- **Funkcyjny bind** — ustawia, co zrobi klawisz funkcyjnego bindu
- **Uruchom skrypt** i **Włącz / wyłącz grupę**

Wtyczki mogą dodawać do tej listy własne akcje — pojawiają się na końcu, pod nazwą wtyczki.

## Triggery na zdarzenia

Zamiast tekstu trigger może reagować na zdarzenie: zabicie wroga, początek i koniec walki, ogłuszenie, atak na ciebie, niskie życie, połączenie i rozłączenie, transport (postój, przystanek, cel podróży) albo dane GMCP.

![Trigger na zdarzenie z warunkiem](img/automatyzacje/zdarzenie.png)

- Przełącz **Kiedy** na **Zdarzenie** i wybierz je z listy. Dla GMCP wybierasz jeszcze pakiet, np. *Char.State — stan postaci*
- **Warunki** zawężają zdarzenie — np. *Życie <= 2*. Wszystkie warunki muszą być spełnione
- W akcjach zamiast `$1` używasz pól zdarzenia, np. `{hp}` czy `{attacker}`. Przyciski pod polem tekstowym wstawiają je za ciebie

Na zrzucie trigger przy niskim życiu uruchamia skrypt "leczenie" i czyta na głos "Mało życia".

## Skrypty

Gdy akcje to za mało, piszesz krótki skrypt w JavaScripcie (**+ → Skrypt**).

![Edytor skryptu z konsolą](img/automatyzacje/skrypt.png)

- **Uruchamiany przez** — skrypt uruchamia akcja **Uruchom skrypt** w aliasie lub triggerze albo własna komenda: skrypt z komendą `leczenie` uruchomisz, wpisując `/leczenie`. Słowa po komendzie trafiają do `args`. Zaznaczone **Zalogowanie postaci** uruchamia skrypt raz po każdym wejściu do gry — dobre miejsce na ustawienie `vars` czy komendy na start
- **Kod JavaScript** — piszesz od razu kod, bez funkcji dookoła. Masz pod ręką `send('komenda')`, `print('tekst')`, `log(...)`, dane `gmcp`, grupy z wzorca w `args` i całe API wtyczek w `api`. Działa `await` i `return`
- **Uruchom** — puszcza skrypt od razu, także niezapisany
- **Konsola** — pokazuje, kto uruchomił skrypt, co wypisał przez `log`, co wysłał do gry i jaki błąd go zatrzymał

Wiersz skryptu na liście mówi, przez ile elementów jest używany. Więcej o tym, co skrypt może zrobić, znajdziesz na stronie **Wtyczki**.
