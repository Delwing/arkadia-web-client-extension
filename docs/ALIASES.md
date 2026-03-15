# Inne aliasy

Pozostale aliasy i funkcje rozszerzenia.

## Wlasne aliasy

Mozesz tworzyc wlasne aliasy w ustawieniach klienta:
- **Wzorzec** - wyrazenie regularne dopasowujace komende
- **Komenda** - tekst wysylany do serwera, moze uzywac `$1`, `$2` itp. dla grup z dopasowania
- **Skroty obiektow** - `@1`, `@A`, `@@` zostana zamienione na identyfikatory obiektow

## Komunikacja

| Komenda | Opis |
|---------|------|
| `/fake tekst` | Wyswietl podany tekst jak zwykle wiadomosc klienta |
| `/chat` | Wyswietl ostatnie 20 wiadomosci z czatu GMCP |
| `/chatw` lub `/chat okno` | Otworz okno czatu z historia 100 wiadomosci |
| `/list` | Otworz edytor pisania listow w kliencie |
| `/poczta` | Otworz okno poczty z lista listow |

> **Wskazowka:** W oknie czatu przycisk "Druzyna" filtruje wiadomosci od czlonkow druzyny.

## Czas

| Komenda | Opis |
|---------|------|
| `/czas` | Otworz okno zegara z aktualnym czasem w grze |
| `/czas imperium <godzina> [<dzien>]` | Ustaw czas w Imperium (godzina 0-23, opcjonalnie dzien roku 1-400) |
| `/czas ishtar <godzina> [<dzien>]` | Ustaw czas w Ishtar (godzina 0-23, opcjonalnie dzien roku 1-360) |

> **Wskazowka:** Czas mozna rowniez ustawic w oknie zegara - wybierz godzine, miesiac i dzien, a nastepnie kliknij "Ustaw".

## Jezyk

| Komenda | Opis |
|---------|------|
| `justaw jezyk` | Ustaw jezyk rozmow (np. `justaw krasnoludzki`) |
| `'tekst` | Mow w ustawionym jezyku (pojedynczy apostrof przed tekstem) |

## Druzyna

| Komenda | Opis |
|---------|------|
| `/ostatnio` | Sprawdz aktywnosc czlonkow druzyny (zielony = aktywny, czerwony = nieaktywny) |

## Przedstawieni

| Komenda | Opis |
|---------|------|
| `/przedstawieni` | Wyswietl liste przedstawionych postaci |

## Bindy

| Komenda | Opis |
|---------|------|
| `/binds` | Wyswietl liste skonfigurowanych bindow |

## Dzwiek

| Komenda | Opis |
|---------|------|
| `/sounds` | Przelacz wyciszenie/wlaczenie dzwiekow |
| `/mute` | Wycisz dzwieki |
| `/unmute` | Wlacz dzwieki |

## Przyplyw

| Komenda | Opis |
|---------|------|
| `/przyplyw` | Przelacz system przyplywow (zmienia mape: pokoje przybrzezne przesuwaja sie pod wode, tworza sie pokoje na powierzchni) |

> **Wskazowka:** System przyplywow aktywuje sie i dezaktywuje rowniez automatycznie na podstawie komunikatow w grze, gdy znajdujesz sie w strefie przyplywow.

## Dobywanie/Opuszczanie

| Komenda | Opis |
|---------|------|
| `/dob` | Wykonaj komendy dobywania ze slotow 1 i 2 |
| `/dob [1-3]` | Wykonaj komende dobywania z wybranego slotu |
| `/op` | Wykonaj komendy opuszczania ze slotow 1 i 2 |
| `/op [1-3]` | Wykonaj komende opuszczania z wybranego slotu |

> **Konfiguracja:** Komendy konfiguruje sie w ustawieniach postaci w sekcji "Dobywanie/Opuszczanie". Kazdy slot moze zawierac wiele komend oddzielonych srednikiem (;).

## Kalendarz slonca

| Komenda | Opis |
|---------|------|
| `/slonce` | Otworz kalendarz slonca z obserwacjami wschodow i zachodow |

## Kolorowanie

| Komenda | Opis |
|---------|------|
| `/tcolor fraza` | Dodaje tymczasowe kolorowanie frazy na pomaranczowo (tylko na czas sesji) |

> **Wskazowka:** Mozna wywolywac wielokrotnie, aby kolorowac wiele fraz jednoczesnie. Kolorowanie znika po zakonczeniu sesji.

## Lowienie ryb

| Komenda | Opis |
|---------|------|
| `/wedka` | Otworz okno lowienia ryb z wyborem przynety i przyciskami akcji |

> **Wskazowka:** Gdy ryba bierze, kliknij przycisk "Zatnij rybe" lub uzyj funkcjonalnego bindu (domyslnie `]`).
