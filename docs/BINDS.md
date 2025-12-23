# Bindowanie

Rozszerzenie umozliwia ustawienie bindow do szybkiego wykonywania akcji.

## Domyslne bindy

| Klawisz | Nazwa | Akcja |
|---------|-------|-------|
| `]` | Domyslny | Akcje kontekstowe (zbieranie lupow, powtarzanie polecen) |
| `Ctrl+1` | Atakuj | Wysyla `zabij ob_ID` gdzie ID to cel ataku z GMCP |
| `Ctrl+4` | Napelnij lampe | Wysyla `napelnij lampe olejem` |
| `Ctrl+Q` | Wesprzyj | Wysyla `wesprzyj` (+ `wesprzyj ob_ID` przywodcy druzyny) |
| `` ` `` | Tryb ruchu | Zmienia tryb ruchu |

## Konfiguracja

Bindy mozna modyfikowac w zakladce **Bindowanie** na stronie opcji rozszerzenia. Mozesz tez dodac wlasne bindy wysylajace dowolne komendy.

## Komendy

| Komenda | Opis |
|---------|------|
| `/binds` | Wyswietl aktualnie ustawione bindy |

## Tymczasowe bindy

| Komenda | Opis |
|---------|------|
| `/tbind1 [komenda]` | Ustaw (lub wyczysc) pierwszy tymczasowy bind |
| `/tbind2 [komenda]` | Ustaw (lub wyczysc) drugi tymczasowy bind |

> **Wskazowka:** Komendy w bindach mozna rozdzielac znakiem `#`.
