# Ekwipunek

Zarzadzanie pojemnikami, zbieranie lupow i depozyty.

## Menedzer pojemnikow

Menedzer pojemnikow pozwala przypisac wybrane torby, plecaki i inne pojemniki do okreslonych typow przedmiotow. Dzieki temu mozesz szybko odkladac i wyjmowac rzeczy z odpowiedniego miejsca.

### Konfiguracja

1. Wpisz `/pojemnik` aby przeszukac ekwipunek i wyswietlic liste pojemnikow
2. Kliknij nazwe typu przy wybranym pojemniku, aby przypisac go do danego typu
3. Wybierz `wszystkie` by uzywac pojemnika dla wszystkich kategorii
4. Sprawdz aktualne przypisania komenda `/pojemniki`

> Ustawienia sa zapisywane w pamieci przegladarki.

### Komendy pojemnikow

| Komenda | Opis |
|---------|------|
| `/pojemnik` | Uruchom konfiguracje menedzera pojemnikow |
| `/pojemniki` | Wyswietl biezace ustawienia |
| `/wdp przedmioty` | Wloz przedmioty do pojemnika typu **other** |
| `/wzp przedmioty` | Wyjmij przedmioty z pojemnika typu **other** |
| `/wem` lub `wem` | Wyjmij monety z pojemnika typu **money** |
| `/wlm` lub `wlm` | Wloz monety do pojemnika typu **money** |
| `/wlp` | Wloz pocztowa paczke do pojemnika |
| `/wep` | Wyjmij pocztowa paczke z pojemnika |

## Zbieranie lupow

| Komenda | Opis |
|---------|------|
| `/zbieraj_extra przedmiot` | Dodaj przedmiot do listy ekstra rzeczy zbieranych z cial |
| `/nie_zbieraj_extra [przedmiot]` | Usun przedmiot z listy ekstra (bez parametru czyści cala liste) |

## Wycinanie i wyrywanie

| Komenda | Opis |
|---------|------|
| `/wyc` lub `/wycinaj` | Wycinaj ze wszystkich cial w pomieszczeniu |
| `/wyc numer` | Wycinaj z ciala o podanym numerze |
| `/wyr` lub `/wyrywaj` | Wyrywaj ze wszystkich cial w pomieszczeniu |
| `/wyr numer` | Wyrywaj z ciala o podanym numerze |

## Depozyty

| Komenda | Opis |
|---------|------|
| `/depozyt` | Sprawdz zawartosc depozytu w aktualnym banku |
| `/depozyty` | Wyswietl liste zapisanych depozytow |
| `/depozyt_reset` | Usun wszystkie zapisane depozyty |

## Przegladanie i ocena

| Komenda | Opis |
|---------|------|
| `/przejrzyj [co]` | Pokaz zawartosc skrzyn z kluczami i magicznymi przedmiotami |
| `/por [skrot]` | Porownaj sile, zrecznosc i wytrzymalosc z obiektem |
| `/odloz_magie [pojemnik]` | Skanuj inwentarz i ustaw bind odkładania magicznych przedmiotow |
| `/ocen` | Ocen swoje bronie i zbroje, wypisujac ich stan |
| `/sprzet` | Alias do `/ocen` |
| `/ocenkamienie` | Oblicz laczna wartosc kamieni |

## Lampa

| Komenda | Opis |
|---------|------|
| `/zap` | Zapal lampe |
| `/zg` | Zgas lampe |

## Naprawy

| Komenda | Opis |
|---------|------|
| `/napraw` | Napraw sprzet u kowala |
| `/naprawa` | Alias do `/napraw` |
| `/napraw_ubrania` | Napraw ubrania u krawca |
