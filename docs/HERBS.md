# Licznik ziół

Moduł licznika ziół pozwala zliczyć zawartość wszystkich noszonych woreczków z ziołami i zapisać te dane w pamięci przeglądarki. Dzięki temu możesz łatwo sprawdzić posiadane zioła oraz szybko je wyjmować.

## Użycie

1. Użyj aliasu `/ziola_buduj`, aby przeglądnąć woreczki i zapisać ich zawartość.
2. Alias `/ziola_pokaz` wyświetla ostatnie podsumowanie ziół (bez listy woreczków).
3. Alias `/ziola` otwiera okno pozwalające zarządzać woreczkami zioł.
4. Za pomocą `/wezz nazwa [ilosc]` wyjmiesz wskazane zioło z woreczków. Jeśli ilość nie zostanie podana, domyślnie wyjmowana jest jedna sztuka.
5. Polecenie `/zi akcja nazwa` wyjmuje zioło i wykonuje podaną akcję.
6. Alias `/woreczki_buduj` ocenia stan wszystkich woreczków i aktualizuje podgląd w menedżerze ziół.

W ustawieniach skryptów można zdefiniować komendy wykonywane przed i po użyciu ziół. Wiele komend należy oddzielić średnikiem (`;`).

Informacje o zliczonych ziołach są przechowywane w pamięci przeglądarki osobno dla każdej postaci i wczytywane po ponownym uruchomieniu klienta.
