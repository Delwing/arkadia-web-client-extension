# System Pluginów

Klient Arkadia Web wspiera zewnętrzne pluginy jako moduły ES. Pluginy mogą rozszerzyć klienta o własne funkcje takie jak triggery, aliasy i obsługę wydarzeń.

## Spis Treści

- [Struktura Pluginu](#struktura-pluginu)
- [Podstawowy Przykład](#podstawowy-przykład)
- [Kolorowanie Tekstu Triggerami](#kolorowanie-tekstu-triggerami)
- [Zaawansowane Przykłady](#zaawansowane-przykłady)
- [Dokumentacja API](#dokumentacja-api)
  - [Własne Makra Przycisków](#apibuttonmacros---własne-makra-przycisków)
  - [Własne Makra Triggerów](#apitriggermacros---własne-makra-triggerów)
- [Wygląd Interfejsu (UI)](#wygląd-interfejsu-ui)
- [Ładowanie Pluginów](#ładowanie-pluginów)
- [Typy TypeScript](#typy-typescript)
- [Pisanie Pluginu Lokalnie](#pisanie-pluginu-lokalnie)
- [Kompatybilność Wsteczna](#kompatybilność-wsteczna)

## Struktura Pluginu

Plugin to moduł ES, który eksportuje asynchroniczną funkcję `init` oraz opcjonalnie funkcję `destroy`:

```typescript
import type { PluginApi, PluginInfo } from '@arkadia/plugin-types';

/**
 * Inicjalizacja pluginu
 * @param api - API pluginu udostępniające kontrolowany dostęp do funkcji klienta
 * @returns Metadane pluginu
 */
export async function init(api: PluginApi): Promise<PluginInfo> {
  // Zarejestruj triggery, aliasy, obsługę wydarzeń, itp.

  return {
    name: "Mój Plugin",
    version: "1.0.0",
    author: "Twoje Imię",           // opcjonalne
    description: "Co robi plugin"   // opcjonalne
  };
}

/**
 * Czyszczenie przy wyładowaniu pluginu (opcjonalne)
 */
export async function destroy(): Promise<void> {
  // Usuń event listenery, wyczyść zasoby, itp.
}
```

### Stały identyfikator (`stableId`)

Plugin jest rozpoznawany po adresie, z którego go załadowano. Dane z `api.storage` i stan okien (`registerPersistentPopup`: położenie, przypięcie, ustawienia ⚙) są zapisywane pod tym adresem, więc po przeniesieniu pluginu pod inny URL zaczynałyby od zera. Żeby tego uniknąć, wyeksportuj stały identyfikator:

```typescript
export const stableId = 'jubiler';   // 1-64 znaki: litery, cyfry, '.', '_', '-'
```

Dane i okna są wtedy zapisywane pod `stableId`. Nie zmieniaj go między wersjami. Gdy inny załadowany plugin używa już tego samego `stableId`, klient go pomija (z ostrzeżeniem w konsoli) i zostaje przy adresie.

## Podstawowy Przykład

Oto minimalny plugin, który rejestruje trigger:

```typescript
import type { PluginApi, PluginInfo } from '@arkadia/plugin-types';

export async function init(api: PluginApi): Promise<PluginInfo> {
  const tag = "mojPlugin";

  // Zarejestruj prosty trigger
  api.triggers.register(
    /Zdobywasz (\d+) punktow doswiadczenia/,
    (line, matches) => {
      const xp = matches[1];
      api.output.print(`Zdobyłeś ${xp} PD!`);
      return line;
    },
    tag
  );

  return {
    name: "Anons Doświadczenia",
    version: "1.0.0",
    description: "Ogłasza zdobycie punktów doświadczenia"
  };
}
```

## Kolorowanie Tekstu Triggerami

### Przykład 1: Proste Kolorowanie Tekstu

Kolorowanie określonych słów gdy się pojawią:

```typescript
import type { PluginApi, PluginInfo } from '@arkadia/plugin-types';

export async function init(api: PluginApi): Promise<PluginInfo> {
  const tag = "highlightPlugin";

  // Zdefiniuj swój kolor używając API
  const HIGHLIGHT_COLOR = api.colors.fromHex('#ff0000'); // Czerwony

  // Funkcja pomocnicza do kolorowania tekstu w linii
  const colorStringInLine = (line: any, text: string, color: any) => {
    const matchIndex = line.text.indexOf(text);
    if (matchIndex === -1) return line;
    return line.color([matchIndex, matchIndex + text.length], color);
  };

  // Zarejestruj trigger do kolorowania słowa "ważne"
  api.triggers.register(
    /ważne/i,
    (line, matches) => {
      return colorStringInLine(line, matches[0], HIGHLIGHT_COLOR);
    },
    tag
  );

  return {
    name: "Podświetlacz Słów",
    version: "1.0.0",
    description: "Podświetla ważne słowa na czerwono"
  };
}
```

### Przykład 2: Kolorowanie Wielu Wzorców

```typescript
import type { PluginApi, PluginInfo } from '@arkadia/plugin-types';

export async function init(api: PluginApi): Promise<PluginInfo> {
  const tag = "treasureColors";

  // Predefiniowane kolory używając API
  const GOLD_COLOR = api.colors.fromHex('#ffd700');
  const SILVER_COLOR = api.colors.fromHex('#c0c0c0');
  const BRONZE_COLOR = api.colors.fromHex('#cd7f32');

  const colorStringInLine = (line: any, text: string, color: any) => {
    const matchIndex = line.text.indexOf(text);
    if (matchIndex === -1) return line;
    return line.color([matchIndex, matchIndex + text.length], color);
  };

  // Definicje wzorców
  const patterns = [
    { regex: /\bzlot[yae]\s+\w+/i, color: GOLD_COLOR },
    { regex: /\bsrebrn[yae]\s+\w+/i, color: SILVER_COLOR },
    { regex: /\bbrazow[yae]\s+\w+/i, color: BRONZE_COLOR }
  ];

  // Zarejestruj triggery dla każdego wzorca
  patterns.forEach(({ regex, color }) => {
    api.triggers.register(
      regex,
      (line, matches) => {
        return colorStringInLine(line, matches[0], color);
      },
      tag
    );
  });

  return {
    name: "Koloryzator Skarbów",
    version: "1.0.0",
    description: "Koloruje przedmioty-skarby według materiału"
  };
}
```

## Zaawansowane Przykłady

### Przykład 3: Dodawanie Prefiksu/Suffiksu

```typescript
import type { PluginApi, PluginInfo } from '@arkadia/plugin-types';

export async function init(api: PluginApi): Promise<PluginInfo> {
  const tag = "combatAlert";

  const COLOR = api.colors.fromHex("#ff6347");

  api.triggers.register(
    /Zostales zaatakowany!/i,
    (line) => {
      // Odtwórz dźwięk
      api.events.emit("sound:play", { key: "beep" });

      // Dodaj prefix i suffix z kolorem
      return line
        .prepend(`\n\n[ ALARM WALKI ] `, COLOR)
        .append("\n\n");
    },
    tag
  );

  return {
    name: "Alarm Walki",
    version: "1.0.0",
    description: "Alarmuje przy rozpoczęciu walki"
  };
}
```

### Przykład 4: Trigger z Wykonaniem Komendy

```typescript
import type { PluginApi, PluginInfo } from '@arkadia/plugin-types';

export async function init(api: PluginApi): Promise<PluginInfo> {
  const tag = "autoHealer";

  const HEALTH_COLOR = api.colors.fromHex("#ff0000");

  api.triggers.register(
    /Twoje zdrowie jest krytycznie niskie!/i,
    (line) => {
      // Wyślij komendę leczenia (nowy sposób)
      api.command.send("wypij miksture leczaca");

      // Alternatywnie: api.events.emit("sendCommand", { command: "wypij miksture leczaca" });

      // Pokoloruj i sformatuj linię
      return line
        .prepend(`\n[ AUTO-LECZENIE ] `, HEALTH_COLOR)
        .append(" >> Picie mikstury leczącej\n");
    },
    tag
  );

  return {
    name: "Auto Leczenie",
    version: "1.0.0",
    description: "Automatycznie pije mikstury leczące przy niskim zdrowiu"
  };
}
```

### Przykład 5: Wiele Triggerów ze Stanem

```typescript
import type { PluginApi, PluginInfo } from '@arkadia/plugin-types';

export async function init(api: PluginApi): Promise<PluginInfo> {
  const tag = "questTracker";

  const QUEST_COLOR = api.colors.fromHex("#00ff00");
  let questCount = 0;

  const colorStringInLine = (line: any, text: string, color: any) => {
    const matchIndex = line.text.indexOf(text);
    if (matchIndex === -1) return line;
    return line.color([matchIndex, matchIndex + text.length], color);
  };

  // Trigger dla rozpoczęcia questa
  api.triggers.register(
    /Przyjales quest: (.+)/i,
    (line, matches) => {
      questCount++;
      const questName = matches[1];
      api.output.print(`Quest rozpoczęty: ${questName} (Łącznie: ${questCount})`);
      return colorStringInLine(line, matches[0], QUEST_COLOR);
    },
    tag
  );

  // Trigger dla ukończenia questa
  api.triggers.register(
    /Ukonczyles quest: (.+)/i,
    (line, matches) => {
      const questName = matches[1];
      api.output.print(`Quest ukończony: ${questName}!`);
      return colorStringInLine(line, matches[0], QUEST_COLOR);
    },
    tag
  );

  return {
    name: "Śledzenie Questów",
    version: "1.0.0",
    description: "Śledzi i podświetla wiadomości questów"
  };
}
```

### Przykład 6: Użycie Aliasów

```typescript
import type { PluginApi, PluginInfo } from '@arkadia/plugin-types';

export async function init(api: PluginApi): Promise<PluginInfo> {
  // Dodaj aliasy do klienta
  api.aliases.register(/^\/dom$/, () => {
    api.command.send("idz do domu");
    return true; // Zatrzymaj dalsze przetwarzanie
  });

  api.aliases.register(/^\/tp (.+)$/, (matches) => {
    const destination = matches![1];
    api.command.send(`teleportuj ${destination}`);
    return true;
  });

  return {
    name: "Skróty Komend",
    version: "1.0.0",
    description: "Dodaje /dom i /tp jako skróty"
  };
}
```

### Przykład 7: Nasłuchiwanie Wydarzeń

```typescript
import type { PluginApi, PluginInfo } from '@arkadia/plugin-types';

export async function init(api: PluginApi): Promise<PluginInfo> {
  // Nasłuchuj ruchu na mapie
  api.events.on("mapMove", () => {
    const room = api.map.getRoom();
    if (room) {
      api.output.print(`Przesunięto do: ${room.name}`);
    }
  });

  // Nasłuchuj zabicia przeciwnika
  api.events.on("enemyKilled", (payload) => {
    api.output.print(`Zabito wroga: ${payload.objNum}`);
  });

  // Nasłuchuj danych GMCP
  api.events.on("gmcp", (data) => {
    console.log("GMCP:", data.path, data.value);
  });

  // Nasłuchuj konkretnej ścieżki GMCP
  api.events.on("gmcp.char.vitals", (vitals) => {
    console.log("HP/SP updated:", vitals);
  });

  return {
    name: "Event Logger",
    version: "1.0.0",
    description: "Loguje różne wydarzenia w grze"
  };
}
```

### Przykład 8: Użycie AnsiAwareBuffer

```typescript
import type { PluginApi, PluginInfo } from '@arkadia/plugin-types';

export async function init(api: PluginApi): Promise<PluginInfo> {
  const GREEN_COLOR = api.colors.fromHex('#00ff00');
  const BLUE_COLOR = api.colors.fromHex('#0000ff');
  const RED_COLOR = api.colors.fromHex('#ff0000');

  api.aliases.register(/^\/kolorowy$/, () => {
    // Stwórz nowy buffer z kolorowym tekstem
    const buffer = new api.AnsiAwareBuffer("Witaj ", GREEN_COLOR);
    buffer.append("kolorowy ", BLUE_COLOR);
    buffer.append("świecie!", RED_COLOR);

    api.output.print(buffer);
    return true;
  });

  return {
    name: "Kolorowa Komenda",
    version: "1.0.0",
    description: "Demonstracja użycia AnsiAwareBuffer"
  };
}
```

## Dokumentacja API

### PluginApi

API pluginu udostępnia następujące przestrzenie nazw:

#### `api.triggers` - System Triggerów

```typescript
// Zarejestruj trigger
api.triggers.register(
  pattern,      // RegExp | string - Wzorzec do dopasowania
  callback,     // Function(line, matches, type) - Wywołane przy dopasowaniu
  tag,          // String - Tag do grupowania/czyszczenia
  options       // Object - Opcje triggera
);

// Zarejestruj trigger jednorazowy (usuwa się po pierwszym dopasowaniu)
api.triggers.registerOneTime(pattern, callback, tag, options);

// Zarejestruj trigger tokenowy (dopasowuje całe słowa)
api.triggers.registerToken(token, callback, tag, options);

// Usuń konkretny trigger
api.triggers.remove(trigger);

// Usuń wszystkie triggery z tagiem
api.triggers.removeByTag(tag);
```

**Callback otrzymuje:**
- `line: AnsiAwareBuffer` - Obiekt linii do modyfikacji
- `matches: RegExpMatchArray` - Wyniki dopasowania regex
- `type: string` - Typ linii (np. "prompt", "info")

**Callback zwraca:**
- Zmodyfikowaną linię lub `null` aby ukryć linię

**Czekanie na linię (`waitFor`)**

`api.triggers.waitFor(wzorce, opcje)` zwraca obietnicę, która spełnia się przy pierwszej linii pasującej do któregoś wzorca. Tymczasowe triggery znikają same: po dopasowaniu, po upływie `timeout` albo po przerwaniu przez `signal`. Linia nie jest zmieniana.

```typescript
const stop = new AbortController();   // stop.abort() np. z przycisku „Stop”

api.command.send('otworz drzwi');
try {
  const r = await api.triggers.waitFor(
    [/^Otwierasz (.*)\.$/, /^Drzwi sa zamkniete na klucz\./],
    { timeout: 15000, signal: stop.signal }
  );
  if (r.index === 0) api.output.print(`Otwarte: ${r.match[1]}`);
} catch (e) {
  // e.name === 'TimeoutError' po upływie czasu, 'AbortError' po stop.abort()
}
```

Wynik: `index` (który wzorzec pasował), `match` (grupy) i `line` (tekst linii). `removeByTag(tag)` usuwa tylko triggery — oczekiwanie przerywa się sygnałem.

#### `api.output` - Wypisywanie Tekstu

```typescript
// Wypisz tekst do okna gry
api.output.print(text);  // text: string | AnsiAwareBuffer
```

#### `api.colors` - Kolory

```typescript
// Stwórz kolor z hex
const color = api.colors.fromHex('#ff0000');

// Stwórz kolor z RGB
const color = api.colors.fromRgb(255, 0, 0);
```

#### `api.aliases` - Aliasy Komend

```typescript
// Zarejestruj alias
const id = api.aliases.register(
  /^\/mojakomenda (.*)$/,
  (matches) => {
    // matches[1] zawiera przechwyconą grupę
    return true; // Zatrzymaj dalsze przetwarzanie
  }
);

// Usuń alias
api.aliases.remove(id);
```

#### `api.events` - Wydarzenia

```typescript
// Nasłuchuj wydarzenia
api.events.on(eventName, callback);

// Usuń listener
api.events.off(eventName, callback);

// Wyślij wydarzenie
api.events.emit(eventName, payload);
```

**Popularne wydarzenia:**
- `mapMove` - Przesunięcie na mapie
- `enemyKilled` - Zabicie przeciwnika
- `playerDeath` - Śmierć twojej postaci (linia `Umierasz.`), bez danych
- `command` - Wysłana komenda
- `gmcp` - Wiadomość GMCP
- `gmcp.{path}` - Konkretna ścieżka GMCP (np. `gmcp.char.vitals`)
- `sound:play` - Odtwórz dźwięk: `{ key: "beep" }`
- `tts:speak` - Przeczytaj tekst na głos (głos i tempo z ustawień gracza, milknie po „Wycisz dźwięki”): `{ text: "..." }`
- `tts:stop` - Przerwij czytanie i wyczyść kolejkę
- `sendCommand` - Wyślij komendę: `{ command: "...", echo?: boolean }`
- `notify` - Wyświetl powiadomienie: `{ text, title?, level?, time?, sticky?, progress?, actions?, key? }` (wygodniej: `api.notifications.show(...)`)

#### `api.notifications` - Powiadomienia w grze

Karty nad tekstem gry. Gracz może wyciszyć wszystkie powiadomienia wtyczek w ustawieniach, a w trybie „Nie przeszkadzać” widzi tylko ostrzeżenia i błędy.

```javascript
api.notifications.show("Zapisano");

const task = api.notifications.show({
  title: "Liczę zioła",
  text: "0 z 12",
  level: "info",            // info | success | warning | error
  sticky: true,             // zostaje, dopóki go nie zamkniesz
  progress: { value: 0, max: 12 },
  actions: [{ label: "Przerwij", command: "/stop-ziola" }],
});

task.update({ text: "5 z 12", progress: { value: 5, max: 12 } }); // w miejscu
task.repeat();   // jeszcze raz, z licznikiem ×2
task.dismiss();
```

Przycisk może zamiast `command` mieć `onClick`; po kliknięciu karta się zamyka, chyba że ustawisz `keepOpen: true`. Przy wyładowaniu wtyczki jej karty znikają.

#### `api.map` - Mapa

```typescript
// Pobierz aktualny pokój
const room = api.map.getRoom();
// room zawiera: id, name, x, y, z, areaId, exits, itp.

// Ustaw lokalizację
api.map.setLocation(roomId);

// Cofnij się do poprzedniego pokoju
api.map.stepBack();

// Pokój po internal_id (stały między wersjami mapy i zgodny z mapperem Mudleta)
const roomId = api.map.getRoomIdByInternalId('i385831173');   // albo null

// Odległość w krokach do kilku pokoi naraz (null = nie da się dojść)
const steps = api.map.getRoomDistances(api.map.getRoom()!.id, [roomId, 4121]);

// Prowadź jak „Prowadź” z mapy; clearLeadTo() kończy
api.map.leadTo(roomId);
api.map.clearLeadTo();

// Własny wpis w menu lokacji (prawy klik na mapie albo linku lokacji), w sekcji „Pluginy”
const entry = api.map.addRoomMenuEntry('Jubiler: oznacz sklep', (roomId) => { /* ... */ });
entry.setLabel('Jubiler: zmień oznaczenie');
entry.remove();
```

##### Własne rysowanie na mapie (`addOverlay`)

`api.map.addOverlay(id, { render })` pozwala narysować na mapie dowolne kształty:
koła, prostokąty, linie, wielokąty i tekst. Współrzędne są w jednostkach mapy
(jeden krok siatki = 1, pozycje pokojów bierzesz z `state.getRoom(id)`), więc
kształty skalują się i przesuwają razem z mapą.

`render(state)` jest wywoływane przy każdym przerysowaniu mapy, przy ruchu
gracza, przy zmianie wyświetlanego obszaru i po `handle.invalidate()`. Zwraca
kształt, tablicę kształtów albo nic.

```typescript
// Strzałki od aktualnego pokoju do sąsiadów
const radar = api.map.addOverlay("radar", {
  render(state) {
    if (state.currentRoomId === undefined) return;
    const room = state.getRoom(state.currentRoomId);
    if (!room || room.area !== state.areaId || room.z !== state.z) return;

    return Object.values(room.exits).flatMap((id) => {
      const next = state.getRoom(id);
      if (!next || next.area !== room.area || next.z !== room.z) return [];
      return [{
        type: "line",
        points: [room.x, room.y, next.x, next.y],
        paint: { stroke: "#00ff00", strokeWidth: state.settings.lineWidth * 2 },
        lineCap: "round",
      }];
    });
  },
});

radar.invalidate(); // przerysuj po zmianie własnych danych
radar.remove();     // usuń z mapy
```

- `state` zawiera `currentRoomId`, `areaId`, `z` (wyświetlany obszar i poziom),
  `getRoom(id)` oraz `settings` - bieżące ustawienia renderera mapy
  (`MapRenderer.Settings`, tylko do odczytu), np. `lineWidth` (grubość linii
  wyjść), `roomSize`, `lineColor`, `roomShape`. Rozmiary są w jednostkach mapy -
  użyj ich, żeby rysunek pasował do mapy. Pomijanie pokojów z innego
  obszaru/poziomu należy do overlaya.
- Rodzaje kształtów: `circle` (`cx`, `cy`, `radius`), `rect` (`x`, `y`, `width`,
  `height`), `line` (`points: [x0, y0, x1, y1, ...]`), `polygon`
  (`vertices: [...]`), `text` (`x`, `y`, `text`, `fontSize`). Wygląd w
  `paint: { fill, stroke, strokeWidth, dash, alpha }` (tekst: `fill`/`stroke`
  bezpośrednio w kształcie).
- `layer`: `"room"` (między pokojami), `"overlay"` (nad pokojami, domyślnie),
  `"top"` (nad wszystkim, także nad znacznikiem gracza). `noScale: true` utrzymuje
  stały rozmiar na ekranie niezależnie od zoomu.
- Ponowne `addOverlay` z tym samym `id` zastępuje poprzedni overlay. Overlaye
  pluginu są usuwane automatycznie przy jego wyłączeniu.
- Błąd w `render` nie psuje mapy - jest logowany raz w konsoli, a overlay nic nie rysuje.

#### `api.storage` i `api.character` - Dane Pluginu

Plugin ma własny magazyn wartości (JSON) w tej przeglądarce, oddzielony od innych pluginów:

- `api.storage.character` — osobno dla każdej postaci; odczyty idą za aktywną postacią.
- `api.storage.global` — wspólne dla wszystkich postaci.

```typescript
const queue = api.storage.character.get('kolejka', []);   // wartość domyślna, gdy brak
api.storage.character.set('kolejka', [...queue, 'delion']);
api.storage.character.remove('kolejka');
api.storage.global.keys();                                // klucze zapisane przez plugin

// Zmiana wartości — także po przełączeniu postaci
api.storage.character.onChange('kolejka', (value) => { /* ... */ });

api.character.getName();                                  // 'Bodrin' albo null przed zalogowaniem
api.character.onChange((name) => { /* ... */ });
```

Trzymaj tu małe dane (ustawienia, listy). Rosnące dane, np. dziennik, zapisuj w IndexedDB z nazwą postaci w kluczu. Nasłuchy znikają przy wyładowaniu pluginu.

#### `api.sqlite` - Odczyt Baz SQLite

Czyta plik SQLite wskazany przez gracza, np. bazę skryptu z Mudleta (`Database_<nazwa>.db` w folderze profilu), żeby zaimportować z niej dane:

```typescript
// file: z <input type="file" accept=".db,.sqlite"> w oknie pluginu
const { notes, total } = await api.sqlite.read(file, {
  notes: 'SELECT character, room, text FROM notes',
  total: 'SELECT COUNT(*) AS n FROM notes',
});
notes[0];   // { character: 'Bodrin', room: 12, text: 'sklep' }
total[0].n; // 3
```

- Zapytania mają dowolne nazwy; wynik to wiersze każdego zapytania pod jego nazwą, każdy wiersz jako obiekt z kolumnami.
- Plik jest otwierany w pamięci, w osobnym wątku: zapytania go nie zmieniają, a duża baza nie blokuje okna.
- Gdy plik nie jest bazą SQLite albo zapytanie się nie uda (np. brak tabeli), obietnica jest odrzucana z opisem błędu.

#### `api.herbs` - Zioła

```typescript
await api.herbs.getData();                          // odmiany i działanie wszystkich ziół
api.herbs.getBags();                                // stan woreczków z /ziola_buduj
api.herbs.setBags(zapisanyStan);                    // podmień cały stan (bez komend do gry)
await api.herbs.take('deliona', 3);                 // wyjmij z woreczków (jak /wezz)

await api.herbs.resolve('dwa zolte jasne kwiaty');  // 'deliona' (null, gdy to nie zioło)
await api.herbs.form('deliona', 5);                 // 'zoltych jasnych kwiatow' - forma po liczbie

// Zajrzyj do jednego woreczka i odczytaj zawartość
const bag = await api.herbs.inspectBag('swojego zamknietego woreczka');
// { herbs: { deliona: 2, ... }, total: 31, empty: false, unknown: [] } albo null
```

`inspectBag` wysyła `zajrzyj do <cel>` i czeka na opis woreczka. Woreczek musi być pod ręką (nie w plecaku). Zwraca `null`, gdy takiego woreczka nie ma albo opis nie przyjdzie w czasie (`timeout`, domyślnie 5 s); „wiele” liczy jak ustawienie ziół gracza (domyślnie 25).

Po zakończeniu istniejącego `/ziola_buduj` klient emituje `herbs.build.done`
z kopią zapisanej bazy (`HerbBagsState`). Plugin może wykonać pre-komendy,
uruchomić alias i po tym evencie zapisać wynik oraz wykonać post-komendy.
Listener należy zarejestrować przed wysłaniem aliasu i usunąć po zakończeniu.
`herbCounts` pozostaje ogólnym powiadomieniem o zmianie lub odświeżeniu danych.

`herbs.build.failed` przekazuje `{ reason }`: `no-bags`, `timeout`,
`disconnected`, `character-changed`, `error` lub `busy`. Nieudany skan zachowuje
poprzednią bazę; po 30 sekundach bez zakończenia kończy się błędem `timeout`.
`busy` oznacza odrzucenie kolejnego wywołania — pierwszy skan nadal trwa.
Nie dodaje to nowej metody liczenia ani ustawień pre/post do API.

#### `api.containers` - Pojemniki

Plugin rejestruje własne typy pojemników, a gracz (albo plugin) przypisuje im worek, torbę itp.:

```typescript
api.containers.registerType('jubiler-kamienie', { label: 'Jubiler: kamienie', fallback: 'other' });

api.containers.listBags();                               // ['plecak', 'torba', 'worek', ...] - np. do listy wyboru
api.containers.setContainer('jubiler-kamienie', 'worek'); // jak /pojemnik; '2. torba' dla drugiej; null = jak typ zapasowy

const box = api.containers.getCommandForms('jubiler-kamienie');
// { biernik: 'swoj worek', dopelniacz: 'swojego worka', from: 'ze' }
api.command.send(`wez zamkniety woreczek ${box.from} ${box.dopelniacz}`);

api.containers.put('jubiler-kamienie', 'woreczek');       // otworz / wloz / zamknij wg ustawień
await api.containers.inspect('jubiler-kamienie');         // lista przedmiotów albo null
```

`setContainer` działa tylko dla typów zarejestrowanych przez ten plugin. Wybór gracza zostaje zapisany i wraca po ponownym załadowaniu pluginu.

#### `api.team` - Drużyna

```typescript
// Pobierz listę członków drużyny
const members = api.team.getMembers();

// Pobierz lidera drużyny
const leader = api.team.getLeader();

// Pobierz ID lidera
const leaderId = api.team.getLeaderId();

// Pobierz numer gracza
const playerNum = api.team.getPlayerNum();
```

#### `api.gmcp` - GMCP

```typescript
// Pobierz dane GMCP
const gmcp = api.gmcp.get();
const hp = gmcp?.char?.vitals?.hp;
const roomName = gmcp?.room?.info?.name;
```

#### `api.attackQueue` - Kolejka Ataku

```typescript
// Dodaj przeciwnika do kolejki
api.attackQueue.add(id);

// Usuń przeciwnika z kolejki
api.attackQueue.remove(id);

// Wyczyść kolejkę
api.attackQueue.clear();

// Pobierz kolejkę
const queue = api.attackQueue.get();
```

#### `api.objects` - Obiekty w Lokacji

```typescript
// Pobierz obiekty w aktualnej lokacji
const objects = api.objects.getObjectsOnLocation();
// Obiekty zawierają: num, desc, state, shortcut, __category
```

#### `api.command` - Wysyłanie Komend

```typescript
// Wyślij komendę do serwera
api.command.send("look");

// Wyślij komendę bez wyświetlania echa
api.command.send("attack goblin", false);

// Wyślij wiele komend po kolei
await api.command.send("get sword");
await api.command.send("wield sword");
await api.command.send("attack orc");
```

**Uwaga:** To jest nowszy i bardziej intuicyjny sposób wysyłania komend. Alternatywnie możesz użyć `api.events.emit("sendCommand", { command: "..." })`, ale `api.command.send()` jest zalecany.

#### `api.bind` - Bindy Funkcyjne

```typescript
// Ustaw bind
api.bind.set("attack goblin");
api.bind.set(null, () => { /* callback */ });
api.bind.set("use potion", undefined, true); // clearAfterUse

// Wyczyść bind
api.bind.clear();

// Pobierz aktualnie zbindowaną komendę (null, gdy nic nie jest zbindowane)
if (api.bind.get() !== "otul sie plaszczem") {
    api.bind.set("otul sie plaszczem");
}

// Pobierz etykietę bindu
const label = api.bind.getLabel();
```

#### `api.keys` - Własne Skróty Klawiszowe

Plugin rejestruje **akcję** z proponowanym klawiszem. Akcja pojawia się w oknie Klawisze w sekcji „Pluginy”, gdzie gracz może przenieść ją na inny klawisz, zdjąć klawisz albo wrócić do domyślnego. Wybór gracza zapisuje się w jego zestawie klawiszy (synchronizuje się razem z nim).

```typescript
const appraiseKey = api.keys.register({
  id: 'jubiler.appraise',          // stały identyfikator - pod nim zapisuje się klawisz gracza
  label: 'Wyceń kamienie',        // nazwa w oknie Klawisze
  defaultKey: { key: 'j', alt: true },
  onPress: () => appraise(),
});

appraiseKey?.getKey();// { key: 'KeyJ', alt: true, ... } - aktualny klawisz (gracza albo domyślny), null gdy brak
appraiseKey?.remove();
```

- `id` nie zmieniaj między wersjami pluginu i poprzedź go nazwą pluginu. Nie zależy od adresu pluginu, więc klawisz gracza przetrwa przeniesienie pluginu pod inny URL. Gdy inny plugin zajął już to `id`, `register` zwraca `null`.
- `key` to litera lub cyfra (`'j'`, `'4'`) albo `KeyboardEvent.code` dla pozostałych klawiszy (`'F6'`, `'Backquote'`, `'Numpad5'`). Litery i cyfry są dopasowywane po fizycznym klawiszu, więc Alt+J działa także w układzie polskim.
- Bez `defaultKey` akcja nie ma klawisza, dopóki gracz go nie przypisze.
- Domyślna akcja klawisza jest blokowana. Klawisze pokazują konflikt, gdy na tym samym klawiszu jest też inny bind.
- Akcje znikają z okna przy wyładowaniu pluginu; zapisany klawisz gracza wraca, gdy plugin się znowu załaduje.

#### `api.multibinds` - Tymczasowe Multibindy

Dodaje komendy na pasek multibindów (domyślnie ALT+1..4; gracz może mieć więcej slotów) na czas, gdy są potrzebne - np. na bieżący krok listy kontrolnej. Tymczasowe multibindy żyją tylko w pamięci: nie są zapisywane, nie są synchronizowane i nie zmieniają bindów lokacji utworzonych przez `/mbind`. Po wyładowaniu pluginu znikają automatycznie.

```typescript
const handle = api.multibinds.addTemporary({
  action: "otworz skrzynie",   // komenda wysyłana po naciśnięciu klawisza
  label: "Skrzynia",           // opcjonalnie: nazwa na pasku zamiast komendy
  roomId: 12345,               // opcjonalnie: tylko w tej lokacji (bez roomId - wszędzie)
  highlight: true,             // opcjonalnie: wyróżniona ramka na pasku
});

// Zmiana komendy / nazwy / wyróżnienia - pasek odświeża się od razu
handle.update({ action: "wez wszystko ze skrzyni", label: "Łup", highlight: false });

// Usunięcie (można wywołać wielokrotnie)
handle.remove();
```

Przydział slotów (liczony przy każdym odświeżeniu, w kolejności dodania):
- jeśli zapisany bind lokacji ma tę samą komendę, jest używany zamiast nowego slotu (i dostaje wyróżnienie, gdy `highlight: true`); to samo dotyczy wcześniejszego tymczasowego binda z tą samą komendą,
- w przeciwnym razie zajmowany jest najniższy wolny slot spośród slotów gracza (domyślnie 1..4); gdy wszystkie są zajęte, bind nie jest pokazywany, a jego klawisz nic nie robi.

Na pasku tymczasowe bindy mają przerywaną ramkę, a wyróżnione - ramkę w kolorze akcentu. W zdarzeniu `multibinds` wpisy mają dodatkowe pola `temporary`, `highlight` i `name` (nazwa z `label`; pole `label` wpisu to nadal etykieta klawisza).

#### `api.objectListFilters` - Dostosowywanie Listy Obiektów

System filtrów pozwala na pełną customizację wyglądu wpisów na liście obiektów - można zmieniać kolory, dodawać ikony, modyfikować tekst i wiele więcej. Filtry są composable - wiele filtrów może działać razem, budując na swoich modyfikacjach.

```typescript
// Zarejestruj filtr
api.objectListFilters.register(
  "mojPlugin:nazwaFiltra",  // Unikalna nazwa (prefiks pluginu zalecany)
  (context, result) => {    // Funkcja filtru
    // Modyfikuj result na podstawie context
  },
  10  // Opcjonalny priorytet (wyższy = wykonuje się pierwszy)
);

// Usuń filtr
api.objectListFilters.unregister("mojPlugin:nazwaFiltra");

// Pobierz listę aktywnych filtrów
const filters = api.objectListFilters.getFilterNames();

// Wyczyść wszystkie filtry
api.objectListFilters.clear();
```

**Context dostępny w filtrze:**
- `context.object` - Surowe dane GMCP (hp, maxhp, num, desc, id, attackers, etc.)
- `context.displayNum` - Numer wpisu/skrót
- `context.isTarget` - Czy to obecny cel avatara?
- `context.isNextTarget` - Czy to następny cel w kolejce?
- `context.isTeammate` - Czy to członek drużyny?
- `context.rawDescription` - Oryginalny opis
- `context.isAttacking` - Czy obiekt atakuje?
- `context.attackCommand` - Obecna komenda ataku

**Result (modyfikuj ten obiekt):**
```typescript
// Zmień kolor opisu
result.style.descriptionColor = "#ff0000";

// Dodaj prefiks (ZAWSZE appenduj, nie zastępuj!)
result.style.prefix = (result.style.prefix || "") + "🐉 ";

// Dodaj sufiks (ZAWSZE appenduj, nie zastępuj!)
result.style.suffix = (result.style.suffix || "") + " ⭐";

// Zmień kolor paska HP
result.style.hpBarColor = "#00ff00";

// Dodaj klasy CSS
if (!result.style.cssClasses) result.style.cssClasses = [];
result.style.cssClasses.push("moja-klasa");

// Zamień tekst opisu
result.content.description = "skrócona nazwa";

// Zamień pasek HP całkowicie
result.content.hpBar = "<własny html>";

// Zatrzymaj kolejne filtry
return { stopPropagation: true };
```

**Przykłady zastosowań:**
```typescript
// Podświetl smoki na czerwono z emoji
api.objectListFilters.register("dragons", (context, result) => {
  if (context.rawDescription.toLowerCase().includes("smok")) {
    result.style.descriptionColor = "#ff0000";
    result.style.prefix = (result.style.prefix || "") + "🐉 ";
  }
}, 10);

// Oznacz niskie HP
api.objectListFilters.register("lowHp", (context, result) => {
  if (context.object.hp && context.object.maxhp) {
    const percent = context.object.hp / context.object.maxhp;
    if (percent < 0.2) {
      result.style.hpBarColor = "#ff0000";
      result.style.suffix = (result.style.suffix || "") + " ☠️";
    }
  }
}, 5);

// Skróć długie nazwy
api.objectListFilters.register("shorten", (context, result) => {
  let desc = context.rawDescription;
  desc = desc.replace("bardzo stary ", "");
  desc = desc.replace("potwornie ", "");
  if (desc !== context.rawDescription) {
    result.content.description = desc.trim();
  }
});
```

**Najlepsze praktyki:**
1. Używaj prefixu nazwy pluginu: `"mojPlugin:filtr"`
2. ZAWSZE appenduj do prefix/suffix, nigdy nie zastępuj
3. Sprawdzaj istniejący stan przed ustawieniem
4. Używaj priorytetów mądrze (wyższy = pierwszy):
   - 20+ dla dekoracji (ikony, markery)
   - 10-19 dla podświetleń (kolory, ostrzeżenia)
   - 0-9 dla modyfikacji (zmiany tekstu)
5. Czyść filtry przy wyładowaniu pluginu
6. Filtry działają przy każdym renderze - unikaj ciężkich operacji

**Typy TypeScript:**
```typescript
import type { ObjectListEntryFilter } from "@web/objectListFilters";

const myFilter: ObjectListEntryFilter = (context, result) => {
  // Pełne wsparcie TypeScript z autocomplete!
};
```

Zobacz `examples/object-list-filters-plugin.ts` dla pełnego przykładu.

#### `api.enemyBinds` - Dostosowywanie Bindów na Wrogów

Funkcja bindów na wrogów przypisuje wrogów na lokacji do slotów F1/F2/F3 (atak)
oraz Ctrl+F1/F2/F3 (zablokuj). Domyślnie skanuje obiekty, buduje listę kandydatów
pasujących do wbudowanego sprawdzenia `isEnemy()` i wypełnia sloty po kolei.

Resolvery działają jako pipeline na tej liście kandydatów (uruchamiany przy każdej
aktualizacji obiektów), pozwalając pluginom **zmienić kolejność** celów oraz
**dobindować wrogów**, których wbudowane sprawdzenie by pominęło. Pierwsze trzy
kandydaci trafiają na sloty F1/F2/F3 (z uwzględnieniem ustawień włączonych slotów).

```typescript
// Rejestracja resolvera (wyższy priorytet = uruchamiany wcześniej)
api.enemyBinds.register(
  "mojPlugin:resolver",
  (candidates, allObjects) => {
    // candidates: aktualna uporządkowana lista { num, desc }
    // allObjects: wszystkie obiekty na lokacji (num, desc, hp, __category, ...)
    // Zwróć nową tablicę, albo nic aby zostawić listę bez zmian.
    return [...candidates].reverse();
  },
  10
);

// Usuwanie resolvera
api.enemyBinds.unregister("mojPlugin:resolver");

// Lista zarejestrowanych resolverów (w kolejności priorytetów)
const resolvers = api.enemyBinds.getResolverNames();

// Wyczyść wszystkie resolvery
api.enemyBinds.clear();
```

**Uwagi:**
- Resolvery komponują się: wynik jednego jest wejściem `candidates` następnego.
- Duplikaty (po `num`) są odrzucane automatycznie (pierwszy wygrywa).
- Resolver który rzuci wyjątek jest pomijany, a poprzednia lista zostaje zachowana.

**Typy TypeScript:**
```typescript
import type { EnemyBindResolver } from "@arkadia/plugin-types";

const myResolver: EnemyBindResolver = (candidates, allObjects) => {
  // Pełne wsparcie TypeScript z autocomplete!
};
```

Zobacz `examples/enemy-binds-plugin.ts` dla pełnego przykładu.

#### `api.AnsiAwareBuffer` - Manipulacja Liniami

```typescript
// Stwórz nowy buffer
const buffer = new api.AnsiAwareBuffer("Hello", colorState);

// Dostępne właściwości
buffer.text    // Tekst bez formatowania
buffer.length  // Długość tekstu

// Metody manipulacji
buffer.prepend(text, state)           // Dodaj na początku
buffer.append(text, state)            // Dodaj na końcu
buffer.color(range, colorState)       // Pokoloruj fragment [start, end]
buffer.colorWords(words, color)       // Pokoloruj słowa
buffer.insert(index, text, state)     // Wstaw tekst
buffer.replace(range, text, state)    // Zamień fragment
buffer.remove(range)                  // Usuń fragment
buffer.createLink(range, options)     // Stwórz klikalny link
buffer.createLinksForText(text, opts) // Stwórz linki dla wszystkich wystąpień
buffer.clone()                        // Sklonuj buffer
buffer.clear()                        // Wyczyść buffer
```

#### `api.buttonMacros` - Własne Makra Przycisków

Pozwala pluginom definiować własne makra dla przycisków (mobilnych i desktopowych), które użytkownicy mogą wybrać w konfiguracji przycisków.

```typescript
// Zarejestruj makro przycisku
api.buttonMacros.register({
  id: "mojeMakro",              // Unikalny identyfikator (zostanie poprzedzony "plugin:")
  label: "Moje Własne Makro",   // Etykieta wyświetlana w select box
  onClick: (button, client, config) => {
    // Wykonaj akcję przy kliknięciu przycisku
    client.sendCommand(config.command || "domyslna komenda");
  },
  configFields: [               // Opcjonalne pola konfiguracji
    {
      name: "command",
      type: "text",
      label: "Komenda do wykonania",
      defaultValue: "look"
    }
  ]
});

// Usuń makro
api.buttonMacros.unregister("mojeMakro");
```

**Dostępne typy pól konfiguracji (`configFields`):**
- `text` - Pole tekstowe jednoliniowe
- `textarea` - Pole tekstowe wieloliniowe
- `number` - Pole numeryczne
- `checkbox` - Checkbox (true/false)
- `select` - Lista rozwijana (wymaga `options`)

**Przykład z różnymi typami pól:**
```typescript
api.buttonMacros.register({
  id: "zaawansowaneMakro",
  label: "Zaawansowane Makro",
  onClick: (button, client, config) => {
    if (config.enabled) {
      for (let i = 0; i < config.repeat; i++) {
        client.sendCommand(config.command);
      }
    }
  },
  configFields: [
    { name: "command", type: "text", label: "Komenda" },
    { name: "repeat", type: "number", label: "Powtórzenia", defaultValue: 1 },
    { name: "enabled", type: "checkbox", label: "Włączone", defaultValue: true },
    {
      name: "target",
      type: "select",
      label: "Cel",
      options: [
        { value: "self", label: "Ja" },
        { value: "enemy", label: "Wróg" },
        { value: "ally", label: "Sojusznik" }
      ]
    }
  ]
});
```

**Uwagi:**
- ID makra zostanie automatycznie poprzedzone `plugin:` (np. `plugin:mojeMakro`)
- Makra są automatycznie usuwane przy wyładowaniu pluginu
- Jeśli plugin jest wyładowany, przyciski z jego makrami pokażą ostrzeżenie w UI

#### Makra Stanowe (Toggle/Tryby)

Makra mogą mieć stan, który jest zachowywany między kliknięciami. Pozwala to tworzyć przyciski typu toggle (ON/OFF) lub przyciski cyklicznie przełączające tryby (jak wbudowany przycisk trybu ruchu).

**Przykład: Prosty toggle (ON/OFF):**
```typescript
api.buttonMacros.register({
  id: "autoHeal",
  label: "Auto Leczenie",
  states: [
    { id: "off", label: "OFF", color: "#666666" },
    { id: "on", label: "ON", color: "#00ff00" }
  ],
  initialState: "off",
  onClick: (ctx) => {
    // Najpierw przełącz stan
    ctx.stateCtx!.cycleState();

    // Wykonaj akcję na podstawie NOWEGO stanu
    // (cycleState przełącza, więc sprawdzamy poprzedni stan)
    if (ctx.stateCtx!.state === "off") {
      ctx.client.sendCommand("autoheal wlacz");
    } else {
      ctx.client.sendCommand("autoheal wylacz");
    }
  }
});
```

**Przykład: Przełącznik trybów (jak moveMode):**
```typescript
api.buttonMacros.register({
  id: "combatMode",
  label: "Tryb Walki",
  states: [
    { id: "defensive", label: "DEF", color: "#0066ff" },
    { id: "balanced", label: "BAL", color: "#ffff00" },
    { id: "aggressive", label: "AGR", color: "#ff0000" }
  ],
  initialState: "balanced",
  onClick: (ctx) => {
    // Przełącz na następny tryb
    ctx.stateCtx!.cycleState();

    // Pobierz nowy tryb (po cycleState)
    const modes = ["defensive", "balanced", "aggressive"];
    const nextIndex = (ctx.stateCtx!.stateIndex + 1) % modes.length;
    const nextMode = modes[nextIndex];

    ctx.client.sendCommand(`tryb ${nextMode}`);
  }
});
```

**Kontekst stanowy (`stateCtx`):**
- `stateCtx.state` - Aktualny identyfikator stanu
- `stateCtx.stateIndex` - Indeks aktualnego stanu w tablicy states
- `stateCtx.setState(id)` - Ustaw konkretny stan
- `stateCtx.cycleState()` - Przełącz na następny stan (cyklicznie)

**Właściwości stanu (`MacroState`):**
- `id` - Unikalny identyfikator stanu
- `label` - Etykieta wyświetlana na przycisku w tym stanie
- `color` - Opcjonalny kolor tła przycisku w tym stanie (hex)

**Uwagi dotyczące makr stanowych:**
- Stan jest automatycznie zapisywany w konfiguracji przycisku
- Przycisk automatycznie zmienia etykietę i kolor zgodnie z aktualnym stanem
- Stan jest zachowywany po odświeżeniu strony
- Jeśli `initialState` nie jest podany, używany jest pierwszy stan z tablicy

#### Handle do kontroli stanu makra

Metoda `register()` zwraca handle, który pozwala kontrolować stan makra z zewnątrz (np. z aliasów):

```typescript
// Zarejestruj makro i zachowaj handle
const moveMode = api.buttonMacros.register({
  id: "moveMode",
  label: "Tryb ruchu",
  states: [
    { id: "normalny", label: "zwykly" },
    { id: "przeszukiwanie", label: "prz" }
  ],
  onClick: (ctx) => {
    ctx.stateCtx?.cycleState();
    api.send(`ruch ${ctx.stateCtx?.state}`);
  }
});

// Użyj handle do kontroli stanu:
moveMode.getState();              // Pobierz aktualny stan (np. "normalny")
moveMode.setState("przeszukiwanie"); // Ustaw konkretny stan
moveMode.cycleState();            // Przełącz na następny stan
moveMode.onStateChange((newState, oldState) => {
  // Reaguj na zmianę stanu
  console.log(`Zmiana stanu: ${oldState} -> ${newState}`);
});
```

**Metody handle (`ButtonMacroHandle`):**
- `getState()` - Zwraca aktualny identyfikator stanu lub `undefined`
- `setState(stateId)` - Ustawia stan na podany ID, zwraca `true` jeśli sukces
- `cycleState()` - Przełącza na następny stan (cyklicznie)
- `onStateChange(listener)` - Subskrybuje zmiany stanu, zwraca funkcję do anulowania subskrypcji

**Przykład: Synchronizacja z aliasem:**
```typescript
const combatMode = api.buttonMacros.register({
  id: "combatMode",
  label: "Tryb walki",
  states: [
    { id: "defensywny", label: "DEF" },
    { id: "zrownowazony", label: "BAL" },
    { id: "agresywny", label: "AGR" }
  ],
  onClick: (ctx) => {
    ctx.stateCtx?.cycleState();
    api.send(`tryb ${ctx.stateCtx?.state}`);
  }
});

// Alias który zmienia stan przycisku
api.aliases.register({
  pattern: /^tryb (.+)$/,
  handler: (match) => {
    combatMode.setState(match[1]);
    return `tryb ${match[1]}`;
  }
});
```

#### `api.triggerMacros` - Własne Makra Triggerów

Pozwala pluginom definiować własne makra dla triggerów użytkownika, które mogą modyfikować tekst lub wykonywać akcje przy dopasowaniu wzorca.

```typescript
// Zarejestruj makro triggera
api.triggerMacros.register({
  id: "mojeMakroTriggera",      // Unikalny identyfikator
  label: "Moje Makro Triggera", // Etykieta wyświetlana w select box
  onMatch: (context) => {
    // context zawiera:
    // - client: Client - instancja klienta
    // - line: AnsiAwareBuffer - linia tekstu do modyfikacji
    // - match: RegExpMatchArray - wynik dopasowania regex
    // - matchRange: [number, number] - zakres dopasowania
    // - config: Record<string, any> - konfiguracja użytkownika

    // Przykład: pokoloruj dopasowanie i odtwórz dźwięk
    const color = { foreground: { space: "hex", color: context.config.color || "#ff0000" } };
    context.line.applyFormat(context.matchRange, color);
    context.client.sendEvent("sound:play", { key: context.config.sound || "beep" });
  },
  configFields: [
    { name: "color", type: "text", label: "Kolor (hex)", defaultValue: "#ff0000" },
    {
      name: "sound",
      type: "select",
      label: "Dźwięk",
      options: [
        { value: "beep", label: "Beep" },
        { value: "alert", label: "Alert" },
        { value: "notification", label: "Powiadomienie" }
      ]
    }
  ]
});

// Usuń makro
api.triggerMacros.unregister("mojeMakroTriggera");
```

**Context dostępny w `onMatch`:**
- `context.client` - Instancja klienta do wysyłania komend/wydarzeń
- `context.line` - AnsiAwareBuffer z tekstem linii (możesz modyfikować)
- `context.match` - Wynik dopasowania regex (matches[0], matches[1], itp.)
- `context.matchRange` - Zakres dopasowania [start, end] do kolorowania
- `context.config` - Wartości konfiguracji ustawione przez użytkownika

**Przykład: Makro z wieloma akcjami:**
```typescript
api.triggerMacros.register({
  id: "alertZWalki",
  label: "Alert z Walki",
  onMatch: (context) => {
    const { client, line, match, matchRange, config } = context;

    // Pokoloruj tekst
    if (config.highlight) {
      line.applyFormat(matchRange, {
        foreground: { space: "hex", color: config.highlightColor }
      });
    }

    // Odtwórz dźwięk
    if (config.playSound) {
      client.sendEvent("sound:play", { key: "beep" });
    }

    // Wyślij komendę
    if (config.autoCommand) {
      client.sendCommand(config.autoCommand);
    }

    // Wyświetl powiadomienie
    if (config.notify) {
      client.sendEvent("notify", { text: `Dopasowano: ${match[0]}` });
    }
  },
  configFields: [
    { name: "highlight", type: "checkbox", label: "Podświetl", defaultValue: true },
    { name: "highlightColor", type: "text", label: "Kolor", defaultValue: "#ff6600" },
    { name: "playSound", type: "checkbox", label: "Odtwórz dźwięk", defaultValue: false },
    { name: "autoCommand", type: "text", label: "Auto-komenda" },
    { name: "notify", type: "checkbox", label: "Powiadomienie", defaultValue: false }
  ]
});
```

**Uwagi:**
- ID makra zostanie automatycznie poprzedzone `plugin:` (np. `plugin:alertZWalki`)
- Makra triggerów działają w kontekście triggerów użytkownika (Menu → Skrypty)
- Jeśli plugin jest wyładowany, triggery z jego makrami wykonają się jako no-op (bez akcji)

### Popularne Kolory

```typescript
const GOLD_COLOR = api.colors.fromHex('#ffd700');
const SILVER_COLOR = api.colors.fromHex('#dadada');
const COPPER_COLOR = api.colors.fromHex('#875f00');
const RED_COLOR = api.colors.fromHex('#ff0000');
const GREEN_COLOR = api.colors.fromHex('#00ff00');
const BLUE_COLOR = api.colors.fromHex('#0000ff');
const YELLOW_COLOR = api.colors.fromHex('#ffff00');
const ORANGE_COLOR = api.colors.fromHex('#ffa500');
```

## Wygląd Interfejsu (UI)

Okna, stopka i menu pluginu powinny wyglądać jak reszta klienta: te same kolory, czcionka, kontrolki i odstępy. Klient ma kilka motywów (w tym jasny), więc wygląd opieraj na zmiennych CSS i gotowych klasach, a nie na własnych kolorach.

### Zasady w skrócie

1. **Kolory tylko ze zmiennych** `var(--popup-…)`. Żadnego `#fff`, `white` ani `rgba(0,0,0,…)` na tłach i tekście — na jasnym motywie znikną.
2. **Kontrolki z gotowych klas** (`popup-btn`, `popup-input`, `popup-check`, `dialog-tabs`…). Nie stylizuj przycisków od zera.
3. **Nie używaj Bootstrapa.** Klasy `btn`, `form-control`, `d-flex`, `text-muted` itp. nie są już ostylowane (Bootstrap został usunięty z klienta).
4. **Nie ustawiaj czcionki interfejsu.** Dziedzicz ją (`font: inherit` na własnych przyciskach). Tekst z gry i liczby w stylu gry: `var(--output-font-family)`.
5. **Nie ustawiaj `line-height` na jednolinijkowych elementach** o stałej wysokości (przyciski, chipy, zakładki). Domyślne `normal` centruje tekst co do piksela; np. `line-height: 14px` przesuwa go w górę lub w dół.
6. **Własne odstępy w oknie.** Treść okna nie dostaje paddingu od klienta — dodaj np. `padding: 10px 12px` na swoim korzeniu.
7. **Etykiety po polsku, z ogonkami.** (Komendy wysyłane do gry — bez ogonków.)
8. **Sprzątaj w `destroy()`**: `close()` okien, `remove()` wpisów menu, komponentów i przycisków stopki.

### Kolory

| Zmienna | Do czego |
|---|---|
| `--popup-bg` | tło okna |
| `--popup-section-bg` | tło sekcji/karty w oknie |
| `--popup-control-bg`, `--popup-control-hover-bg` | tło kontrolek, hover |
| `--popup-input-bg`, `--popup-input-text` | pola tekstowe |
| `--popup-text` | zwykły tekst |
| `--popup-text-subtle`, `--popup-text-medium` | tekst drugorzędny, etykiety |
| `--popup-text-dim`, `--popup-text-faint` | podpowiedzi, puste stany |
| `--popup-border-subtle`, `--popup-border`, `--popup-border-strong` | obramowania, od najsłabszego |
| `--popup-accent`, `--popup-accent-subtle-bg` | akcent (aktywne, główna akcja) i jego delikatne tło |
| `--popup-success`, `--popup-warning`, `--popup-danger` | stany; każdy ma też wersje `-bg` i `-border` |
| `--popup-data-gold`, `-green`, `-orange`, `-purple`, `-blue`, `-tomato`… | kolory danych (łupy, magia, nazwy) dopasowane do motywu |

Kolory tekstu gry (`api.colors.fromHex` w triggerach) to osobna sprawa — tam hex jest w porządku.

### Typografia i rozmiary

| Zmienna | Wartość (desktop) | Do czego |
|---|---|---|
| `--ui-fs` | 14px | tekst okna, przyciski |
| `--ui-fs-sm` | 13px | etykiety, małe przyciski, zakładki |
| `--ui-fs-xs` | 12px | podpowiedzi, znaczniki |
| `--ui-ctrl`, `--ui-ctrl-sm` | 32px, 28px | wysokość kontrolek |
| `--ui-radius-sm`, `--ui-radius`, `--ui-radius-lg` | 4, 6, 10px | zaokrąglenia |
| `--output-font-family` | czcionka gry | tekst z gry, wartości liczbowe |

Na telefonach klient podnosi te wartości (większe kontrolki pod palec) — używając zmiennych, dostajesz to za darmo.

### Gotowe klasy

**Przyciski** — zawsze `popup-btn popup-btn--control`, plus wariant:

```html
<button class="popup-btn popup-btn--control popup-btn--solid">Zapisz</button>   <!-- główna akcja, jedna na widok -->
<button class="popup-btn popup-btn--control">Odśwież</button>                    <!-- zwykła -->
<button class="popup-btn popup-btn--control popup-btn--ghost">Wyczyść</button>   <!-- cicha -->
<button class="popup-btn popup-btn--control popup-btn--danger popup-btn--ghost">Usuń</button>
<button class="popup-btn popup-btn--control popup-btn--sm">Mały</button>
<button class="popup-btn popup-btn--control popup-btn--sm popup-btn--icon" title="Usuń">×</button> <!-- kwadratowy, sama ikona -->
```

**Pola formularza:**

```html
<div class="popup-field">
  <label class="popup-field__label" for="cel">Cel</label>
  <input id="cel" class="popup-input popup-input--control" placeholder="np. ork">
  <div class="popup-field__hint">Pierwszy cel ataku.</div>
</div>

<select class="popup-input popup-input--control">…</select>
<textarea class="popup-input popup-input--control"></textarea>

<label class="popup-check"><input type="checkbox"> Pokaż w stopce</label>
```

**Zakładki** — aktywna ma `is-active`:

```html
<div class="dialog-tabs">
  <button class="dialog-tab is-active">Wszystko</button>
  <button class="dialog-tab">Walka</button>
</div>
```

**Układ i treść:**

| Klasa | Co robi |
|---|---|
| `popup-stack` | kolumna z odstępem 14px (sekcje okna) |
| `popup-inline` | wiersz wyśrodkowany w pionie, odstęp 8px |
| `popup-row` | jak wyżej, ale się zawija |
| `popup-spread` | wiersz z lewą i prawą stroną na krańcach |
| `popup-section` | karta z tłem i obramowaniem |
| `popup-notice` (+ `--success`, `--warning`, `--danger`) | ramka z komunikatem |
| `popup-chip` (+ `--accent`, `--success`, `--warning`) | mały znacznik |
| `popup-table` | tabela |
| `popup-empty` | pusty stan („Brak wpisów”) |
| `popup-muted`, `popup-small` | przygaszony / mniejszy tekst |

### Okna (`registerPersistentPopup`)

- Stały `id` — dzięki niemu okno wraca po przeładowaniu, jeśli było przypięte.
- Nie otwieraj okna w `init()`. Gracz otwiera je sam (wpis w menu ⋮), a przypięte wraca po przeładowaniu bez Twojej pomocy.
- Treść buduj przez DOM (`document.createElement`) albo HTML-em; dodaj własny padding.
- Korzeń treści może wypełnić okno: `height: 100%` (np. z `display: flex; flex-direction: column`, a przewijana lista w środku `flex: 1; min-height: 0; overflow-y: auto`).
- Rozmiar startowy: `initialWidth` / `initialHeight` — liczba (px), dowolna długość CSS (`'420px'`, `'30em'`, `'40%'` i `'50vw'` liczone od okna gry, `'min(600px, 80vw)'`) albo `'content'` (dopasuj do treści). Bez nich okno dostaje połowę szerokości i 40% wysokości okna gry. Rozmiar zawsze mieści się na ekranie (z małym marginesem) i nie schodzi poniżej 300×150. Działa przy pierwszym otwarciu i po „Przywróć domyślną pozycję i rozmiar” — rozmiar ustawiony przez gracza ma pierwszeństwo. Przy `initialHeight: 'content'` korzeń treści nie może mieć `height: 100%`, bo nie będzie czego mierzyć. To samo działa w `createPopup(title, body, { initialWidth, initialHeight })`.
- Przyciski w nagłówku (`headerActions`): `popup-header-btn` — tej samej wysokości co przyciski okna obok. Włączony przełącznik dostaje `is-active`, przycisk niebezpieczny (np. „Na pewno?” przy czyszczeniu) `popup-header-btn--danger`. Wybór jednej z kilku opcji to `popup-segmented popup-segmented--sm`:

  ```html
  <button class="popup-header-btn">Wyczyść</button>
  <button class="popup-header-btn is-active">Drużyna</button>
  <div class="popup-segmented popup-segmented--sm">
    <label class="popup-segmented__item is-active"><input type="radio" class="popup-segmented__input" name="widok" checked>Lista</label>
    <label class="popup-segmented__item"><input type="radio" class="popup-segmented__input" name="widok">Mapa</label>
  </div>
  ```
- Otwieranie z menu ⋮: `api.ui.addPopupMenuEntry('Nazwa okna', () => popup.isOpen ? popup.close() : popup.open())`.

```typescript
function view(): HTMLElement {
  const root = document.createElement('div');
  root.className = 'popup-stack';
  root.style.height = '100%';        // okno wypełnione, lista przewija się w środku
  root.style.boxSizing = 'border-box';
  root.style.padding = '10px 12px';

  const bar = document.createElement('div');
  bar.className = 'popup-spread';
  const title = document.createElement('span');
  title.className = 'popup-muted';
  title.textContent = 'Ostatnie łupy';
  const clear = document.createElement('button');
  clear.className = 'popup-btn popup-btn--control popup-btn--sm popup-btn--ghost';
  clear.textContent = 'Wyczyść';
  bar.append(title, clear);

  const list = document.createElement('div');
  list.style.flex = '1';
  list.style.minHeight = '0';
  list.style.overflowY = 'auto';
  list.innerHTML = '<div class="popup-empty">Brak łupów.</div>';

  root.append(bar, list);
  return root;
}

const popup = await api.ui.registerPersistentPopup({
  id: 'lupy',
  title: 'Łupy',
  createContent: view,
  initialWidth: 420,     // albo '30em', '40%', 'content'
  initialHeight: '50vh',
});
api.ui.addPopupMenuEntry('Łupy', () => (popup.isOpen ? popup.close() : popup.open()));
```

#### Okna w React

Treść okna może być komponentem React. Musi to być React klienta — `api.ui.react` — a nie własna kopia w paczce pluginu: przy dwóch kopiach hooki (`useState` itd.) przestają działać. Komponenty klienta są w `api.ui.components`: `Button`, `HeaderButton`, `Segmented`, `Select`, `Input`, `Field`, `Check`, `MenuButton`, `Notice`. Wyglądają jak w oknach klienta, w każdym motywie.

> **Eksperymentalne:** zestaw `api.ui.components` i ich propsy mogą się zmienić w kolejnych wersjach klienta.

Bez bundlera:

```typescript
const { createElement: h, useState } = api.ui.react;
const { Button } = api.ui.components;

function Licznik() {
  const [n, setN] = useState(0);
  return h(Button, { variant: 'solid', onClick: () => setN(n + 1) }, `Klik ${n}`);
}

const popup = await api.ui.registerPersistentPopup({ id: 'licznik', title: 'Licznik', createContent: () => h(Licznik) });
```

W TSX z bundlerem (edytor pluginów albo własny esbuild z `arkadiaHostUi()`, zob. [Typy TypeScript](#typy-typescript)) importy `react`, `react/jsx-runtime`, `react-dom`, `react-dom/client` i `@arkadia/ui` trafiają do klienta same:

```tsx
import { useState } from 'react';
import { Button } from '@arkadia/ui';

function Licznik() {
  const [n, setN] = useState(0);
  return <Button variant="solid" onClick={() => setN(n + 1)}>Klik {n}</Button>;
}
```

Podaj komponent w `createContent` raz; potem przerysowuje się sam ze swojego stanu, bez `setBody`.

#### Ustawienia okna (⚙)

`settingsFields` dodaje pola do menu ⚙ okna, pod wspólnymi ustawieniami czcionki. Wartości są zapisywane razem z układem okien; czyta i zapisuje je uchwyt okna:

```typescript
const popup = await api.ui.registerPersistentPopup({
  id: 'jubiler',
  title: 'Jubiler',
  createContent,
  settingsFields: [
    { type: 'toggle', key: 'ceny', label: 'Pokazuj ceny', default: true },
    { type: 'number', key: 'pauza', label: 'Przerwa (ms)', default: 300, min: 0, max: 2000, step: 50 },
    { type: 'select', key: 'smieci', label: 'Śmieci', default: 'odloz', options: [
      { value: 'odloz', label: 'Odkładaj' }, { value: 'zostaw', label: 'Zostawiaj' } ] },
  ],
});

popup.getSetting('pauza', 300);
popup.setSetting('zakladka', 'lista');        // dowolny klucz, nie tylko z settingsFields
const off = popup.onSettingChange('ceny', (on) => { /* ... */ });
```

#### Przewijana lista (`attachScrollback`)

Lista, która przybywa od dołu (czat, log), może zachowywać się jak tekst gry i okno czatu: trzyma się dołu, a gdy gracz przewinie w górę, najnowsze wiersze zostają widoczne w panelu na dole (podział ekranu), z uchwytem do zmiany wysokości. Podaj element, który się przewija (`overflow-y: auto`, bez dolnego paddingu), i dodawaj, usuwaj albo podmieniaj jego dzieci — każda zmiana przypina listę na nowo.

```typescript
const list = document.createElement('div');
list.style.cssText = 'height: 100%; overflow-y: auto';
const scrollback = api.ui.attachScrollback(list, {
  splitHeight: popup.getSetting('splitHeight', 120),
  onSplitResize: (height) => popup.setSetting('splitHeight', height),
  // bez renderSplit wiersze są klonowane, więc tracą nasłuchiwacze zdarzeń
  renderSplit: (lines) => ostatnie(lines).map(stworzWiersz),
});
list.append(wiersz);          // przypięte do dołu albo skopiowane do panelu
scrollback.refresh();         // po zmianie wiersza w miejscu
```

Przy wyłączeniu pluginu lista przestaje być obsługiwana sama.

### Stopka

- **Komponent** (`registerFooterComponent`) jest wstawiany bez ramki. Żeby wyglądał jak wbudowane chipy, użyj ich znaczników:

  ```html
  <span class="chip">
    <span class="chip__ico"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="9"/></svg></span>
    <span class="chip__text"><span class="chip__lab">Cel</span><span class="chip__val">ork</span></span>
  </span>
  ```

  Ikona to SVG (dopasuje się do 13px i koloru chipa). `chip--warn` / `chip--danger` na elemencie `chip` — gdy coś wymaga uwagi. Etykieta krótka (kilka liter, wyświetlana wersalikami), wartość zwięzła. Jedna linia, bez własnego `line-height` i wysokości.
- **Podpowiedź** (`setTooltip`) — zamiast `title` daj chipowi taką samą kartę jak wbudowane: nagłówek, wiersze etykieta–wartość i na dole, co robi kliknięcie i przytrzymanie. `update()` odświeża ją na bieżąco, a przy wyłączeniu pluginu znika sama.

  ```js
  const chip = api.ui.registerFooterComponent('cel', '<span class="chip">…</span>');
  const tip = api.ui.setTooltip(chip.element, {
    header: 'Cel',
    rows: [{ label: 'Kondycja', content: 'ledwo stoi' }],
    click: 'zaatakuj cel',
  });
  // później: tip.update({ ... }) albo tip.remove()
  ```
- **Przycisk** (`registerFooterButton`) — gdy chodzi o wysłanie komendy. `tone: 'accent'` tylko dla trybu lub ważnej akcji, `'danger'` dla ryzykownych; `state` zapala go, gdy tryb jest włączony.
- Stopka jest wąska — jeden, najwyżej dwa elementy na plugin.

### Widżety

- **Widżet** (`registerWidget`) — mały element bez ramki, który gracz kładzie nad tekstem gry tam, gdzie chce (Menu → Widżety → Dodaj albo `/widzety`). Plugin daje tylko treść; ustawienie, rozmiar, krycie i usunięcie należą do gracza, a miejsce jest zapamiętywane, więc widżet wraca tam przy każdym wczytaniu pluginu.

  ```js
  const widget = api.ui.registerWidget('licznik', '<b>0</b> zabitych', { label: 'Licznik zabitych', corner: 'tl' });
  widget.setContent('<b>3</b> zabitych');   // HTML, węzeł DOM albo element React
  ```

  Widżet leży na półprzezroczystym tle — zwięźle, kilka linii. Pusty element jest ukryty, dopóki nie ma czego pokazać. Widżet pluginu to jeden element, więc na ekranie może być tylko raz.

### Menu

- `addPopupMenuEntry` (⋮) — do otwierania okien i akcji pluginu; `addContextMenuEntry` — do akcji na tekście gry.
- Etykieta krótka, rzeczownik lub czasownik („Łupy”, „Kopiuj jako notatkę”), bez nazwy pluginu i bez emoji.

## Ładowanie Pluginów

### Przez UI

1. Kliknij przycisk "Wtyczki" w kliencie
2. Zakładka "Katalog" — znajdź plugin i kliknij "Zainstaluj". Plugin śledzi najnowsze wydanie,
   więc nowe wersje wczytują się same przy kolejnym uruchomieniu. Konkretną wersję (np. żeby
   cofnąć się do starszej) wybierzesz z listy "Wersje" w szczegółach pluginu
3. Własny plugin dodasz przyciskiem "Dodaj plugin" → "Z adresu URL" (albo ZIP / wklejony kod)
4. Plugin zostanie załadowany i zainicjalizowany

### Przeładowanie bez odświeżania strony

Po zmianie kodu pluginu wpisz w kliencie `/reload-plugin <nazwa>`. Plugin jest zamykany — klient wywołuje jego `destroy()` i sam usuwa aliasy, okna, wpisy menu i elementy stopki — i ładowany od nowa z tego samego adresu. Triggery, nasłuchy `api.events.on` i timery usuń sam w `destroy()`, inaczej po każdym przeładowaniu będzie ich o komplet więcej. Wystarczy fragment nazwy albo adresu pluginu; gdy pasuje kilka, klient je wypisze. Samo `/reload-plugins` przeładuje wszystkie. Plugin serwowany lokalnie przez `arkadia-plugin dev` przeładowuje się sam po każdym zapisie — zob. [Pisanie Pluginu Lokalnie](#pisanie-pluginu-lokalnie).

### Publikacja w katalogu (z edytora)

W edytorze pluginów przycisk **Publish** wysyła plugin do katalogu pluginów.

1. Zapisz plugin (przycisk "Save")
2. Kliknij "Publish" — otworzy się okno katalogu
3. Zaloguj się (Google, GitHub albo e-mail) i potwierdź publikację

Edytor **nie przechowuje żadnych danych logowania** — konto i publikacja obsługiwane są po stronie
katalogu. Do katalogu trafia to samo archiwum ZIP, które tworzy przycisk "Download": pliki źródłowe
i `plugin.json`.

Po udanej publikacji edytor zapamiętuje identyfikator pluginu w katalogu, więc kolejne wysyłki są
rozpoznawane jako aktualizacja, a nie nowy plugin.

Nazwa, opis **i wersja** brane są z `PluginInfo`, które zwraca Twoja funkcja `init()` — to jest
źródło prawdy, a nie metadane edytora.

### Wydanie aktualizacji

1. Podbij `version` w obiekcie, który zwraca Twój `init()` — np. z `'1.0.0'` na `'1.1.0'`
2. Zapisz i kliknij "Publish"
3. Pole "Wersja" w oknie katalogu zostaw puste — katalog weźmie wersję z kodu

Wersje są niezmienne i muszą rosnąć zgodnie z semver, więc nowa musi być wyższa od ostatnio
opublikowanej (okno katalogu pokazuje, która to). Wersję możesz też wpisać ręcznie — wtedy wygrywa
ona, ale klient nadal pokaże graczom tę z `PluginInfo`, więc najbezpieczniej trzymać obie zgodne.

### Przez Parametr URL

```
https://arkadia.rpg.pl/?add-script=https://example.com/moj-plugin.js
```

### Hostowanie Pluginu

Hostuj swój plugin jako publicznie dostępny plik JavaScript:

```typescript
// https://example.com/moj-plugin.js

import type { PluginApi, PluginInfo } from '@arkadia/plugin-types';

export async function init(api: PluginApi): Promise<PluginInfo> {
  const tag = "mojPlugin";

  const RED_COLOR = api.colors.fromHex('#ff0000');

  const colorStringInLine = (line: any, text: string, color: any) => {
    const matchIndex = line.text.indexOf(text);
    if (matchIndex === -1) return line;
    return line.color([matchIndex, matchIndex + text.length], color);
  };

  api.triggers.register(
    /niebezpieczenstwo/i,
    (line, matches) => {
      return colorStringInLine(line, matches[0], RED_COLOR);
    },
    tag
  );

  return {
    name: "Podświetlacz Niebezpieczeństwa",
    version: "1.0.0",
    description: "Podświetla niebezpieczne sytuacje"
  };
}
```

## Typy TypeScript

Typy i narzędzia do pisania pluginów są w pakiecie `@dargoth-client/plugin-types`. Instaluj go pod nazwą `@arkadia/plugin-types` — pod tą nazwą importują go wszystkie pluginy i przykłady:

```bash
npm i -D @arkadia/plugin-types@npm:@dargoth-client/plugin-types typescript
# albo
yarn add -D @arkadia/plugin-types@npm:@dargoth-client/plugin-types typescript
```

Pakiet nie ma wersji do pilnowania: przy każdej instalacji pobiera typy z aktualnie wdrożonego klienta, więc zawsze pasują do tego, co gracze mają u siebie. Odświeżysz je bez reinstalacji komendą `npx arkadia-plugin types`. Gdy pobranie się nie uda (brak sieci), zostaje poprzednia kopia.

Następnie importuj typy w swoim pluginie:

```typescript
import type { PluginApi, PluginInfo } from '@arkadia/plugin-types';

export async function init(api: PluginApi): Promise<PluginInfo> {
  // Pełne wsparcie TypeScript z autocomplete!
  api.triggers.register(
    /pattern/i,
    (line, matches) => {
      // TypeScript wie o wszystkich metodach na 'line'
      return line.prepend(">> ");
    },
    "myPlugin"
  );

  return {
    name: "My Plugin",
    version: "1.0.0"
  };
}
```

Zobacz `plugin-types/README.md` i `plugin-types/index.d.ts` dla pełnej dokumentacji typów.

> Wcześniej typy instalowało się wprost z adresu `…/arkadia-plugin-types.tgz`. Taki wpis psuje instalację po każdym wdrożeniu klienta (zmienia się suma kontrolna w `yarn.lock` / `package-lock.json`) — zamień go na polecenie powyżej.

### Plugin w TSX (React)

`arkadia-plugin dev` i `arkadia-plugin build` (zob. [Pisanie Pluginu Lokalnie](#pisanie-pluginu-lokalnie)) obsługują `.tsx` bez konfiguracji. Jeśli budujesz plugin własnym skryptem, pakiet zawiera plugin esbuild `arkadiaHostUi()`, który podmienia `react`, `react/jsx-runtime`, `react-dom`, `react-dom/client` i `@arkadia/ui` na React, React DOM i komponenty klienta (zob. [Okna w React](#okna-w-react)):

```js
// build.mjs
import { build } from 'esbuild';
import { arkadiaHostUi } from '@arkadia/plugin-types/esbuild.cjs';

await build({
  entryPoints: ['src/index.tsx'],
  bundle: true,
  format: 'esm',
  jsx: 'automatic',
  outfile: 'dist/plugin.js',
  plugins: [arkadiaHostUi()],
});
```

Typy dla `@arkadia/ui`: dodaj `"@arkadia/plugin-types/ui"` do `types` w `tsconfig.json`. Dla `react` zainstaluj `@types/react` jako zależność deweloperską. Edytor pluginów robi to samo bez konfiguracji — wystarczy plik `.tsx`.

## Pisanie Pluginu Lokalnie

Większy plugin wygodniej pisać we własnym edytorze (VS Code, WebStorm…) niż w edytorze pluginów. Pakiet z typami ma do tego komendę `arkadia-plugin`: buduje plugin do jednego pliku, serwuje go na `localhost` i po każdym zapisie pliku przeładowuje go w kliencie — bez odświeżania strony i bez wpisywania czegokolwiek.

### Nowy plugin

```bash
mkdir moj-plugin && cd moj-plugin
npm init -y
npm i -D @arkadia/plugin-types@npm:@dargoth-client/plugin-types typescript
npx arkadia-plugin init
```

`init` tworzy brakujące pliki (niczego nie nadpisuje):

```
moj-plugin/
├── package.json     # skrypty: dev, build, typecheck, types
├── plugin.json      # metadane do publikacji w katalogu; entryPoint wskazuje plik startowy
├── plugin.ts        # punkt wejścia: init() / destroy()
├── tsconfig.json
└── .gitignore
```

Plugin może mieć dowolnie wiele plików — importuj je względnie (`import { x } from './ui/okno'`), wszystko trafia do jednego `dist/plugin.js`.

### Cykl pracy

1. `npm run dev` (albo `yarn dev`) — zostaw działające w terminalu. Wypisze adres pluginu i gotowy link do klienta
2. W kliencie: **Wtyczki** → **Dodaj plugin** → **Z adresu URL** → `http://localhost:5177/plugin.js` (albo otwórz wypisany link z `?add-script=`). Wystarczy raz — adres zostaje zapamiętany
3. Zmieniasz kod i zapisujesz — plugin przebudowuje się, a klient sam go przeładowuje i wypisuje „Przeladowano …” w oknie gry

Klient sam przeładowuje każdy plugin z `localhost`, którego serwer to obsługuje — także serwer `esbuild --serve` z własnego `build.mjs`. Gdy serwer nie działa, plugin ładuje się normalnie, a ręcznie przeładujesz go komendą `/reload-plugin`.

**Port.** Domyślnie 5177. Jeśli jest zajęty (np. pracujesz nad dwoma pluginami naraz), serwer bierze kolejny wolny i ostrzega o tym. Inny port to inny adres, więc klient traktuje go jak osobny plugin — trzeba go dodać jeszcze raz. Opcje:

```bash
npx arkadia-plugin dev --port 5180        # inny port startowy
npx arkadia-plugin dev --strict-port      # zajęty port = błąd zamiast kolejnego
```

Żeby przeładowanie było czyste, `destroy()` musi zdjąć wszystko, czego klient nie sprząta sam:

```typescript
const TAG = 'mojPlugin';
let timer: ReturnType<typeof setInterval> | undefined;
let pluginApi: PluginApi | undefined;
const onMove = () => { /* ... */ };

export async function init(api: PluginApi): Promise<PluginInfo> {
  pluginApi = api;
  api.triggers.register(/wzorzec/, (line) => line, TAG);
  api.events.on('mapMove', onMove);
  timer = setInterval(() => { /* ... */ }, 1000);
  return { name: 'Mój Plugin', version: '1.0.0' };
}

export async function destroy(): Promise<void> {
  pluginApi?.triggers.removeByTag(TAG);
  pluginApi?.events.off('mapMove', onMove);
  clearInterval(timer);
}
```

Uwagi:

- **Wersja z katalogu i lokalna naraz** — jeśli masz zainstalowany ten sam plugin z katalogu, wyłącz go na czas pracy, inaczej oba będą reagować na te same linie
- **Dane pluginu** (`api.storage`, położenie okien) są zapisywane pod adresem pluginu, więc wersja z `localhost` startuje z pustymi danymi — chyba że plugin eksportuje [`stableId`](#stały-identyfikator-stableid). Wtedy obie wersje dzielą dane (gdy obie są włączone naraz, druga z nich wraca do danych spod swojego adresu)
- **Typy** sprawdza `npm run typecheck` — budowanie ich nie sprawdza, tylko je usuwa, więc błąd typu nie zatrzyma `dev`

### Komendy `arkadia-plugin`

| Komenda | Co robi |
|---------|---------|
| `arkadia-plugin dev` | Przebudowuje plugin przy każdej zmianie i serwuje `dist/` na `localhost`; klient przeładowuje plugin sam |
| `arkadia-plugin build` | Buduje `dist/plugin.js` |
| `arkadia-plugin init` | Tworzy brakujące pliki projektu i skrypty w `package.json` |
| `arkadia-plugin types` | Pobiera aktualne typy (i same narzędzia) z wdrożonego klienta |
| `arkadia-plugin skill` | Kopiuje instrukcję dla asystenta AI do `.claude/skills/` |

Plik startowy to `entryPoint` z `plugin.json` (domyślnie `plugin.ts`). Narzędzia przychodzą razem z typami, więc też aktualizują się z klientem. Własny skrypt budujący nadal zadziała — wtedy przyda się `arkadiaHostUi()` opisany wyżej.

**Własne opcje esbuild.** Gdy plugin potrzebuje czegoś ponad domyślne ustawienia — stałych wstawianych przy budowaniu, importu plików `.md` jako tekstu, własnych pluginów esbuild — dodaj obok `plugin.json` plik `arkadia-plugin.config.mjs` (albo `.js`, `.cjs`). `dev` i `build` dołączają jego opcje do swoich:

```js
// arkadia-plugin.config.mjs
import { readFileSync } from 'node:fs';

const { version } = JSON.parse(readFileSync('./package.json', 'utf8'));

// Zamiast obiektu może być funkcja; command to 'dev' albo 'build'
export default ({ command }) => ({
  define: { __VERSION__: JSON.stringify(version) },
  loader: { '.md': 'text' },
  minify: command === 'build',
});
```

Plugin esbuild z `plugins` działa po `arkadiaHostUi()`. Plik startowy i wynik (`dist/plugin.js`) ustala `arkadia-plugin` — `entryPoints`, `outfile`, `outdir` itp. w konfiguracji kończą się błędem.

### Debugowanie

- **Konsola przeglądarki (F12)** — tu trafiają błędy z `init()` i z callbacków triggerów oraz Twoje `console.log`. Dzięki mapom źródeł ślady stosu wskazują na pliki `.ts`, a w zakładce *Sources* możesz stawiać breakpointy w swoim kodzie
- **`/fake tekst`** — przepuszcza podany tekst przez triggery tak, jakby przyszedł z gry. Tak sprawdzisz wzorzec bez czekania na sytuację w grze. Opcja `--type=` ustawia typ wiadomości GMCP, który dostaje callback triggera (domyślnie `combat.avatar`), np. `/fake --type=room.short Na trakcie.`
- **`api.output.print(...)`** — szybki podgląd wartości prosto w oknie gry
- **Podgląd GMCP** — przykładowy plugin `examples/gmcp-inspector-plugin.ts` pokazuje na żywo wszystkie zdarzenia GMCP, z których możesz korzystać w `api.gmcp`
- **Status w oknie Wtyczki** — plugin, którego `init()` rzucił błąd, ma tam status błędu z komunikatem; po poprawce i zapisie przeładuje się sam

### Gdzie szukać API

- Ten dokument — opis wszystkich przestrzeni `api.*` z przykładami
- `node_modules/@arkadia/plugin-types/latest/index.d.ts` — pełne typy, generowane z kodu klienta, więc zawsze aktualne. Twój edytor podpowiada je sam
- [`examples/`](../examples/) — kompletne przykładowe pluginy

### Praca z asystentem AI

Pakiet zawiera instrukcję dla asystentów AI (Claude Code, Codex, Cursor…): jak zbudowany jest plugin, gdzie szukać API, jak go uruchomić i debugować. `npx arkadia-plugin skill` kopiuje ją do `.claude/skills/arkadia-plugin/` — Claude Code wczyta ją sam, gdy zajmiesz się pluginem. Inne narzędzia: dopisz w swoim `AGENTS.md` (albo odpowiedniku) zdanie „Przed pracą nad pluginem przeczytaj `node_modules/@arkadia/plugin-types/latest/skills/arkadia-plugin/SKILL.md`”.

## Kompatybilność Wsteczna

System pluginów zachowuje pełną kompatybilność wsteczną ze starymi skryptami. Zwykłe pliki JavaScript bez interfejsu pluginu będą załadowane jako "legacy scripts" i wykonają się normalnie.

### Migracja Starych Skryptów

**Przed (Legacy):**
```javascript
const client = window.client;

const colorFromHex = (hex) => ({ foreground: { space: "hex", color: hex } });
const RED_COLOR = colorFromHex('#ff0000');

client.Triggers.registerTrigger(/pattern/, (line, matches) => {
  client.clientAdapter.output("Message", "system");
  client.sendEvent("sound:play", { key: "beep" });
  return line;
}, "tag");
```

**Po (Plugin z PluginApi):**
```typescript
import type { PluginApi, PluginInfo } from '@arkadia/plugin-types';

export async function init(api: PluginApi): Promise<PluginInfo> {
  const RED_COLOR = api.colors.fromHex('#ff0000');

  api.triggers.register(/pattern/, (line, matches) => {
    api.output.print("Message");
    api.events.emit("sound:play", { key: "beep" });
    return line;
  }, "tag");

  // Wysyłanie komend
  api.command.send("look");  // Nowy sposób
  // lub: api.events.emit("sendCommand", { command: "look" });  // Stary sposób (nadal działa)

  return {
    name: "Mój Plugin",
    version: "1.0.0"
  };
}
```

## Dobre Praktyki

1. **Używaj unikalnych tagów** - Unikaj konfliktów z innymi pluginami
2. **Czyść w destroy()** - Usuwaj event listenery
3. **Używaj TypeScript** - Zainstaluj `@arkadia/plugin-types` dla pełnego wsparcia IDE
4. **Testuj dokładnie** - Sprawdź plugin przed udostępnieniem
5. **Wersjonuj semantycznie** - 1.0.0, 1.1.0, 2.0.0 itp.
6. **Dokumentuj kod** - Dodawaj komentarze

## Rozwiązywanie Problemów

- **Plugin się nie ładuje** - Sprawdź konsolę przeglądarki (F12)
- **Błędy importu** - Upewnij się, że używasz `import type` dla typów
- **Triggery nie reagują** - Sprawdź wzorzec regex
- **Kolory nie działają** - Użyj `api.colors.fromHex()` lub `api.colors.fromRgb()`
- **Plugin jako "Legacy"** - Dodaj funkcję `init` zwracającą `PluginInfo`
- **Brak autocomplete** - Zainstaluj `@arkadia/plugin-types` i użyj `import type`

## Przykłady

Zobacz katalog `examples/` w repozytorium dla kompletnych przykładów pluginów:
- `simple-highlighter-plugin.ts` - Prosty plugin do podświetlania słów
- `example-plugin.ts` - Kompleksowy przykład demonstrujący różne funkcje API
- `combat-alert-plugin.ts` - Zaawansowany plugin śledzący statystyki walki
- `object-list-filters-plugin.ts` - Plugin customizujący wygląd listy obiektów (ikony, kolory, HP)
