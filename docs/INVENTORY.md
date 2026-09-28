# Ekwipunek

Zarządzanie pojemnikami, zbieranie łupów i depozyty.

## Menedżer pojemników

Menedżer pojemników pozwala przypisać wybrane torby, plecaki i inne pojemniki do określonych typów przedmiotów. Dzięki temu możesz szybko odkładać i wyjmować rzeczy z odpowiedniego miejsca.

### Konfiguracja

1. Wpisz `/pojemnik`, aby przeszukać ekwipunek i wyświetlić listę pojemników
2. Kliknij nazwę typu przy wybranym pojemniku, aby przypisać go do danego typu
3. Wybierz `wszystkie`, by używać pojemnika dla wszystkich kategorii
4. Sprawdź aktualne przypisania komendą `/pojemniki`

> Ustawienia są zapisywane w pamięci przeglądarki.

### Komendy pojemników

| Komenda | Opis |
|---------|------|
| `/pojemnik` | Uruchom konfigurację menedżera pojemników |
| `/pojemniki` | Wyświetl bieżące ustawienia |
| `/wdp przedmioty` | Włóż przedmioty do pojemnika typu **other** |
| `/wzp przedmioty` | Wyjmij przedmioty z pojemnika typu **other** |
| `/wem` lub `wem` | Wyjmij monety z pojemnika typu **money** |
| `/wlm` lub `wlm` | Włóż monety do pojemnika typu **money** |
| `/wlp` | Włóż pocztową paczkę do pojemnika |
| `/wep` | Wyjmij pocztową paczkę z pojemnika |

## Zbieranie łupów

| Komenda | Opis |
|---------|------|
| `/zbieraj_extra przedmiot` | Dodaj przedmiot do listy ekstra rzeczy zbieranych z ciał |
| `/nie_zbieraj_extra [przedmiot]` | Usuń przedmiot z listy ekstra (bez parametru czyści całą listę) |

## Wycinanie i wyrywanie

| Komenda | Opis |
|---------|------|
| `/wyc` lub `/wycinaj` | Wycinaj ze wszystkich ciał w pomieszczeniu |
| `/wyc numer` | Wycinaj z ciała o podanym numerze |
| `/wyr` lub `/wyrywaj` | Wyrywaj ze wszystkich ciał w pomieszczeniu |
| `/wyr numer` | Wyrywaj z ciała o podanym numerze |

## Depozyty

| Komenda | Opis |
|---------|------|
| `/depozyt` | Sprawdź zawartość depozytu w aktualnym banku |
| `/depozyty` | Wyświetl listę zapisanych depozytów |
| `/depozytyw` | Otwórz okno depozytów |
| `/depozytyw <filtr>` | Otwórz okno depozytów z podanym filtrem |
| `/depozyt_reset` | Usuń wszystkie zapisane depozyty |

> **Wskazówka:** Okno depozytów jest również dostępne z menu kontekstowego (prawy przycisk myszy). Przedmioty są kolorowane tak samo jak w `/depozyty` (monety, klucze magiczne, magie).

## Przeglądanie i ocena

| Komenda                   | Opis |
|---------------------------|------|
| `/przejrzyj [co]`         | Pokaż zawartość skrzyń z kluczami i magicznymi przedmiotami |
| `/por [id]`               | Porównaj siłę, zręczność i wytrzymałość z obiektem |
| `/odloz_magie [pojemnik]` | Skanuj inwentarz i ustaw bind odkładania magicznych przedmiotów |
| `/ocen`                   | Oceń swoje bronie i zbroje, wypisując ich stan |
| `/sprzet`                 | Alias do `/ocen` |
| `/ubrania`                | Oceń stan ubrań |
| `/ocenkamienie`           | Oblicz łączną wartość kamieni |

> **Wskazówka:** Na liście z `/przejrzyj` magiczne przedmioty i klucze są klikalne - kliknięcie wysyła `wybierz`. Przy magiach klient zamienia nazwę na formę pojedynczą w bierniku, więc z kilku takich samych przedmiotów wyjmowany jest tylko jeden (np. kliknięcie "trzy lsniace plomieniste tarcze" wyśle `wybierz lsniaca plomienista tarcze`).

## Lampa

| Komenda | Opis |
|---------|------|
| `/zap` | Zapal lampę |
| `/zg` | Zgaś lampę |

## Naprawy

| Komenda | Opis |
|---------|------|
| `/napraw` | Napraw sprzęt u kowala |
| `/naprawa` | Alias do `/napraw` |
| `/napraw_ubrania` | Napraw ubrania u krawca |
