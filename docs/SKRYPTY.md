# Skrypty i automatyzacja — co mozesz robic

Podsumowanie mozliwosci systemu skryptow, pluginow i automatyzacji dostepnych dla graczy.

---

## Wlasne aliasy

Tworzysz skroty do dlugich lub czestych komend — bez pisania ani linijki kodu.

- **Wzorzec regex** — alias reaguje na to, co wpiszesz (np. `^aa (.+)$` zamieni `aa goblin` na `zabij goblin`)
- **Grupy przechwytujace** — `$1`, `$2` itd. wstawiaja fragmenty z dopasowania do komendy
- **Skroty obiektow** — `@1`, `@A`, `@@` automatycznie zamieniaja sie na identyfikatory obiektow z lokacji
- **Nadpisania per postac** — ten sam alias moze wysylac inna komende w zaleznosci od postaci
- **Import z Blowtorch i Arkadii** — przeniesienie aliasow z innych klientow jednym kliknieciem

## Wlasne triggery

Reagujesz na to, co pojawia sie na ekranie — automatycznie, bez czekania.

- **Wzorzec regex z flagami** — ignorowanie wielkosci liter, tryb globalny, wieloliniowy
- **Filtr typu GMCP** — trigger moze reagowac tylko na walke, czat, opisy lokacji, poczte i 20+ innych kategorii
- **Triggery zdarzeniowe** — zamiast tekstu, reaguj na zdarzenia: zabicie wroga, start/koniec walki, ogluszenie, polaczenie, rozlaczenie, timery
- **Wiele akcji na jednym triggerze** — kazdy trigger moze wykonac dowolna kombinacje:
  - Zmiana na wielkie litery
  - Kolorowanie dopasowania
  - Zamiana tekstu
  - Otoczenie prefiksem/sufiksem
  - Odtworzenie dzwieku (domyslny beep lub wlasny plik audio)
  - Wyciszenie / wlaczenie dzwiekow
  - Wysylanie komendy do serwera
  - Wolne lub szybkie miganie tekstu
  - Pulsowanie (dim z konfigurowalna krzywą animacji)
  - Ustawienie funkcyjnego bindu
- **Wlasne dzwieki** — wgrywasz plik audio i uzywasz go w triggerach
- **Makra z pluginow** — pluginy moga dodawac wlasne typy akcji do triggerow (pojawia sie w ustawieniach automatycznie)

## Bindowanie klawiszy

Mapujesz klawisze na akcje — bez odrywania rak od klawiatury.

- **Domyslne bindy** — `]` kontekstowe akcje, `Ctrl+1` atak, `Ctrl+Q` wsparcie, `` ` `` tryb ruchu, i inne
- **Wlasne bindy** — przypisujesz dowolny klawisz do dowolnej komendy
- **Tymczasowe bindy** — `/tbind1 komenda` i `/tbind2 komenda` ustawiaja bindy na czas sesji
- **Funkcyjne bindy z pluginow** — plugin moze dynamicznie ustawiac co robi dany klawisz

## Edytor skryptow

Piszesz wlasne pluginy w przegladarce, w pelni wyposazonym edytorze.

- **Monaco Editor** — ten sam edytor co w Visual Studio Code, z kolorowaniem skladni i podpowiadaniem
- **JavaScript i TypeScript** — piszesz w czym chcesz; TypeScript kompiluje sie automatycznie
- **Podpowiadanie API** — edytor zna cale API pluginow, podpowiada metody i parametry
- **Snippety** — wpisz `alias`, `trigger`, `eventListener` lub `fBind` i edytor wstawi gotowy szablon
- **AI asystent** — wbudowany panel AI (OpenAI / Anthropic) pomoze pisac i modyfikowac kod pluginow
- **Zapis automatyczny** — skompilowany plugin od razu synchronizuje sie z klientem gry
- **Osobna baza danych** — zrodla TypeScript i skompilowany JS przechowywane osobno, bezpiecznie

## System pluginow

Rozszerzasz klienta o wlasne funkcje — lub instalujesz pluginy innych graczy.

### Instalacja

- **Przez UI** — wklej URL i kliknij "Dodaj"
- **Przez link** — otworz URL z parametrem `?add-script=...` i plugin zainstaluje sie automatycznie
- **Przez edytor** — pisz plugin bezposrednio w wbudowanym edytorze
- **Import plikow** — wrzuc plik .js/.ts z dysku

### Co plugin moze robic

**Triggery:**
- Rejestracja triggerow na wzorce regex
- Triggery jednorazowe (usuwaja sie po pierwszym dopasowaniu)
- Triggery tokenowe (dopasowuja calé slowa)
- Modyfikacja tekstu — kolorowanie, dodawanie prefiksu/sufiksu, wstawianie, zamiana, usuwanie
- Tworzenie klikalnych linkow w tekscie
- Ukrywanie linii (zwrocenie `null`)

**Aliasy:**
- Rejestracja wlasnych komend (np. `/dom`, `/tp miasto`)
- Przechwytywanie grup z regex

**Wysylanie komend:**
- `api.command.send("komenda")` — wyslij komende do serwera
- Mozliwosc wysylania wielu komend sekwencyjnie

**Zdarzenia:**
- Nasluchiwanie zdarzen gry: ruch na mapie, zabicie wroga, dane GMCP, konkretne sciezki GMCP
- Emitowanie wlasnych zdarzen
- Odtwarzanie dzwiekow, wyswietlanie powiadomien

**Mapa:**
- Odczyt aktualnego pokoju (nazwa, koordynaty, wyjscia, area)
- Ustawianie lokalizacji
- Cofanie sie do poprzedniego pokoju

**Druzyna:**
- Lista czlonkow druzyny
- Lider, ID lidera, numer gracza

**Dane GMCP:**
- Pelny dostep do danych GMCP (HP, mana, nazwa pokoju, itd.)

**Kolejka ataku:**
- Dodawanie, usuwanie, czyszczenie kolejki celow
- Odczyt aktualnej kolejki

**Obiekty na lokacji:**
- Lista obiektow z numerem, opisem, stanem, skrotem

**Kolorowy tekst:**
- `AnsiAwareBuffer` — tworzenie bogatego tekstu z kolorami, formatowaniem, linkami
- Kolory z hex (`#ff0000`) lub RGB

**Przyciski:**
- Rejestracja wlasnych makr przyciskow (mobilne i desktopowe)
- Pola konfiguracji: tekst, textarea, numer, checkbox, select
- Przyciski stanowe (toggle ON/OFF, przelaczanie trybow)
- Handle do kontroli stanu z poziomu aliasow

**Filtry listy obiektow:**
- Zmiana koloru, ikony, prefiksu, sufiksu wpisow na liscie obiektow
- Modyfikacja paska HP
- Skracanie nazw
- System priorytetow — filtry composable, wiele pluginow wspolpracuje

**Makra triggerow:**
- Plugin moze definiowac wlasne typy akcji dla triggerow uzytkownika
- Pojawiaja sie automatycznie w ustawieniach triggerow
- Konfiguracja przez pola formularza

### Lifecycle pluginu

- `init(api)` — inicjalizacja, rejestracja wszystkiego
- `destroy()` — czyszczenie przy wyladowaniu
- Metadane: nazwa, wersja, autor, opis
- Kompatybilnosc wsteczna — stare skrypty (legacy) dzialaja bez zmian

### Typy TypeScript

- Pakiet `@arkadia/plugin-types` z pelnym wsparciem IDE
- Autocomplete i hover documentation w edytorze

## Wbudowane skrypty

Klient zawiera ponad 150 gotowych skryptow pokrywajacych praktycznie kazdy aspekt gry:

**Walka:** kolejka ataku, tryby ataku, timer walki, okno walki, zaslanianie, ucieczka, alarm HP, alert braku broni, ogluszenie wroga, zlamana obrona, zaznaczanie celow, ochrona sojusznikow, ostrzezenie o ataku lidera

**Ekwipunek:** menedzer pojemnikow, zbieranie lupow, ciecie, depozyt bankowy, porownywanie przedmiotow (inline i w oknie), wytrzymalosc, stan broni, ocena zbroi/broni/tarczy, kolorowanie monet, kolorowanie broni, sklep

**Nawigacja:** chodzenie, GPS, mapa, tryb ruchu, specjalne wyjscia, skroty lokacji, kompas, przechodzenie bram, autobus/transport, lokalizatory, statki

**Magia:** ladowanie magii, klucze magiczne, zaklecia, odkadanie magii

**Ziola:** licznik ziol, opisy ziol, sklep zielarski, ladowanie ziol

**Rzemioslo:** kowalstwo, lowienie ryb, oswajanie zwierzat, wiedza, umiejetnosci, jezyki, nauczyciel jezykow

**Komunikacja:** historia czatu, poczta, nowa wiadomosc, lista przedstawionych, listy

**Sledzenie:** postepy (zabici, zlecenia, staz), kontrakty, dostawy, licznik usprawnien, wyroznienie, profesja

**Czas i srodowisko:** zegar (Imperium 400 dni, Ishtar 360 dni), sledzenie slonca, pory roku, system przyplywow, toniety, labirynty (Raon, Rinde)

**Interfejs:** bindy, multibindy, funkcyjny bind, kolorowanie tymczasowe, gagging (ukrywanie tekstu), pretty containers, krotkie wyjscia, podswietlanie braku wyjscia, opis osoby, emoji aligatora, dobywanie/opuszczanie, siedzenia, dzwieki

**Swiat:** timer zniszczenia swiata, odrodzenie swiata, Brokilon, gorskie lokacje, opal, wycena kamieni, wycena cen, szyldy gildii

---

> System skryptow i pluginow pozwala graczom automatyzowac, rozszerzac i personalizowac
> praktycznie kazdy aspekt rozgrywki — od prostych aliasow po pelne pluginy z wlasnym UI,
> stanami i integracjami.
>
> Szczegolowy opis API pluginow znajdziesz w [PLUGINS.md](PLUGINS.md).
