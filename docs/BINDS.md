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

Bindy ustawiasz w oknie **Klawisze** (menu -> Klawisze). Kazda zmiana zapisuje
sie od razu, nie ma przycisku "Zapisz".

- **Rysunek klawiatury** pokazuje, co jest pod kazdym klawiszem. Zakladki nad nim
  (Bez modyfikatora, Ctrl, Alt, Shift, Ctrl+Alt) przelaczaja warstwe. Kolor mowi,
  do jakiej grupy nalezy bind (Podstawowe, Wrogowie, Tymczasowe, Kierunki, Wlasne).
- **Klikniecie klawisza na rysunku** pokazuje szczegoly: co robi, czy dziala, a
  wolnemu klawiszowi mozna od razu przypisac komende.
- **Zmiana klawisza:** kliknij klawisz na liscie pod rysunkiem i nacisnij nowy.
  Esc anuluje, Backspace czysci. Mozna tez kliknac klawisz na rysunku.
- **Konflikt:** dwa bindy na jednym klawiszu swieca na czerwono; nacisniecie
  uruchamia oba naraz. Okno podpowiada wolne klawisze w poblizu - klikniecie
  przenosi tam bind.
- **Wlasne** - "+ Komenda" dodaje skrot wysylajacy dowolna komende.
- **Kierunki** - "Uzyj strzalek" przenosi N/S/W/E na strzalki (i z powrotem).
- **Tryby chodzenia** (pod Kierunkami) - kazdy tryb dostaje modyfikator (Ctrl,
  Alt, Shift), ktory trzymany z dowolnym klawiszem kierunku idzie tym trybem.
  Np. Alt dla "Przemknij" sprawia, ze Alt+Num8 wysyla `przemknij n`. Nie trzeba
  bindowac kazdego kierunku osobno, a przeniesienie kierunkow na strzalki
  przenosi tez tryby. Wtyczki moga dodac wlasne tryby (`api.walkModes.register`),
  ktore pojawiaja sie na tej samej liscie. Modyfikator, ktorego juz uzywaja same
  Kierunki (np. Shift+strzalki), jest wyszarzony - trybom zostaja pozostale. Na
  macOS Ctrl+strzalki zajmuje system (Mission Control), wiec tryb na Ctrl przy
  kierunkach na strzalkach jest oznaczony jako kolizja. Przelacznik trybu ruchu (`` ` ``) dziala
  jak dotad, niezaleznie od tych modyfikatorow.
- W menu `...`: nowa mapa klawiszy, zmiana nazwy, import bazy multibindow,
  przywrocenie domyslnych bindow, usuniecie mapy.

### Klawisze zajete przez przegladarke i helper

Niektorych skrotow przegladarka nie oddaje stronie (np. `Ctrl+W` zamyka karte,
`Ctrl+T` otwiera nowa). Na rysunku sa kreskowane. Mozna je przypisac klikajac na
rysunku - obsluzy je wtedy **Arkadia Helper**, gdy jest polaczony. Przy skrocie
obslugiwanym przez helpera wybierasz, gdzie dziala:

- **w kliencie, przez helpera** - gdy okno klienta jest aktywne,
- **wszedzie** - takze gdy grasz w innym oknie (opcjonalnie z przywolaniem okna klienta).

### Gdzie dziala - jeden przelacznik

Kazdy bind ma jedno ustawienie. Kliknij go na liscie (albo jego klawisz na
rysunku) i w panelu obok wybierz **gdzie dziala**:

- **w kliencie** - zwyklny bind klienta;
- **przez helpera** - klawisz lapie helper, dzieki czemu dziala tez wtedy, gdy
  przegladarka go nie oddaje (`Ctrl+W`);
- **wszedzie** - dziala takze wtedy, gdy grasz w innym oknie; opcjonalnie
  z przywolaniem okna klienta.

Pod spodem "wszedzie" to ten sam klawisz zarejestrowany dodatkowo w helperze,
ale nie musisz o tym wiedziec: na liscie jest **jeden wiersz** z ikona
(wtyczka/globus), a przelacznik dodaje i zdejmuje te druga rejestracje za
ciebie. Zmiana klawisza albo komendy przestawia oba naraz, usuniecie - usuwa
oba. Helper **polyka** taki klawisz, wiec nacisniecie robi jedna rzecz: wersje
helpera, gdy helper chodzi, a bind klienta, gdy nie chodzi. To nie jest
konflikt - konflikt to dopiero dwa rozne bindy po tej samej stronie.

Wlasne skroty na klawiszach zajetych przez przegladarke tez sa zwyklymi wpisami
na liscie **Wlasne** - po prostu slucha ich helper.

Nowy wlasny skrot dodajesz na dwa sposoby:

- **"+ Komenda"** - zwykly skrot klienta: wpisujesz komende, potem klikasz pole
  klawisza i naciskasz klawisz;
- **"+ Komenda przez helpera"** - od razu globalny: najpierw naciskasz klawisz
  (bo hotkey rejestruje sie po klawiszu), potem wpisujesz komende.

Wszystko edytujesz na miejscu: komende w polu obok klawisza, klawisz klikajac
go i naciskajac nowy, a "gdzie dziala" w panelu po prawej. Wolny klawisz
wybrany na rysunku ma przycisk "Przypisz komende" - robi wiersz od razu na tym
klawiszu.

Czerwony kosz w panelu **zdejmuje klawisz** z wbudowanej funkcji (zostaje bez
klawisza) albo usuwa wlasny skrot.

Kazda wbudowana funkcja moze tez dostac **inny, drugi klawisz** przez helpera,
np. globalny - przycisk jest w panelu pod lista przypisan.

Lista **"Obslugiwane przez helpera"** na dole okna zbiera wszystkie takie skroty:
tam zmieniasz ich komendy i klawisze, dodajesz nowe ("+ Komenda") i usuwasz je.
Jest tam tez "+ Przywolaj okno klienta" - skrot, ktory tylko wyciaga okno klienta
na wierzch. Tak samo dziala opcja "wszedzie + okno" przy kazdym skrocie: helper
odnajduje okno po tytule karty klienta i przelacza sie na nie.

Karty to granica, ktorej nie da sie przeskoczyc: identyfikatory kart ma tylko
rozszerzenie przegladarki, a tytul okna to tytul jego **aktywnej** karty. Gdy
klient siedzi w karcie w tle, nic go nie wskazuje i helper swiadomie nie
podnosi nic (lepsze to niz wyciagniecie przypadkowego okna). Sa dwa wyjscia:

- **Zainstaluj klienta jako aplikacje** (menu przegladarki -> Zainstaluj) -
  dostanie wlasne okno i przywolanie zawsze trafia prosto w gre;
- albo trzymaj klienta jako aktywna karte swojego okna.

Na Linuksie przywolywanie wymaga X11 oraz `xdotool` albo `wmctrl`, a na macOS -
uprawnienia Dostepnosc. Gdy helper jest polaczony, klawisz mozna po prostu nacisnac (slucha
helper, przegladarka nic nie dostaje); gdy nie jest - wskaz klawisz na rysunku.

Strona **Ustawienia -> Arkadia Helper** sluzy juz tylko do pobrania i uruchomienia
aplikacji; same skroty ustawiasz tutaj.

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
