# Ekwipunek

Zarządzanie pojemnikami, zbieranie łupów i depozyty.

## Okno ekwipunku

`/ekwipunek` (albo **Ekwipunek** w menu pod prawym przyciskiem myszy) otwiera okno z tym, co masz przy sobie, w podziale na to, co trzymasz w rękach, nosisz na sobie, na plecach, przy pasie i przy sobie.

- Stan ekwipunku jest zapamiętywany osobno dla każdej postaci i synchronizowany między urządzeniami razem z innymi ustawieniami postaci. Na dole okna widać, z kiedy jest
- Okno wysyła ukryte `i` tylko po kliknięciu przycisku odświeżania albo przy pierwszym otwarciu dla postaci, której ekwipunku jeszcze nie znamy — ani komenda, ani odpowiedź nie pojawiają się w oknie gry. Okno nigdy nie wysyła `i` samo z siebie
- Gdy bierzesz, odkładasz, dajesz lub wkładasz przedmiot do pojemnika albo ktoś coś ci daje, okno od razu dopisuje go do listy, usuwa go albo zmienia liczbę (odłożenie jednego z dwóch woreczków zostawia jeden)
- Gdy nie da się dopasować przedmiotu, a także po założeniu lub zdjęciu przedmiotu oraz po dobyciu, opuszczeniu albo wytrąceniu broni, nad listą pojawia się ostrzeżenie z linkiem **Odśwież**. Otwarcie i zamknięcie pojemnika okno śledzi samo
- Lista aktualizuje się też, gdy sam wpiszesz `i`
- Pojemniki (plecak, torba, sakwa, sakiewka, woreczek, …) da się rozwinąć. Kilka takich samych pojemników (`dwa woreczki`) to osobne wiersze, każdy z własnym numerem (`zajrzyj do 2. swojego woreczka`). Zamknięte mają ikonę kłódki. Ikona oka zagląda do środka bez wypisywania niczego w oknie gry, a zawartość uzupełnia się też, gdy sam zajrzysz do pojemnika. Po włożeniu lub wyjęciu czegoś pod zawartością pojawia się ostrzeżenie, że mogła się zmienić
- Woreczki należą do menedżera ziół: po rozwinięciu pokazują zioła, które policzył w woreczku o tym numerze (`/ziola_buduj`), a ikona liścia otwiera okno Ziół. Nie są proponowane jako miejsce do wkładania przedmiotów
- Pochwy i temblaki pokazują broń, która w nich tkwi, pod sobą; pusta pochwa ma znaczek „pusta”

### Pojemniki z `/pojemnik`

Pojemniki ustawione w `/pojemnik` mają w oknie własną kolumnę (obok listy, gdy okno jest dość szerokie, nad nią, gdy wąskie). Każdy pokazuje, na co jest (monety, kamienie, jedzenie, inne) i co w nim jest.

- **Przeciąganie** działa między „Przy sobie” a tymi pojemnikami: przedmiot przeciągnięty na pojemnik zostaje do niego włożony, przeciągnięty z pojemnika na listę — wyjęty, a z jednego pojemnika na drugi — przełożony. Przedmiot w trakcie przeciągania znika ze swojego miejsca, a tam, gdzie wyląduje, robi się dla niego miejsce. Po upuszczeniu czeka przygaszony, aż gra potwierdzi
- **Prawy przycisk** na przedmiocie: **Odłóż**, **Oceń**, **Włóż do…**, a na pojemniku także **Zajrzyj** i **Otwórz** / **Zamknij**. Na przedmiocie w pojemniku: **Wyjmij** i **Przełóż do…**. Woreczki nie są proponowane jako miejsce do wkładania — to woreczki na zioła
- Wkładanie i wyjmowanie idzie przez menedżer pojemników, tak jak `/wdp` i `/wzp`, więc pojemnik jest otwierany i zamykany zgodnie z jego ustawieniami. Inne pojemniki (spoza `/pojemnik`) okno otwiera przed i zamyka po, gdy są zamknięte
- Gdy gra odmówi (`… nie chce wejsc.`), przedmiot od razu wraca na swoje miejsce, a okno na chwilę pokazuje powód

## Okno zbroi

`/zbroja` (albo **Zbroja** w menu pod prawym przyciskiem myszy) pokazuje sylwetkę z miejscami na zbroję: głowa, korpus, lewe i prawe ramię, dłonie, nogi, stopy i tarcza (to, co zakładasz `na lewa reke` albo `na prawa reke`). `ramiona` zajmuje oba ramiona naraz. Okno uczy się z komunikatów gry przy zakładaniu i zdejmowaniu:

- `Zakladasz stalowa dluga kolczuge na tulow, nogi i ramiona.` — kolczuga zajmuje wszystkie trzy miejsca, a zakryte części sylwetki się podświetlają
- `Zdejmujesz z siebie stalowa dluga kolczuge.` — zwalnia każde miejsce, które zajmowała

Gdy zakładany przedmiot jest w bazie złomu, a nie ma jeszcze wpisanej osłony, okno ją uzupełnia (`tulow` jako `korpus`, np. `korpus, nogi i ramiona`). Osłona, która już jest, zostaje bez zmian.

Stan jest zapamiętywany osobno dla każdej postaci i synchronizowany między urządzeniami. Okno uczy się też z `i`: przedmiot, który masz na sobie, a baza złomu zna jego osłonę, trafia od razu na swoje miejsca — nawet jeśli nie widziało, jak go zakładasz. Każde `i` układa miejsca od nowa: miejsce zajęte przez zakładanie znika, jeśli baza złomu nie zna przedmiotu pod nazwą, jaką podaje `i` (np. hełm opisany w `i` dokładniej niż przy zakładaniu). Taki przedmiot trafia wtedy na listę **Do uzupełnienia** — dopisz w złomie tę nazwę albo linię w kolumnie **W i**. Przedmioty na plecach i przy pasie się nie liczą.

Niektóre zbroje `i` opisuje po swojemu, a nie nazwą, np.:

```
Od stop do glow zakuty jestes w stalowe plyty krwistoczerwonego pelnego pancerza, na ktorego naramiennikach wygrawerowano symbole twego Pana - Khorna.
```

Dla takiego przedmiotu wpisz w oknie złomu (zakładki Zbroje i Tarcze, kolumna **W i**), jak go opisuje `i`:

- zwykły tekst — linia z `i` musi go zawierać (wielkość liter i kropka na końcu nie mają znaczenia), np. `plyty krwistoczerwonego pelnego pancerza`
- `/regexp/` — wyrażenie regularne, z flagami po ukośniku, np. `/^Od stop do glow zakut\S* jestes w .+ Khorna/`

Gdy linia z `i` pasuje, przedmiot zajmuje miejsca ze swojej osłony. Wpis sprawdzany jest tylko na liniach odpowiedzi na `i`, nigdy na reszcie tekstu z gry. Linia, której okno ekwipunku nie zna, liczy się w środku odpowiedzi, a jako jej pierwsza linia tylko wtedy, gdy `i` zostało wpisane ręcznie albo okno samo o nie zapytało. Ponowna ocena przedmiotu i import bazy zostawiają wpisany opis.

Ubrania i dodatki (biżuteria, obroże, insygnia) nie zajmują miejsc — okno pokazuje je pod sylwetką jako małe plakietki. Rozpoznaje je baza złomu: `ocen` zapisuje przedmiot jako **ubranie**, gdy gra mówi `Ubranie to zostalo wykonane z ...`, a jako **dodatek**, gdy mówi tylko, z czego jest (`Zostala wykonana z mosiadzu.`); oba trafiają do zakładek **Ubrania** i **Dodatki** w oknie złomu, razem z materiałem. Także i one mogą mieć w `i` własną linię (np. `Wokol szyi masz zacisnieta mosieznej obrozy ...`) — wpisz ją w kolumnie **W i**. Płaszcz, pierścień czy sygnet, których złom jeszcze nie zna, też pojawiają się jako plakietka, wyszarzona, dopóki go nie ocenisz. Dopisek `z naciagnietym na glowe kapturem` nie jest częścią nazwy płaszcza.

Pod sylwetką okno pokazuje **Do uzupełnienia** z ostatniego `i`:

- noszone, ale bez miejsca — przedmioty z `i`, dla których nic nie mówi, co zakrywają (np. zbroja bez osłony w bazie złomu albo zapisana tam pod inną nazwą). Wystarczy uzupełnić osłonę lub nazwę w złomie. Nie pojawiają się tu rzeczy, które zbroją nie są: ubrania na zbroi (płaszcz, szata, całun, chusta, maska), biżuteria i insygnia (pierścień, sygnet, bransoleta, opaska, amulet, talizman, broszka, spinka) ani mapnik.
- linie, których klient nie rozpoznaje — sposób opisu w `i`, którego okno ekwipunku jeszcze nie zna. Jeśli to zbroja, ubranie albo dodatek, wpisz tę linię w kolumnie **W i**; jeśli coś innego, warto ją zgłosić, żeby dodać nowy wzorzec.

Lista zmienia się przy każdym `i`, a przedmiot, który zakładasz albo zdejmujesz, od razu z niej znika.

Przedmiot albo linię, której nie trzeba uzupełniać (np. przedmiot gildiowy lub klubowy), schowasz ikoną przekreślonego oka obok niej. Zostaje schowana także w kolejnych `i`. Schowane są pod sylwetką w zwiniętej liście **Ignorowane**, skąd można je przywrócić — wrócą na listę przy następnym `i`. Lista jest osobna dla każdej postaci.

## Menedżer pojemników

Menedżer pojemników pozwala przypisać wybrane torby, plecaki i inne pojemniki do określonych typów przedmiotów. Dzięki temu możesz szybko odkładać i wyjmować rzeczy z odpowiedniego miejsca.

### Konfiguracja

1. Wpisz `/pojemnik`, aby przeszukać ekwipunek i wyświetlić listę pojemników
2. Kliknij nazwę typu przy wybranym pojemniku, aby przypisać go do danego typu
3. Wybierz `wszystkie`, by używać pojemnika dla wszystkich kategorii
4. Sprawdź aktualne przypisania komendą `/pojemniki`

Pojemnik noszony na plecach, przytroczony do pasa albo noszony na ramieniu (`Na prawym ramieniu nosisz … torbe`) jest „założony” — lista pokazuje go jako `zalozony plecak`, a komendy mówią `otworz zalozony plecak`, `wloz … do zalozonego plecaka`. Pozostałe (przy sobie, przewieszone albo zarzucone na ramię) są „swoje”: `otworz swoja sakiewke`.

Jeśli masz kilka pojemników tego samego rodzaju, lista numeruje je osobno wśród założonych i osobno wśród pozostałych — `1. zalozona sakiewka (otwarta runiczna)`, `2. zalozona sakiewka (skórzana)` — a komendy trafiają do wybranego (`otworz 2. zalozona sakiewke`). Numer to kolejność w ekwipunku, więc po zdobyciu lub oddaniu innej sakiewki uruchom `/pojemnik` ponownie.

Gdy masz pojemniki tego samego rodzaju i noszone, i przy sobie (np. plecak na plecach i drugi w ekwipunku), nie wiadomo, który gra liczy jako pierwszy. Okno ekwipunku pokazuje wtedy ostrzeżenie z linkiem **Sprawdź** — po kliknięciu wysyła ukryte `ocen 1. plecak`, `ocen 2. plecak`… i z odpowiedzi ustala numery. Od tej pory i okno, i komendy pojemników (`/wdp`, `/wzp`) używają tych numerów (`wloz … do 2. swojego plecaka`), dopóki plecaki się nie zmienią. Bez kliknięcia nic nie jest wysyłane.

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
