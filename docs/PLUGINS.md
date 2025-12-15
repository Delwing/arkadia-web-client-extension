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
- [Ładowanie Pluginów](#ładowanie-pluginów)
- [Typy TypeScript](#typy-typescript)
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
- `command` - Wysłana komenda
- `gmcp` - Wiadomość GMCP
- `gmcp.{path}` - Konkretna ścieżka GMCP (np. `gmcp.char.vitals`)
- `sound:play` - Odtwórz dźwięk: `{ key: "beep" }`
- `sendCommand` - Wyślij komendę: `{ command: "...", echo?: boolean }`
- `notify` - Wyświetl powiadomienie: `{ text: "...", time?: number }`

#### `api.map` - Mapa

```typescript
// Pobierz aktualny pokój
const room = api.map.getRoom();
// room zawiera: id, name, x, y, z, areaId, exits, itp.

// Ustaw lokalizację
api.map.setLocation(roomId);

// Cofnij się do poprzedniego pokoju
api.map.stepBack();
```

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

// Pobierz etykietę bindu
const label = api.bind.getLabel();
```

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
- Makra triggerów działają w kontekście triggerów użytkownika (Ustawienia → Triggery)
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

## Ładowanie Pluginów

### Przez UI

1. Kliknij przycisk "Skrypty" w kliencie
2. Wpisz URL swojego pluginu
3. Kliknij "Dodaj"
4. Plugin zostanie załadowany i zainicjalizowany

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

Dla pełnego wsparcia TypeScript zainstaluj pakiet z typami:

```bash
npm install http://delwing.github.io/arkadia-web-client-extension/arkadia-plugin-types.tgz
```

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
