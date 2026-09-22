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

## Wlasne przyciski przy linii komend

Zamiast pamietac bind, mozna miec przycisk. W **Ustawieniach -> Stopka ->
"Przyciski przy linii komend"** dodajesz wlasne przyciski: napis, komenda do
wyslania (zwykla komenda, alias, cokolwiek przyjmuje linia komend), kolor
(zwykly, wyrozniony, czerwony) i - opcjonalnie - nazwa stanu.

Na komputerze przyciski stoja obok pola komend, miedzy "Wyslij" a menu; to, co
sie nie miesci, chowa sie pod wlasnym "...". Na telefonie zwinieta stopka ich nie
pokazuje (to jedna linia stanu), a rozwinieta pokazuje je jako siatke duzych
kafelkow, zakonczona kafelkiem `+`, ktory otwiera te ustawienia.

Przycisk z nazwa stanu swieci sie (wypelnienie i kropka), gdy ten stan jest
wlaczony - tak dziala np. "Tryb: podroz".

| Komenda | Opis |
|---------|------|
| `/przycisk nazwa on` | Zapal przyciski o tym stanie (`wl` dziala tak samo) |
| `/przycisk nazwa off` | Zgas je (`wyl` dziala tak samo) |
| `/przycisk nazwa` | Przelacz |

Stan mozna wiec wlaczac z triggera albo skryptu. Wtyczki maja do tego wlasne
API: `api.ui.registerFooterButton(id, { label, command, tone, state })` dodaje
przycisk (rysowany przerywana ramka, jak plakietki wtyczek), a
`api.ui.setFooterButtonState(nazwa, on)` zapala i gasi stan.
