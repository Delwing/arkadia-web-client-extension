# Aliasy

Poniższa lista opisuje dostępne aliasy w rozszerzeniu:

Możliwe jest także tworzenie własnych aliasów w ustawieniach klienta. Wzorzec jest wyrażeniem regularnym, a w komendzie można używać `$1`, `$2` itd. aby odwołać się do odpowiednich grup z dopasowania. Można też korzystać ze skrótów obiektów (np. `@1`, `@A`, `@@`), które zostaną zamienione na identyfikatory obiektów.

## Ogólne
- **/fake _tekst_** - wyświetla podany tekst jak zwykłą wiadomość klienta.
- **/czas** - otwiera okno zegara z aktualnym czasem w grze.
- **/zabici** - pokazuje tabelę z liczbą twoich zabitych istot w bieżącej sesji.
- **/zabici2** - wyświetla podsumowanie liczby zabitych istot.
- **/zabici_reset** - zeruje licznik zabitych istot.
- **/cechy** - uruchamia licznik poziomowania i wyświetla postępy.
- **/postepy** - wyświetla postępy ulepszeń.
- **/postepy_reset** - zeruje licznik postępów.
- **/postepy2** - wyświetla globalny licznik postępów.
- **/postepy2+** - dodaje jeden postęp do globalnego licznika.
- **/postepy2+ _ile_** - dodaje _ile_ postępów (maksymalnie 15).
- **/postepy2+ _id ile_** - kopiuje _ile_ postępów z wpisu o numerze _id_.
- **/postepy2- _id_** - usuwa wpis o numerze _id_ z globalnego licznika.
- **/postepy2- _id ile_** - usuwa _ile_ wpisów zaczynając od _id_.
- **/postepy2_reset** - resetuje globalny licznik postępów.
- **/postepy2_off** - wyłącza automatyczne dodawanie do globalnego licznika.
- **/postepy2_on** - włącza automatyczne dodawanie do globalnego licznika.
- **/przejrzyj [_co_]** - pokazuje zawartość skrzyń z kluczami i magicznymi przedmiotami lub podanego pojemnika (wykorzystuje komendę `ob`).
- **/por [_skrot_]** - porównuje siłę, zręczność i wytrzymałość z podanym obiektem lub wszystkimi w pomieszczeniu.
- **/chat** - wyświetla ostatnie 20 wiadomości z czatu GMCP.
- **/chatw** lub **/chat okno** - otwiera okno czatu z historią ostatnich 100 wiadomości (przycisk "Druzyna" filtruje wiadomości od członków drużyny).
- **/list** - otwiera edytor pisania listów w kliencie.
- **/zaznaczaj** - włącza zaznaczanie odwiedzanych lokacji na mapie i oznacza bieżącą.
- **/zaznaczaj-** - wyłącza zaznaczanie lokacji i usuwa dotychczasowe zaznaczenia.
- **/odloz_magie [_pojemnik_]** - skanuje inwentarz w poszukiwaniu magicznych przedmiotów i ustawia binda odkładania ich do podanego pojemnika (domyślnie do skrzyni).
- **/staz** - wyświetla aktualny postęp treningu zawodu (procent ukończenia).
- **/staz _liczba_** - rozpoczyna zliczanie stażu zawodowego od podanej wartości punktów (240 = pełny staż, 10 punktów tygodniowo, 3 punkty za +staż).

## Umiejętności
- **um** - wyświetla zestawienie umiejętności w czytelnej tabeli z kolorowymi poziomami.

## Menedżer pojemników
- **/pojemnik** - uruchamia konfigurację menedżera pojemników.
- **/pojemniki** - wyświetla bieżące ustawienia menedżera pojemników.
- **/wdp _przedmioty_** - wkłada podane przedmioty do ustawionego pojemnika.
- **/wzp _przedmioty_** - wyjmuje podane przedmioty z ustawionego pojemnika.
- **/wem** (lub **wem**) - wyjmuje monety z pojemnika na pieniądze.
- **/wlm** (lub **wlm**) - wkłada monety do pojemnika na pieniądze.
- **/wlp** - wkłada pocztową paczkę do ustawionego pojemnika.
- **/wep** - wyjmuje pocztową paczkę z ustawionego pojemnika.

## Depozyty
- **/depozyt** - sprawdza zawartość depozytu w aktualnym banku.
- **/depozyty** - wyświetla listę zapisanych depozytów.
- **/depozyt_reset** - usuwa wszystkie zapisane depozyty.

## Zbieranie łupów
- **/zbieraj_extra _przedmiot_** - dodaje przedmiot do listy ekstra rzeczy zbieranych z ciał.
- **/nie_zbieraj_extra [_przedmiot_]** - usuwa wskazany przedmiot z listy ekstra lub bez parametru czyści całą listę.

## Wycinanie/Wyrywanie
- **/wyc** lub **/wycinaj** - wycina ze wszystkich ciał w pomieszczeniu.
- **/wyc _numer_** - wycina z ciała o podanym numerze.
- **/wyr** lub **/wyrywaj** - wyrywa ze wszystkich ciał w pomieszczeniu.
- **/wyr _numer_** - wyrywa z ciała o podanym numerze.

## Lampa
- **/zap** - wykonuje polecenie `zapal lampe`.
- **/zg** - wykonuje polecenie `zgas lampe`.

## Prowadzenie i ruch
- **/cofnij** - cofa postać do poprzedniego pomieszczenia na mapie.
- **/move _kierunek_** - przesuwa mapę w wybranym kierunku bez wysyłania komendy do serwera.
- **/ustaw _id_** - ustawia bieżącą pozycję na mapie na podany identyfikator.
- **/zlok** - wymusza odświeżenie bieżącej pozycji na mapie.
- **/przeszukaj _tekst_** - wyszukuje w danych mapy pokoje z nazwami zawierającymi podany tekst i wypisuje do 10 najbliższych.
- **/prowadz _id_** - rozpoczyna prowadzenie innej osoby do wskazanego pokoju.
- **/prowadz-** - kończy prowadzenie rozpoczęte komendą `/prowadz`.
- **/go** - gdy aktywne jest prowadzenie, wybiera wyjście zgodnie z wyznaczoną trasą.
- **/idz** - wybiera przeciwne wyjście w pomieszczeniu.
- **/idz _id [opoznienie]_** - automatycznie idzie do wskazanej lokacji z opcjonalnym opoznieniem.

## Automatyczne chodzenie
- **/stop** - zatrzymuje automatyczne chodzenie.
- **/dalej [opoznienie]** - wznawia wędrówkę z opcjonalnym opoznieniem.
- **/opoz _sekundy_** - ustawia domyslne opoznienie kroków.
- **/szybciej** - zmniejsza opoznienie o 0.5 s.
- **/wolniej** - zwieksza opoznienie o 0.5 s.
- **/pre_walk _komendy_** - ustawia komendy wykonywane przed każdym krokiem (rozdzielone znakiem `#`).
- **/pre_walk-** - czyści komendy pre-walk.
- **/post_walk _komendy_** - ustawia komendy wykonywane po każdym kroku (rozdzielone znakiem `#`).
- **/post_walk-** - czyści komendy post-walk.

## Notatki lokacji
- **/note** - otwiera edytor notatki dla bieżącej lokacji (tworzy nową, jeśli nie istnieje).

## Multibindy
- **/mbind _numer akcja_** - ustawia pod numerem 1-4 akcję multibinda dla bieżącej lokacji.
- **/mbind+ _akcja_** - dodaje akcję do pierwszego wolnego multibinda w bieżącej lokacji.
- **/mbind-** - usuwa wszystkie multibindy przypisane do bieżącej lokacji.
- **/mbind- _numer_** - usuwa wskazany multibind z bieżącej lokacji.
- **/mbind** - wyświetla multibindy ustawione w bieżącej lokacji.
- **/mbind _id_** - wyświetla multibindy skonfigurowane dla lokacji o podanym identyfikatorze.

## Skróty
- **/binds** - wyświetla aktualnie ustawione skróty klawiaturowe.
- **/pokaz_skroty** - wyświetla listę ustawionych skrótów.
- **/dodaj_skrot _klawisz nazwa [komenda]_** - dodaje skrót klawiaturowy.
- **/usun_skrot _nazwa_** - usuwa wskazany skrót.
- **/usun_skroty** - usuwa wszystkie skróty.
- **/tbind1 [_komenda_]** - ustawia (lub czyści, gdy bez parametru) pierwszy tymczasowy bind na podaną komendę. Komendy można rozdzielać znakiem `#`.
- **/tbind2 [_komenda_]** - ustawia (lub czyści) drugi tymczasowy bind na podaną komendę. Komendy można rozdzielać znakiem `#`.

## Wiedza
- **/zglebiaj** - wyświetla listę kategorii wiedzy dostępnych w aktualnej bibliotece, jeśli dane są dostępne.
- **/biblioteki** - wyświetla raport z bibliotek i udostępnia go w oknie raportu wiedzy.
- **/wiedza** - otwiera okno raportu wiedzy z ostatnio zapisanymi informacjami o znanych, brakujących i nieznanych wpisach.
- **/wiedza_buduj** - wykonuje zestaw komend `wiedza o ...` i aktualizuje zapisane dane raportu wiedzy dla bieżącej postaci.

## Zioła
- **/ziola_buduj** - przegląda wszystkie woreczki z ziołami i podsumowuje ich zawartość.
- **/woreczki_buduj** - ocenia stan wszystkich noszonych woreczków i zapisuje wynik w liczniku.
- **/ziola_pokaz** - wyświetla ostatnie podsumowanie ziół (bez listy woreczków).
- **/ziola** - otwiera okno zarządzania woreczkami zioł.
- **/wezz _ziolo_ [_ilosc_]** - wyjmuje wskazaną liczbę zioła z woreczków (domyślnie jedną sztukę).
- **/zi _akcja ziolo_** - wyjmuje zioło i od razu wykonuje wskazaną akcję.
- **/zi _akcja ziolo ilosc_** - wyjmuje wskazaną liczbę zioła i wykonuje akcję.

## Walka
- **/z _skrot_** - wykonuje polecenie `zabij` na obiekcie o podanym skrócie.
- **/x _skrot_** - wykonuje polecenie `zaskocz` na obiekcie o podanym skrócie.
- **/q _skrot_ lub ob_id_** - dodaje przeciwnika do kolejki ataku; przyjmuje skróty z listy obiektów lub identyfikatory w formie `ob_id`.
- **/cq** - czyści kolejkę ataku.
- **/zas _skrot_** - zasłania obiekt o podanym skrócie; jeśli nie jest w drużynie używa komendy `zaslon przed`.
- **/za _skrot_** - to samo co `/zas _skrot_`.
- **/z** - atakuje cel oznaczony jako cel ataku.
- **/x** - zaskakuje cel oznaczony jako cel ataku.
- **/nn** - atakuje następny cel z kolejki ataku.
- **/zas** - zasłania cel oznaczony jako cel obrony lub `zaslon przed`, gdy cel nie jest w drużynie.
- **/za** - to samo co `/zas`.
- **/za2 _skrot_** - zasłania obiekt z poziomem krycia 2.
- **/za3 _skrot_** - zasłania obiekt z poziomem krycia 3.
- **/za4 _skrot_** - zasłania obiekt z poziomem krycia 4.
- **/w _skrot_** - wycofuje postać za wskazany obiekt.
- **/pro _skrot_** - przekazuje prowadzenie obiektowi o podanym skrócie.
- **/prze [_skrot_]** - przełamuje obronę oznaczonego celu lub wskazanego obiektu.
- **/puszczaj** - przełącza automatyczne zwalnianie zasłony przy użyciu `/za` lub `/zas`.
- **/zap _numer_** - zaprasza do drużyny obiekt o podanym numerze.
- **/ra _id_** - rozkazuje drużynie zaatakować osobę o podanym numerze.
- **/ra** - rozkazuje drużynie zaatakować aktualny cel ataku; działa również na przełamywanie celów.
- **/rz _skrot_** - rozkazuje drużynie zasłonić obiekt o podanym skrócie.
- **/rz** - rozkazuje drużynie zasłonić aktualny cel obrony.
- **/wa _id_** - oznacza obiekt jako cel ataku.
- **/wz _skrot_** - oznacza obiekt z drużyny jako cel obrony.

## Zlecenia
- **/zlecenia** - otwiera okno z listą aktywnych zleceń od rzemieślników.

## Naprawy i ocena
- **/napraw** - Naprawianie sprzetu u kowala.
- **/naprawa** - Alias do `/napraw`.
- **/napraw_ubrania** - Naprawianie ubrania u krawca.
- **/ocen** - ocenia swoje bronie i zbroje, wypisujac jedynie ich stan.
- **/sprzet** - Alias do `/ocen`.
- **/ocenkamienie** - oblicza łączną wartość kamieni.

## Wrogowie na bindach
- **/nabindach** - wyświetla aktualnie przypisanych wrogów na bindach.
- **/nabindach--** - czyści bindy wrogów i tymczasowo je wyłącza (do zmiany lokacji).

## Języki
- **jezyki** - wyświetla zestawienie umiejętności językowych w czytelnej tabeli z kolorowymi poziomami.
- **jezyki maksymalne** - wyświetla umiejętności językowe z maksymalnymi wartościami.
