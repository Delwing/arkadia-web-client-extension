# Połączenie z grą

Klient może łączyć się z Arkadią na trzy sposoby. Tryb wybierasz na ekranie logowania, w sekcji **Połączenie**: **Bezpośrednio**, **Pomocnik** albo **Proxy**. Wybór jest zapamiętywany na urządzeniu.

## Który tryb wybrać

| Tryb | Kiedy | Co trzeba mieć |
|------|-------|----------------|
| **Bezpośrednio** | Komputer, karta klienta zawsze otwarta | Nic - działa od razu |
| **Pomocnik** | Komputer z zainstalowanym Arkadia Helper | Uruchomiony pomocnik na tym komputerze |
| **Proxy** | Telefon, tablet, słaby zasięg, częste przełączanie kart | Nic - domyślny serwer proxy działa od ręki |

> Grasz na telefonie? Wybierz **Proxy**. Telefon zamraża kartę w tle już po kilku minutach i w trybie bezpośrednim zrywa to połączenie - z proxy postać zostaje w grze, a po powrocie widzisz wszystko, co się działo.

## Bezpośrednio

![Przeglądarka łączy się prosto z serwerem Arkadii](img/polaczenia/bezposrednio.svg)

Domyślny tryb. Karta przeglądarki łączy się prosto z serwerem gry, tak jak oficjalny klient webowy - bez żadnych pośredników.

- Nic nie trzeba instalować ani konfigurować.
- Połączenie żyje w karcie: gdy przeglądarka ją zamrozi (telefon w kieszeni, karta długo w tle), zamkniesz ją albo stracisz zasięg, połączenie się zrywa i trzeba zalogować się ponownie.

## Pomocnik

![Przeglądarka łączy się z pomocnikiem na tym samym komputerze, a pomocnik z serwerem Arkadii](img/polaczenia/pomocnik.svg)

Klient łączy się z **Arkadia Helper** - małą aplikacją uruchomioną na tym samym komputerze - a pomocnik łączy się z grą zwykłym telnetem, jak klasyczne klienty MUD.

- Pomocnik musi być zainstalowany i uruchomiony. Jeśli nie odpowiada, ekran logowania pokaże ostrzeżenie z przyciskiem **Uruchom pomocnika**, a gdy go nie ma - z linkiem do pobrania i instrukcją instalacji.
- Ruch do gry idzie z twojego komputera, z pominięciem webowego wejścia do Arkadii.
- Pomocnik niczego nie przechowuje: zamknięcie karty kończy połączenie tak samo jak w trybie bezpośrednim.
- Ten sam pomocnik obsługuje globalne skróty klawiszowe i przywoływanie okna klienta - zobacz **Bindowanie**.

## Proxy

![Przeglądarka łączy się z serwerem proxy, który trzyma stałe połączenie z Arkadią](img/polaczenia/proxy.svg)

Połączenie z grą trzyma serwer proxy, a nie karta przeglądarki. Karta łączy się z proxy i może się od niego odłączać bez szkody dla postaci.

![Gdy karta jest zamrożona, proxy zbiera tekst z gry i oddaje go po powrocie](img/polaczenia/wznowienie.svg)

- **Przerwy nie zrywają sesji** - gdy karta zostanie zamrożona, przeładowana albo stracisz zasięg, postać dalej jest w grze. Proxy zbiera w tym czasie tekst z gry.
- **Powrót bez logowania** - klient sam łączy się ponownie z proxy i odtwarza wszystko, co przyszło w czasie przerwy, z prawdziwymi godzinami zdarzeń (liczniki, czasy i postępy liczą się poprawnie).
- **Do 35 minut** - tyle proxy czeka na powrót karty. To trochę dłużej niż limit bezczynności samej Arkadii, więc po dłuższej przerwie zobaczysz komunikat gry o rozłączeniu, a nie zgadujesz, co się stało.
- **Bufor** - proxy trzyma do ok. 2 MB tekstu (wystarcza na długie przerwy). Jeśli przerwa była dłuższa i część tekstu przepadła, klient o tym poinformuje.
- **Jedna karta = jedna sesja** - każda karta ma własną sesję. Zamknięcie karty, zmiana strony albo przycisk rozłączenia kończą sesję od razu, więc postać nie stoi w grze bez opieki.

### Ustawienia proxy

Ikona suwaków obok wyboru trybu otwiera ustawienia:

- **Adres proxy** - puste pole oznacza domyślny serwer. Możesz wpisać adres własnego proxy.
- **Informuj o wznowieniu połączenia** - po powrocie klient wypisze, że połączenie zostało wznowione.
- **Jak postawić własne proxy** - instrukcja uruchomienia proxy na własnym serwerze. Potrzebny jest serwer, domena i dostęp przez SSH; domyślne proxy działa bez tego.

## Kompresja MCCP

Opcja **Kompresja MCCP** w ustawieniach połączenia (domyślnie włączona) każe serwerowi gry kompresować przesyłany tekst - mniej danych, co ma znaczenie na telefonie.

W trybie proxy klient nie używa MCCP bezpośrednio, bo kompresji nie da się wznowić w połowie sesji. Zamiast tego kompresję z grą prowadzi samo proxy, a połączenie z kartą jest kompresowane osobno - oba odcinki są skompresowane, a wznawianie działa.

## Hasło

Klient nie zapisuje hasła postaci. Formularz logowania jest zwykłym formularzem, więc menedżer haseł przeglądarki może je zapamiętać i uzupełniać - to ustawienie przeglądarki, nie klienta. Hasło wpisane później w linię komend (gdy gra o nie prosi) nie trafia do historii komend.
