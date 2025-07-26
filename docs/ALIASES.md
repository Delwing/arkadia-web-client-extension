# Aliasy

Poniższa lista opisuje dostępne aliasy w rozszerzeniu:

Możliwe jest także tworzenie własnych aliasów w ustawieniach klienta. Wzorzec jest wyrażeniem regularnym, a w komendzie można używać `$1`, `$2` itd. aby odwołać się do odpowiednich grup z dopasowania.

## Ogólne
- **/fake _tekst_** - wyświetla podany tekst jak zwykłą wiadomość klienta.
- **/zabici** - pokazuje tabelę z liczbą twoich zabitych istot w bieżącej sesji.
- **/zabici2** - wyświetla podsumowanie liczby zabitych istot.
- **/cechy** - uruchamia licznik poziomowania i wyświetla postępy.
- **/postepy** - wyświetla postępy ulepszeń.
- **/przejrzyj** - pokazuje zawartość skrzyń z kluczami i magicznymi przedmiotami.
- **/por [_skrot_]** - porównuje siłę, zręczność i wytrzymałość z podanym obiektem lub wszystkimi w pomieszczeniu.

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
- **/ziola_pokaz** - wyświetla ostatnie podsumowanie ziół.
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
- **/prze** - przełamuje obronę oznaczonego celu.
- **/puszczaj** - przełącza automatyczne zwalnianie zasłony przy użyciu `/za` lub `/zas`.
- **/zap** - wykonuje polecenie `zapal lampe`.
- **/zap _numer_** - zaprasza do drużyny obiekt o podanym numerze.
- **/zg** - wykonuje polecenie `zgas lampe`.

## Naprawy i ocena
- **/napraw** - Naprawianie sprzetu u kowala.
- **/naprawa** - Alias do `/napraw`.
- **/napraw_ubrania** - Naprawianie ubrania u krawca.
- **/ocenkamienie** - oblicza łączną wartość kamieni.
