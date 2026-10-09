# Skrypty i wtyczki — co możesz robić

Podsumowanie możliwości systemu skryptów i pluginów dostępnych dla graczy.

---

Aliasy, wyzwalacze i skrypty z okna **Menu → Automatyzacja** opisuje strona **Automatyzacje**. Tu są bindy, edytor i system wtyczek oraz wbudowane skrypty.

## Skrypty w Automatyzacji — dla zaawansowanych

```js
const hp = gmcp.char?.state?.hp;
if (hp > 3) return;
await send('wypij miksture');
log('hp', hp);
```

- **`args`** — grupy z wzorca aliasu lub triggera (`$1` to `args[0]`) albo słowa po komendzie
- **`api`** — to samo API, które dostają wtyczki (zob. dokumentację wtyczek). Jego części są też pod własnymi nazwami, bez `api.`: `command.send(...)`, `map`, `team`, `objects`, `triggers`... Własna zmienna o takiej nazwie (np. `const map = new Map()`) po prostu ją przysłania
- **`ctx`** — skąd przyszło uruchomienie (`ctx.source`, `ctx.line` z linią gry, `ctx.event` z danymi zdarzenia)
- **`vars`** — obiekt wspólny dla wszystkich skryptów: jeden zapisze `vars.cel = args[0]`, drugi odczyta `vars.cel`. Trzyma dane do przeładowania strony (nie zapisuje ich na stałe). W module to `ctx.vars`
- **Skróty** — `log(...)` pisze do konsoli skryptu, `send(komenda)` wysyła komendę, `print(tekst)` wypisuje tekst w oknie gry, `gmcp` to dane GMCP z chwili uruchomienia
- **Biblioteki** — z sieci przez `await import('https://esm.sh/nazwa')`. Kod z `import ... from` na początku albo z `export default function (api, args, ctx)` działa jako cały moduł
- **Na raz** — skrypt działa raz na uruchomienie; coś, co ma zostać zarejestrowane na stałe (trigger, okno), zrób jako wtyczkę

## Bindowanie klawiszy

Mapujesz klawisze na akcje — bez odrywania rąk od klawiatury.

- **Domyślne bindy** — `]` kontekstowe akcje, `Ctrl+1` atak, `Ctrl+Q` wsparcie, `` ` `` tryb ruchu i inne
- **Własne bindy** — przypisujesz dowolny klawisz do dowolnej komendy
- **Tymczasowe bindy** — `/tbind1 komenda`, `/tbind2 komenda` (i kolejne, gdy dodasz je w oknie Klawisze) ustawiają bindy na czas sesji
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
