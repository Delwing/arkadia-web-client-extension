# Aliasy

Poniższa lista opisuje dostępne aliasy w rozszerzeniu:

Możliwe jest także tworzenie własnych aliasów w ustawieniach klienta. Wzorzec jest wyrażeniem regularnym, a w komendzie można używać `$1`, `$2` itd. aby odwołać się do odpowiednich grup z dopasowania. Można też korzystać ze skrótów obiektów (np. `@1`, `@A`, `@@`), które zostaną zamienione na identyfikatory obiektów.

## Ogólne
- **/fake _tekst_** - wyświetla podany tekst jak zwykłą wiadomość klienta.
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
- **/list** - otwiera edytor pisania listów w kliencie.

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

## Zbieranie łupów
- **/zbieraj_extra _przedmiot_** - dodaje przedmiot do listy ekstra rzeczy zbieranych z ciał.
- **/nie_zbieraj_extra [_przedmiot_]** - usuwa wskazany przedmiot z listy ekstra lub bez parametru czyści całą listę.

## Prowadzenie i ruch
- **/cofnij** - cofa postać do poprzedniego pomieszczenia na mapie.
- **/move _kierunek_** - przesuwa postać w wybranym kierunku.
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

## Skróty
- **/binds** - wyświetla aktualnie ustawione skróty klawiaturowe.
- **/pokaz_skroty** - wyświetla listę ustawionych skrótów.
- **/dodaj_skrot _klawisz nazwa [komenda]_** - dodaje skrót klawiaturowy.
- **/usun_skrot _nazwa_** - usuwa wskazany skrót.
- **/usun_skroty** - usuwa wszystkie skróty.

## Zioła
- **/ziola_buduj** - przegląda wszystkie woreczki z ziołami i podsumowuje ich zawartość.
- **/ziola_pokaz** - wyświetla ostatnie podsumowanie ziół (bez listy woreczków).
- **/wezz _ziolo_ [_ilosc_]** - wyjmuje wskazaną liczbę zioła z woreczków (domyślnie jedną sztukę).
- **/zi _akcja ziolo_** - wyjmuje zioło i od razu wykonuje wskazaną akcję.

## Walka
- **/z _skrot_** - wykonuje polecenie `zabij` na obiekcie o podanym skrócie.
- **/zas _skrot_** - zasłania obiekt o podanym skrócie; jeśli nie jest w drużynie używa komendy `zaslon przed`.
- **/za _skrot_** - to samo co `/zas _skrot_`.
- **/z** - atakuje cel oznaczony jako cel ataku.
- **/zas** - zasłania cel oznaczony jako cel obrony lub `zaslon przed`, gdy cel nie jest w drużynie.
- **/za** - to samo co `/zas`.
- **/za2 _skrot_** - zasłania obiekt z poziomem krycia 2.
- **/za3 _skrot_** - zasłania obiekt z poziomem krycia 3.
- **/za4 _skrot_** - zasłania obiekt z poziomem krycia 4.
- **/w _skrot_** - wycofuje postać za wskazany obiekt.
- **/pro _skrot_** - przekazuje prowadzenie obiektowi o podanym skrócie.
- **/prze** - przełamuje obronę oznaczonego celu.
- **/puszczaj** - przełącza automatyczne zwalnianie zasłony przy użyciu `/za` lub `/zas`.
- **/zap** - wykonuje polecenie `zapal lampe`.
- **/zap _numer_** - zaprasza do drużyny obiekt o podanym numerze.
- **/zg** - wykonuje polecenie `zgas lampe`.
- **/ra _id_** - rozkazuje drużynie zaatakować osobę o podanym numerze.
- **/ra** - rozkazuje drużynie zaatakować aktualny cel ataku; działa również na przełamywanie celów.
- **/rz _skrot_** - rozkazuje drużynie zasłonić obiekt o podanym skrócie.
- **/rz** - rozkazuje drużynie zasłonić aktualny cel obrony.
- **/wa _id_** - oznacza obiekt jako cel ataku.
- **/wz _skrot_** - oznacza obiekt z drużyny jako cel obrony.

## Naprawy i ocena
- **/napraw** - Naprawianie sprzetu u kowala.
- **/naprawa** - Alias do `/napraw`.
- **/napraw_ubrania** - Naprawianie ubrania u krawca.
- **/ocen** - ocenia swoje bronie i zbroje, wypisujac jedynie ich stan.
- **/sprzet** - Alias do `/ocen`.
- **/ocenkamienie** - oblicza łączną wartość kamieni.
