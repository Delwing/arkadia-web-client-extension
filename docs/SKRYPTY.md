# Skrypty i automatyzacja — co możesz robić

Podsumowanie możliwości systemu skryptów, pluginów i automatyzacji dostępnych dla graczy.

---

Aliasy i triggery (wyzwalacze) tworzysz w jednym oknie: **Menu → Automatyzacja**. Mają wspólne grupy, które włączasz i wyłączasz jednym przełącznikiem i które można wyeksportować do pliku i komuś przekazać.

## Własne aliasy

Tworzysz skróty do długich lub częstych komend — bez pisania ani linijki kodu.

- **Wzorzec regex** — alias reaguje na to, co wpiszesz (np. `^aa (.+)$` zamieni `aa goblin` na `zabij goblin`)
- **Grupy przechwytujące** — `$1`, `$2` itd. wstawiają fragmenty z dopasowania do komendy
- **Skróty obiektów** — `@1`, `@A`, `@@` automatycznie zamieniają się na identyfikatory obiektów z lokacji, a `@>` na następny cel z kolejki ataku
- **Wiele akcji** — poza komendą alias może zagrać dźwięk, wysłać powiadomienie (także na telefon), przeczytać tekst na głos albo ustawić funkcyjny bind
- **Inaczej dla postaci** — ten sam alias może wysyłać inną komendę w zależności od postaci
- **Grupy, włączanie i wybrane postacie** — alias (tak jak trigger) może należeć do grupy, być wyłączony albo działać tylko na wybranych postaciach
- **Import z Blowtorch i Arkadii** — przeniesienie aliasów z innych klientów jednym kliknięciem

## Własne triggery

Reagujesz na to, co pojawia się na ekranie — automatycznie, bez czekania.

- **Wzorzec regex z flagami** — ignorowanie wielkości liter, tryb globalny, wieloliniowy
- **Linia testowa** — wklejasz (albo wybierasz z ostatnich linii gry) tekst i od razu widzisz, czy wzorzec pasuje, co trafi do `$1` i jak linia będzie wyglądać po akcjach
- **Grupy z wzorca w akcjach** — `$1`, `$2` (albo `{1}`) wstawiają dopasowane fragmenty do komendy, powiadomienia czy bindu, np. wzorzec `^(\w+) atakuje cie` i komenda `zabij $1`
- **Filtr typu GMCP** — trigger może reagować tylko na walkę, czat, opisy lokacji, pocztę i 20+ innych kategorii
- **Triggery zdarzeniowe** — zamiast tekstu reaguj na zdarzenia: zabicie wroga, start/koniec walki, ogłuszenie, połączenie, rozłączenie, koniec odliczania zaskoczenia i osłony, transport (postój, przyjazd na przystanek, dotarcie do celu oznaczonego dzwonkiem, zbliżanie się do przystanku)
- **Wiele akcji na jednym triggerze** — każdy trigger może wykonać dowolną kombinację:
  - Zmiana na wielkie litery
  - Kolorowanie dopasowania
  - Zamiana tekstu
  - Otoczenie prefiksem/sufiksem
  - Odtworzenie dźwięku (domyślny beep lub własny plik audio)
  - Wyciszenie / włączenie dźwięków
  - Wysyłanie komendy do serwera
  - Wolne lub szybkie miganie tekstu
  - Pulsowanie (dim z konfigurowalną krzywą animacji)
  - Ustawienie funkcyjnego bindu
  - Czytanie na głos (synteza mowy) — własny tekst z `{1}`/`{nazwa}` z grup wzorca albo `{arg}` ze zdarzenia; głos, tempo, wysokość i głośność w Ustawieniach interfejsu → Dźwięk i powiadomienia
- **Własne dźwięki** — wgrywasz plik audio i używasz go w triggerach
- **Makra z pluginów** — pluginy mogą dodawać własne typy akcji do triggerów (pojawiają się w ustawieniach automatycznie)
- **Grupy, włączanie i wybrane postacie** — trigger może należeć do grupy, być wyłączony albo działać tylko na wybranych postaciach

## Skrypty w Automatyzacji

Gdy akcje aliasu czy triggera to za mało, piszesz krótki skrypt w JavaScripcie — w tym samym oknie (Menu → Automatyzacja → + → Skrypt).

```js
const hp = gmcp.char?.state?.hp;
if (hp > 3) return;
await send('wypij miksture');
log('hp', hp);
```

Piszesz od razu kod — bez żadnej funkcji dookoła. Można użyć `await` i `return`. Edytor podpowiada (`api.`, `ctx.`) i koloruje składnię; na telefonie jest zwykłe pole tekstowe.

- **Kiedy się uruchamia** — przez akcję **Uruchom skrypt** w dowolnym aliasie lub triggerze, przez własną komendę (np. `/leczenie goblin`) albo przyciskiem **Uruchom** w edytorze (działa też na niezapisanym kodzie)
- **`args`** — grupy z wzorca aliasu lub triggera (`$1` to `args[0]`) albo słowa po komendzie
- **`api`** — to samo API, które dostają wtyczki (zob. dokumentację wtyczek). Jego części są też pod własnymi nazwami, bez `api.`: `command.send(...)`, `map`, `team`, `objects`, `triggers`... Własna zmienna o takiej nazwie (np. `const map = new Map()`) po prostu ją przysłania
- **`ctx`** — skąd przyszło uruchomienie (`ctx.source`, `ctx.line` z linią gry, `ctx.event` z danymi zdarzenia)
- **`vars`** — obiekt wspólny dla wszystkich skryptów: jeden zapisze `vars.cel = args[0]`, drugi odczyta `vars.cel`. Trzyma dane do przeładowania strony (nie zapisuje ich na stałe). W module to `ctx.vars`
- **Skróty** — `log(...)` pisze do konsoli skryptu, `send(komenda)` wysyła komendę, `print(tekst)` wypisuje tekst w oknie gry, `gmcp` to dane GMCP z chwili uruchomienia
- **Biblioteki** — z sieci przez `await import('https://esm.sh/nazwa')`. Kod z `import ... from` na początku albo z `export default function (api, args, ctx)` działa jako cały moduł
- **Konsola** — pod kodem widać, kto uruchomił skrypt, co wysłał do gry i jaki błąd go zatrzymał (z numerem linii)
- **Na raz** — skrypt działa raz na uruchomienie; coś, co ma zostać zarejestrowane na stałe (trigger, okno), zrób jako wtyczkę
- **Import** — skrypty z paczki przychodzą włączone albo wyłączone tak, jak były u autora. Paczkę od kogoś obcego przejrzyj przed importem: skrypt ma dostęp do całego API

Druga nowa akcja, **Włącz / wyłącz grupę**, włącza, wyłącza albo przełącza całą grupę — np. trigger na wejście do walki może włączyć grupę "Walka", a trigger na jej koniec ją wyłączyć.

## Bindowanie klawiszy

Mapujesz klawisze na akcje — bez odrywania rąk od klawiatury.

- **Domyślne bindy** — `]` kontekstowe akcje, `Ctrl+1` atak, `Ctrl+Q` wsparcie, `` ` `` tryb ruchu i inne
- **Własne bindy** — przypisujesz dowolny klawisz do dowolnej komendy
- **Tymczasowe bindy** — `/tbind1 komenda` i `/tbind2 komenda` ustawiają bindy na czas sesji
- **Funkcyjne bindy z pluginów** — plugin może dynamicznie ustawiać, co robi dany klawisz

## Edytor skryptów

Piszesz własne pluginy w przeglądarce, w pełni wyposażonym edytorze.

- **Monaco Editor** — ten sam edytor co w Visual Studio Code, z kolorowaniem składni i podpowiadaniem
- **JavaScript i TypeScript** — piszesz, w czym chcesz; TypeScript kompiluje się automatycznie
- **Podpowiadanie API** — edytor zna całe API pluginów, podpowiada metody i parametry
- **Snippety** — wpisz `alias`, `trigger`, `eventListener` lub `fBind`, a edytor wstawi gotowy szablon
- **AI asystent** — wbudowany panel AI (OpenAI / Anthropic) pomoże pisać i modyfikować kod pluginów
- **Zapis automatyczny** — skompilowany plugin od razu synchronizuje się z klientem gry
- **Osobna baza danych** — źródła TypeScript i skompilowany JS przechowywane osobno, bezpiecznie

## System pluginów

Rozszerzasz klienta o własne funkcje — lub instalujesz pluginy innych graczy.

### Instalacja

Panel **Skrypty** ma dwie zakładki: *Zainstalowane* (co masz) i *Katalog* (co możesz mieć).

- **Z katalogu** — zakładka "Katalog" pokazuje pluginy innych graczy: szukaj, filtruj po tagach,
  zajrzyj w opis i historię wersji, a potem kliknij "Zainstaluj". Klient zapamiętuje konkretną
  wersję, więc plugin nie zmieni się sam pod ręką — gdy autor wyda nowszą, na liście
  zainstalowanych pojawi się przycisk "Aktualizuj"
- **Przez link** — otwórz URL z parametrem `?add-script=...` i plugin zainstaluje się automatycznie
- **Własny plugin** — przycisk "Dodaj plugin" prowadzi do pozostałych dróg: import paczki ZIP,
  wklejenie kodu, adres URL, wygenerowanie promptu dla AI albo napisanie pluginu w edytorze

### Co plugin może robić

**Triggery:**
- Rejestracja triggerów na wzorce regex
- Triggery jednorazowe (usuwają się po pierwszym dopasowaniu)
- Triggery tokenowe (dopasowują całe słowa)
- Modyfikacja tekstu — kolorowanie, dodawanie prefiksu/sufiksu, wstawianie, zamiana, usuwanie
- Tworzenie klikalnych linków w tekście
- Ukrywanie linii (zwrócenie `null`)

**Aliasy:**
- Rejestracja własnych komend (np. `/dom`, `/tp miasto`)
- Przechwytywanie grup z regex

**Wysyłanie komend:**
- `api.command.send("komenda")` — wyślij komendę do serwera
- Możliwość wysyłania wielu komend sekwencyjnie

**Zdarzenia:**
- Nasłuchiwanie zdarzeń gry: ruch na mapie, zabicie wroga, dane GMCP, konkretne ścieżki GMCP
- Emitowanie własnych zdarzeń
- Odtwarzanie dźwięków, wyświetlanie powiadomień

**Mapa:**
- Odczyt aktualnego pokoju (nazwa, koordynaty, wyjścia, area)
- Ustawianie lokalizacji
- Cofanie się do poprzedniego pokoju

**Drużyna:**
- Lista członków drużyny
- Lider, ID lidera, numer gracza

**Dane GMCP:**
- Pełny dostęp do danych GMCP (HP, mana, nazwa pokoju itd.)

**Kolejka ataku:**
- Dodawanie, usuwanie, czyszczenie kolejki celów
- Odczyt aktualnej kolejki

**Obiekty na lokacji:**
- Lista obiektów z numerem, opisem, stanem, skrótem

**Kolorowy tekst:**
- `AnsiAwareBuffer` — tworzenie bogatego tekstu z kolorami, formatowaniem, linkami
- Kolory z hex (`#ff0000`) lub RGB

**Przyciski:**
- Rejestracja własnych makr przycisków (mobilne i desktopowe)
- Pola konfiguracji: tekst, textarea, numer, checkbox, select
- Przyciski stanowe (toggle ON/OFF, przełączanie trybów)
- Handle do kontroli stanu z poziomu aliasów

**Filtry listy obiektów:**
- Zmiana koloru, ikony, prefiksu, sufiksu wpisów na liście obiektów
- Modyfikacja paska HP
- Skracanie nazw
- System priorytetów — filtry composable, wiele pluginów współpracuje

**Makra triggerów:**
- Plugin może definiować własne typy akcji dla triggerów użytkownika
- Pojawiają się automatycznie w ustawieniach triggerów
- Konfiguracja przez pola formularza

### Lifecycle pluginu

- `init(api)` — inicjalizacja, rejestracja wszystkiego
- `destroy()` — czyszczenie przy wyładowaniu
- Metadane: nazwa, wersja, autor, opis
- Kompatybilność wsteczna — stare skrypty (legacy) działają bez zmian

### Typy TypeScript

- Pakiet `@arkadia/plugin-types` z pełnym wsparciem IDE
- Autocomplete i hover documentation w edytorze

## Wbudowane skrypty

Klient zawiera ponad 150 gotowych skryptów pokrywających praktycznie każdy aspekt gry:

**Walka:** kolejka ataku, tryby ataku, timer walki, okno walki, zasłanianie, ucieczka, alarm HP, alert braku broni, ogłuszenie wroga, złamana obrona, zaznaczanie celów, ochrona sojuszników, ostrzeżenie o ataku lidera

**Ekwipunek:** menedżer pojemników, zbieranie łupów, cięcie, depozyt bankowy, porównywanie przedmiotów (inline i w oknie), wytrzymałość, stan broni, ocena zbroi/broni/tarczy, kolorowanie monet, kolorowanie broni, sklep

**Nawigacja:** chodzenie, GPS, mapa, tryb ruchu, specjalne wyjścia, skróty lokacji, kompas, przechodzenie bram, autobus/transport, lokalizatory, statki

**Magia:** ładowanie magii, klucze magiczne, zaklęcia, odkładanie magii

**Zioła:** licznik ziół, opisy ziół, sklep zielarski, ładowanie ziół, leczenie chorób i zatruć

**Rzemiosło:** kowalstwo, łowienie ryb, oswajanie zwierząt, wiedza, umiejętności, języki, nauczyciel języków

**Komunikacja:** historia czatu, poczta, nowa wiadomość, lista przedstawionych, listy

**Śledzenie:** postępy (zabici, zlecenia, staż), kontrakty, dostawy, licznik usprawnień, wyróżnienie, profesja

**Czas i środowisko:** zegar (Imperium 400 dni, Ishtar 360 dni), śledzenie słońca, pory roku, system przypływów, labirynty (Raon, Rinde, Taragorn)

**Interfejs:** bindy, multibindy, funkcyjny bind, kolorowanie tymczasowe, gagging (ukrywanie tekstu), pretty containers, krótkie wyjścia, podświetlanie braku wyjścia, podświetlanie kurczących się kamieni wprawionych w sprzęt, opis osoby, emoji aligatora, dobywanie/opuszczanie, siedzenia, dźwięki

**Świat:** timer zniszczenia świata, odrodzenie świata, Brokilon, górskie lokacje, opał, kamienna płyta na bagnach, wrak brygu, wycena kamieni, wycena cen, szyldy gildii

---

> System skryptów i pluginów pozwala graczom automatyzować, rozszerzać i personalizować
> praktycznie każdy aspekt rozgrywki — od prostych aliasów po pełne pluginy z własnym UI,
> stanami i integracjami.
>
> Szczegółowy opis API pluginów znajdziesz w [PLUGINS.md](PLUGINS.md).
