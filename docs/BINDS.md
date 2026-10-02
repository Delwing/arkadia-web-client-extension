# Bindowanie

Rozszerzenie umożliwia ustawienie bindów do szybkiego wykonywania akcji.

## Domyślne bindy

| Klawisz | Nazwa | Akcja |
|---------|-------|-------|
| `]` | Domyślny | Akcje kontekstowe (zbieranie łupów, powtarzanie poleceń) |
| `Ctrl+1` | Atakuj | Wysyła `zabij ob_ID`, gdzie ID to cel ataku z GMCP |
| `Ctrl+4` | Napełnij lampę | Wysyła `napelnij lampe olejem` |
| `Ctrl+Q` | Wesprzyj | Wysyła `wesprzyj` (+ `wesprzyj ob_ID` przywódcy drużyny) |
| `` ` `` | Tryb ruchu | Zmienia tryb ruchu |

## Konfiguracja

Bindy ustawiasz w oknie **Klawisze** (menu -> Klawisze). Każda zmiana zapisuje
się od razu, nie ma przycisku "Zapisz".

- **Rysunek klawiatury** pokazuje, co jest pod każdym klawiszem. Zakładki nad nim
  (Bez modyfikatora, Ctrl, Alt, Shift, Ctrl+Alt) przełączają warstwę. Kolor mówi,
  do jakiej grupy należy bind (Podstawowe, Wrogowie, Tymczasowe, Multibindy, Kierunki, Własne).
- **Kliknięcie klawisza na rysunku** pokazuje szczegóły: co robi, czy działa, a
  wolnemu klawiszowi można od razu przypisać komendę.
- **Zmiana klawisza:** kliknij klawisz na liście pod rysunkiem i naciśnij nowy.
  Esc anuluje, Backspace czyści. Można też kliknąć klawisz na rysunku.
- **Konflikt:** dwa bindy na jednym klawiszu świecą na czerwono; naciśnięcie
  uruchamia oba naraz. Okno podpowiada wolne klawisze w pobliżu - kliknięcie
  przenosi tam bind.
- **Własne** - "+ Komenda" dodaje skrót wysyłający dowolną komendę.
- **Tymczasowe** - "+ Tymczasowy" dodaje kolejny tymczasowy bind (`/tbind3`, `/tbind4`...),
  kosz przy ostatnim go usuwa.
- **Multibindy** - domyślnie cztery sloty (Alt+1..4). "+ Multibind" dodaje kolejny
  (do 20), kosz przy ostatnim go usuwa. Slot bez klawisza nadal widać na pasku
  multibindów, tylko bez podpowiedzi klawisza - działa po kliknięciu. `/mbind`
  przyjmuje numery wszystkich slotów.
- **Kierunki** - "Użyj strzałek" przenosi N/S/W/E na strzałki (i z powrotem).
- **Tryby chodzenia** (pod Kierunkami) - każdy tryb dostaje modyfikator (Ctrl,
  Alt, Shift), który trzymany z dowolnym klawiszem kierunku idzie tym trybem.
  Np. Alt dla "Przemknij" sprawia, że Alt+Num8 wysyła `przemknij n`. Nie trzeba
  bindować każdego kierunku osobno, a przeniesienie kierunków na strzałki
  przenosi też tryby. Wtyczki mogą dodać własne tryby (`api.walkModes.register`),
  które pojawiają się na tej samej liście. Modyfikator, którego już używają same
  Kierunki (np. Shift+strzałki), jest wyszarzony - trybom zostają pozostałe. Na
  macOS Ctrl+strzałki zajmuje system (Mission Control), więc tryb na Ctrl przy
  kierunkach na strzałkach jest oznaczony jako kolizja. Przełącznik trybu ruchu (`` ` ``) działa
  jak dotąd, niezależnie od tych modyfikatorów.
- W menu `...`: nowa mapa klawiszy, zmiana nazwy, import bazy multibindów,
  przywrócenie domyślnych bindów, usunięcie mapy.

### Klawisze zajęte przez przeglądarkę i helper

Niektórych skrótów przeglądarka nie oddaje stronie (np. `Ctrl+W` zamyka kartę,
`Ctrl+T` otwiera nową). Na rysunku są kreskowane. Można je przypisać, klikając na
rysunku - obsłuży je wtedy **Arkadia Helper**, gdy jest połączony. Przy skrócie
obsługiwanym przez helpera wybierasz, gdzie działa:

- **w kliencie, przez helpera** - gdy okno klienta jest aktywne,
- **wszędzie** - także gdy grasz w innym oknie (opcjonalnie z przywołaniem okna klienta).

### Gdzie działa - jeden przełącznik

Każdy bind ma jedno ustawienie. Kliknij go na liście (albo jego klawisz na
rysunku) i w panelu obok wybierz **gdzie działa**:

- **w kliencie** - zwykły bind klienta;
- **przez helpera** - klawisz łapie helper, dzięki czemu działa też wtedy, gdy
  przeglądarka go nie oddaje (`Ctrl+W`);
- **wszędzie** - działa także wtedy, gdy grasz w innym oknie; opcjonalnie
  z przywołaniem okna klienta.

Pod spodem "wszędzie" to ten sam klawisz zarejestrowany dodatkowo w helperze,
ale nie musisz o tym wiedzieć: na liście jest **jeden wiersz** z ikoną
(wtyczka/globus), a przełącznik dodaje i zdejmuje tę drugą rejestrację za
ciebie. Zmiana klawisza albo komendy przestawia oba naraz, usunięcie - usuwa
oba. Helper **połyka** taki klawisz, więc naciśnięcie robi jedną rzecz: wersję
helpera, gdy helper chodzi, a bind klienta, gdy nie chodzi. To nie jest
konflikt - konflikt to dopiero dwa różne bindy po tej samej stronie.

Własne skróty na klawiszach zajętych przez przeglądarkę też są zwykłymi wpisami
na liście **Własne** - po prostu słucha ich helper.

Nowy własny skrót dodajesz na dwa sposoby:

- **"+ Komenda"** - zwykły skrót klienta: wpisujesz komendę, potem klikasz pole
  klawisza i naciskasz klawisz;
- **"+ Komenda przez helpera"** - od razu globalny: najpierw naciskasz klawisz
  (bo hotkey rejestruje się po klawiszu), potem wpisujesz komendę.

Wszystko edytujesz na miejscu: komendę w polu obok klawisza, klawisz, klikając
go i naciskając nowy, a "gdzie działa" w panelu po prawej. Wolny klawisz
wybrany na rysunku ma przycisk "Przypisz komendę" - robi wiersz od razu na tym
klawiszu.

Czerwony kosz w panelu **zdejmuje klawisz** z wbudowanej funkcji (zostaje bez
klawisza) albo usuwa własny skrót.

Każda wbudowana funkcja może też dostać **inny, drugi klawisz** przez helpera,
np. globalny - przycisk jest w panelu pod listą przypisań.

Lista **"Obsługiwane przez helpera"** na dole okna zbiera wszystkie takie skróty:
tam zmieniasz ich komendy i klawisze, dodajesz nowe ("+ Komenda") i usuwasz je.
Jest tam też "+ Przywołaj okno klienta" - skrót, który tylko wyciąga okno klienta
na wierzch. Tak samo działa opcja "wszędzie + okno" przy każdym skrócie: helper
odnajduje okno po tytule karty klienta i przełącza się na nie.

Karty to granica, której nie da się przeskoczyć: identyfikatory kart ma tylko
rozszerzenie przeglądarki, a tytuł okna to tytuł jego **aktywnej** karty. Gdy
klient siedzi w karcie w tle, nic go nie wskazuje i helper świadomie nie
podnosi nic (lepsze to niż wyciągnięcie przypadkowego okna). Są dwa wyjścia:

- **Zainstaluj klienta jako aplikację** (menu przeglądarki -> Zainstaluj) -
  dostanie własne okno i przywołanie zawsze trafia prosto w grę;
- albo trzymaj klienta jako aktywną kartę swojego okna.

Na Linuksie przywoływanie wymaga X11 oraz `xdotool` albo `wmctrl`, a na macOS -
uprawnienia Dostępność. Gdy helper jest połączony, klawisz można po prostu nacisnąć (słucha
helper, przeglądarka nic nie dostaje); gdy nie jest - wskaż klawisz na rysunku.

Strona **Ustawienia -> Arkadia Helper** służy już tylko do pobrania i uruchomienia
aplikacji; same skróty ustawiasz tutaj.

## Komendy

| Komenda | Opis |
|---------|------|
| `/binds` | Wyświetl aktualnie ustawione bindy |

## Tymczasowe bindy

| Komenda | Opis |
|---------|------|
| `/tbind1 [komenda]` | Ustaw (lub wyczyść) pierwszy tymczasowy bind |
| `/tbind2 [komenda]` | Ustaw (lub wyczyść) drugi tymczasowy bind |
| `/tbindN [komenda]` | Ustaw (lub wyczyść) N-ty tymczasowy bind |

Domyślnie są dwa tymczasowe bindy (F4, F5). W oknie **Klawisze**, w grupie
Tymczasowe, "+ Tymczasowy" dodaje kolejny (do 20), a kosz przy ostatnim go usuwa.
Tymczasowy bind bez klawisza nadal pamięta komendę - można go wywołać skrótem
helpera.

> **Wskazówka:** Komendy w bindach można rozdzielać znakiem `#`.

## Własne przyciski przy linii komend

Zamiast pamiętać bind, można mieć przycisk. W **Ustawieniach -> Stopka ->
"Przyciski przy linii komend"** dodajesz własne przyciski: napis, komenda do
wysłania (zwykła komenda, alias, cokolwiek przyjmuje linia komend), kolor
(zwykły, wyróżniony, czerwony) i - opcjonalnie - nazwa stanu.

Na komputerze przyciski stoją obok pola komend, między "Wyślij" a menu; to, co
się nie mieści, chowa się pod własnym "...". Na telefonie zwinięta stopka ich nie
pokazuje (to jedna linia stanu), a rozwinięta pokazuje je jako siatkę dużych
kafelków, zakończoną kafelkiem `+`, który otwiera te ustawienia.

Przycisk z nazwą stanu świeci się (wypełnienie i kropka), gdy ten stan jest
włączony - tak działa np. "Tryb: podróż".

| Komenda | Opis |
|---------|------|
| `/przycisk nazwa on` | Zapal przyciski o tym stanie (`wl` działa tak samo) |
| `/przycisk nazwa off` | Zgaś je (`wyl` działa tak samo) |
| `/przycisk nazwa` | Przełącz |

Stan można więc włączać z triggera albo skryptu. Wtyczki mają do tego własne
API: `api.ui.registerFooterButton(id, { label, command, tone, state })` dodaje
przycisk (rysowany przerywaną ramką, jak plakietki wtyczek), a
`api.ui.setFooterButtonState(nazwa, on)` zapala i gasi stan.
