# Bindowanie

Rozszerzenie umożliwia ustawienie kilku skrótów klawiaturowych. Domyślne bindy to:

- **Domyślny** – klawisz `]` (BracketRight). Używany do wykonywania akcji kontekstowych, np. zbierania łupów z ciała czy powtarzania poleceń pojawiających się w komunikatach.
- **Atakuj** – `CTRL+1`. Skrót wysyła komendę `zabij ob_ID`, gdzie `ID` to identyfikator celu ataku z GMCP.
- **Napełnij lampę** – `CTRL+4`. Skrót wysyła komendę `napelnij lampe olejem`.
- **Wesprzyj** – `CTRL+Q`. Skrót wysyła komendę `wesprzyj`. Jeśli drużyna ma
  przywódcę, wysyła dodatkowo `wesprzyj ob_ID`, gdzie `ID` to identyfikator
  przywódcy z GMCP.
- **Tryb ruchu** – `` ` `` (domyślnie). Skrót zmienia tryb ruchu.

Bindy można modyfikować w zakładce **Bindowanie** na stronie opcji rozszerzenia.
Możesz także dodać własne skróty, które wyślą dowolną komendę.
Aktualnie ustawione skróty możesz też wypisać w grze komendą `/binds`.

## Ręczne testy importu multibindów

1. Otwórz kartę **Bindowanie** w opcjach rozszerzenia i kliknij przycisk importu multibindów.
2. Wskaż poprawną bazę `multibinds.sqlite` – po krótkiej chwili powinno pojawić się podsumowanie importu. Parsowanie odbywa się w tle w osobnym wątku (workerze), więc interfejs pozostaje responsywny.
3. Aby zweryfikować obsługę błędów, spróbuj zaimportować plik, który nie zawiera tabeli `multibinds` (np. pusty plik `.sqlite`). Pojawi się komunikat o błędzie w sekcji importu.
4. Po zakończeniu testu zamknij okno importu; worker zostanie zwolniony automatycznie przy opuszczaniu widoku.
