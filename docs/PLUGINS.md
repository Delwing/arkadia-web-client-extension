# System Pluginów

Klient Arkadia Web wspiera zewnętrzne pluginy jako moduły ES. Pluginy mogą rozszerzyć klienta o własne funkcje takie jak triggery, aliasy i obsługę wydarzeń.

## ⚠️ WAŻNE - Ograniczenia Zewnętrznych Pluginów

**Zewnętrzne pluginy NIE MOGĄ używać importów z modułów klienta!**

Pluginy ładowane dynamicznie nie mają dostępu do wewnętrznych aliasów ścieżek takich jak `@modules/core/Colors` czy `@client/constants/colors`. Te aliasy są rozwiązywane podczas budowania klienta i nie są dostępne w czasie wykonania dla zewnętrznych skryptów.

**Rozwiązanie:** Wszystkie potrzebne funkcje pomocnicze musisz zdefiniować bezpośrednio w swoim pluginie (zobacz przykłady poniżej).

## Spis Treści

- [Struktura Pluginu](#struktura-pluginu)
- [Podstawowy Przykład](#podstawowy-przykład)
- [Kolorowanie Tekstu Triggerami](#kolorowanie-tekstu-triggerami)
- [Zaawansowane Przykłady](#zaawansowane-przykłady)
- [Dokumentacja API Klienta](#dokumentacja-api-klienta)
- [Ładowanie Pluginów](#ładowanie-pluginów)
- [Kompatybilność Wsteczna](#kompatybilność-wsteczna)

## Struktura Pluginu

Plugin to moduł ES, który eksportuje asynchroniczną funkcję `init` oraz opcjonalnie funkcję `destroy`:

```typescript
// Typy dla TypeScript (pomoc w IDE)
type Client = any;
type PluginInfo = {
  name: string;
  version: string;
  author?: string;
  description?: string;
};

/**
 * Inicjalizacja pluginu
 * @param client - Instancja klienta Arkadia
 * @returns Metadane pluginu
 */
export async function init(client: Client): Promise<PluginInfo> {
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
type Client = any;
type PluginInfo = {
  name: string;
  version: string;
  description?: string;
};

export async function init(client: Client): Promise<PluginInfo> {
  const tag = "mojPlugin";

  // Zarejestruj prosty trigger
  client.Triggers.registerTrigger(
    /Zdobywasz (\d+) punktow doswiadczenia/,
    (line: any, matches: RegExpMatchArray) => {
      const xp = matches[1];
      // WAŻNE: Użyj clientAdapter.output() a nie client.output()!
      client.clientAdapter.output(`Zdobyłeś ${xp} PD!`, "system");
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

### Funkcje Pomocnicze

Ponieważ nie możesz importować z modułów klienta, użyj tych funkcji pomocniczych w swoim pluginie:

```typescript
// Funkcja do tworzenia koloru z hex
const colorFromHex = (hex: string) => ({
  foreground: { space: "hex", color: hex }
});

// Funkcja do kolorowania tekstu w linii
const colorStringInLine = (line: any, text: string, color: any) => {
  const matchIndex = line.text.indexOf(text);
  if (matchIndex === -1) return line;
  return line.color([matchIndex, matchIndex + text.length], color);
};
```

### Przykład 1: Proste Kolorowanie Tekstu

Kolorowanie określonych słów gdy się pojawią:

```typescript
type Client = any;
type PluginInfo = { name: string; version: string; description?: string };

export async function init(client: Client): Promise<PluginInfo> {
  const tag = "highlightPlugin";

  // Funkcje pomocnicze
  const colorFromHex = (hex: string) => ({
    foreground: { space: "hex", color: hex }
  });

  const colorStringInLine = (line: any, text: string, color: any) => {
    const matchIndex = line.text.indexOf(text);
    if (matchIndex === -1) return line;
    return line.color([matchIndex, matchIndex + text.length], color);
  };

  // Zdefiniuj swój kolor
  const HIGHLIGHT_COLOR = colorFromHex('#ff0000'); // Czerwony

  // Zarejestruj trigger do kolorowania słowa "ważne"
  client.Triggers.registerTrigger(
    /ważne/i,
    (line: any, matches: RegExpMatchArray) => {
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
export async function init(client: any): Promise<any> {
  const tag = "treasureColors";

  const colorFromHex = (hex: string) => ({
    foreground: { space: "hex", color: hex }
  });

  const colorStringInLine = (line: any, text: string, color: any) => {
    const matchIndex = line.text.indexOf(text);
    if (matchIndex === -1) return line;
    return line.color([matchIndex, matchIndex + text.length], color);
  };

  // Predefiniowane kolory
  const GOLD_COLOR = colorFromHex('#ffd700');
  const SILVER_COLOR = colorFromHex('#c0c0c0');
  const BRONZE_COLOR = colorFromHex('#cd7f32');

  // Definicje wzorców
  const patterns = [
    { regex: /zlot(?:y|a|e)\s+\w+/i, color: GOLD_COLOR },
    { regex: /srebrn(?:y|a|e)\s+\w+/i, color: SILVER_COLOR },
    { regex: /brazow(?:y|a|e)\s+\w+/i, color: BRONZE_COLOR }
  ];

  // Zarejestruj triggery dla każdego wzorca
  patterns.forEach(({ regex, color }) => {
    client.Triggers.registerTrigger(
      regex,
      (line: any, matches: RegExpMatchArray) => {
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
export async function init(client: any): Promise<any> {
  const tag = "combatAlert";

  const colorFromHex = (hex: string) => ({
    foreground: { space: "hex", color: hex }
  });

  const COLOR = colorFromHex("#ff6347");

  client.Triggers.registerTrigger(
    /Zostales zaatakowany!/i,
    (line: any) => {
      // Odtwórz dźwięk
      client.sendEvent("sound:play", { key: "beep" });

      // Dodaj prefix i suffix z kolorem
      return line
        .prefix(`\n\n[ ALARM WALKI ] `, COLOR)
        .suffix("\n\n");
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
export async function init(client: any): Promise<any> {
  const tag = "autoHealer";

  const colorFromHex = (hex: string) => ({
    foreground: { space: "hex", color: hex }
  });

  const HEALTH_COLOR = colorFromHex("#ff0000");

  client.Triggers.registerTrigger(
    /Twoje zdrowie jest krytycznie niskie!/i,
    (line: any) => {
      // Wyślij komendę leczenia
      client.sendCommand("wypij miksture leczaca");

      // Pokoloruj i sformatuj linię
      return line
        .prefix(`\n[ AUTO-LECZENIE ] `, HEALTH_COLOR)
        .suffix(" >> Picie mikstury leczącej\n");
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
export async function init(client: any): Promise<any> {
  const tag = "questTracker";

  const colorFromHex = (hex: string) => ({
    foreground: { space: "hex", color: hex }
  });

  const colorStringInLine = (line: any, text: string, color: any) => {
    const matchIndex = line.text.indexOf(text);
    if (matchIndex === -1) return line;
    return line.color([matchIndex, matchIndex + text.length], color);
  };

  const QUEST_COLOR = colorFromHex("#00ff00");
  let questCount = 0;

  // Trigger dla rozpoczęcia questa
  client.Triggers.registerTrigger(
    /Przyjales quest: (.+)/i,
    (line: any, matches: RegExpMatchArray) => {
      questCount++;
      const questName = matches[1];
      client.clientAdapter.output(`Quest rozpoczęty: ${questName} (Łącznie: ${questCount})`, "system");
      return colorStringInLine(line, matches[0], QUEST_COLOR);
    },
    tag
  );

  // Trigger dla ukończenia questa
  client.Triggers.registerTrigger(
    /Ukonczyles quest: (.+)/i,
    (line: any, matches: RegExpMatchArray) => {
      const questName = matches[1];
      client.clientAdapter.output(`Quest ukończony: ${questName}!`, "system");
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
export async function init(client: any): Promise<any> {
  // Dodaj aliasy do klienta
  client.aliases.push({
    pattern: /^\/dom$/,
    callback: () => {
      client.sendCommand("idz do domu");
      return true; // Zatrzymaj dalsze przetwarzanie
    }
  });

  client.aliases.push({
    pattern: /^\/tp (.+)$/,
    callback: (matches: RegExpMatchArray) => {
      const destination = matches[1];
      client.sendCommand(`teleportuj ${destination}`);
      return true;
    }
  });

  return {
    name: "Skróty Komend",
    version: "1.0.0",
    description: "Dodaje /dom i /tp jako skróty"
  };
}
```

## Dokumentacja API Klienta

### Triggery

```typescript
// Zarejestruj trigger
client.Triggers.registerTrigger(
  pattern,      // RegExp - Wzorzec do dopasowania
  callback,     // Function(line, matches) - Wywołane przy dopasowaniu
  tag           // String - Tag do grupowania/czyszczenia
);

// Callback otrzymuje:
// - line: AnsiAwareBuffer - Obiekt linii
// - matches: RegExpMatchArray - Wyniki dopasowania regex
// Zwraca: Zmodyfikowaną linię lub oryginalną linię
```

### Manipulacja Liniami

```typescript
// Pokoloruj fragment linii
line.color([startIndex, endIndex], colorObject);

// Dodaj prefix
line.prefix(text, colorObject);

// Dodaj suffix
line.suffix(text);

// Łańcuchowanie metod
line.prefix("[ INFO ] ", COLOR).suffix("\n");
```

### Kolory

```typescript
// Stwórz kolor z hex (wbuduj tę funkcję w swój plugin)
const colorFromHex = (hex: string) => ({
  foreground: { space: "hex", color: hex }
});

const myColor = colorFromHex('#ff0000');
```

### Popularne Kolory (kopiuj do swojego pluginu)

```typescript
const GOLD_COLOR = colorFromHex('#ffd700');
const SILVER_COLOR = colorFromHex('#dadada');
const COPPER_COLOR = colorFromHex('#875f00');
const RED_COLOR = colorFromHex('#ff0000');
const GREEN_COLOR = colorFromHex('#00ff00');
const BLUE_COLOR = colorFromHex('#0000ff');
const YELLOW_COLOR = colorFromHex('#ffff00');
const ORANGE_COLOR = colorFromHex('#ffa500');
```

### Komendy

```typescript
// Wyślij komendę do gry
client.sendCommand(command, echo = true);

// Wypisz do okna gry - WAŻNE: użyj clientAdapter!
client.clientAdapter.output(text, type = "system");

// Wyślij GMCP
client.sendGmcp(type, payload);

// Wyślij wydarzenie (np. dźwięk)
client.sendEvent(eventName, payload);
```

### Wydarzenia

```typescript
// Nasłuchuj wydarzeń
client.on(eventName, callback);

// Usuń listener
client.off(eventName, callback);

// Wyślij własne wydarzenie
client.sendEvent(eventName, payload);

// Popularne wydarzenia:
// - 'gmcp' - Wiadomości GMCP
// - 'command' - Wysłane komendy
// - 'storage' - Zmiany w storage
// - 'sound:play' - Odtwórz dźwięk (payload: { key: "beep" })
```

### Aliasy

```typescript
// Dodaj alias komendy
client.aliases.push({
  pattern: /^\/mojakomenda (.*)$/,
  callback: (matches: RegExpMatchArray) => {
    // matches[1] zawiera przechwyconą grupę
    client.sendCommand(`prawdziwa komenda ${matches[1]}`);
    return true; // Zatrzymaj dalsze przetwarzanie
  }
});
```

## Ładowanie Pluginów

### Przez UI

1. Kliknij przycisk "Skrypty" w kliencie
2. Wpisz URL swojego pluginu
3. Kliknij "Dodaj"
4. Plugin zostanie załadowany i zainicjalizowany

### Przez Parametr URL

```
https://arkadia.rpg.pl/?add-script=https://example.com/moj-plugin.ts
```

### Hostowanie Pluginu

Hostuj swój plugin jako publicznie dostępny plik TypeScript/JavaScript:

```typescript
// https://example.com/moj-plugin.ts

type Client = any;
type PluginInfo = { name: string; version: string; description?: string };

export async function init(client: Client): Promise<PluginInfo> {
  const tag = "mojPlugin";

  const colorFromHex = (hex: string) => ({
    foreground: { space: "hex", color: hex }
  });

  const colorStringInLine = (line: any, text: string, color: any) => {
    const matchIndex = line.text.indexOf(text);
    if (matchIndex === -1) return line;
    return line.color([matchIndex, matchIndex + text.length], color);
  };

  const RED_COLOR = colorFromHex('#ff0000');

  client.Triggers.registerTrigger(
    /niebezpieczenstwo/i,
    (line: any, matches: RegExpMatchArray) => {
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

## Kompatybilność Wsteczna

System pluginów zachowuje pełną kompatybilność wsteczną ze starymi skryptami. Zwykłe pliki JavaScript bez interfejsu pluginu będą załadowane jako "legacy scripts" i wykonają się normalnie.

### Migracja Starych Skryptów

**Przed (Legacy):**
```javascript
const client = window.client;
client.Triggers.registerTrigger(/pattern/, () => {}, "tag");
```

**Po (Plugin):**
```typescript
type Client = any;
type PluginInfo = { name: string; version: string };

export async function init(client: Client): Promise<PluginInfo> {
  client.Triggers.registerTrigger(/pattern/, () => {}, "tag");

  return {
    name: "Mój Plugin",
    version: "1.0.0"
  };
}
```

## Dobre Praktyki

1. **Używaj unikalnych tagów** - Unikaj konfliktów z innymi pluginami
2. **Czyść w destroy()** - Usuwaj event listenery
3. **NIE używaj importów** - Definiuj funkcje pomocnicze w pluginie
4. **Użyj `client.clientAdapter.output()`** - NIE `client.output()`!
5. **Testuj dokładnie** - Sprawdź plugin przed udostępnieniem
6. **Wersjonuj semantycznie** - 1.0.0, 1.1.0, 2.0.0 itp.
7. **Dokumentuj kod** - Dodawaj komentarze
8. **Używaj TypeScript** - Lepsze wsparcie IDE

## Rozwiązywanie Problemów

- **Plugin się nie ładuje** - Sprawdź konsolę przeglądarki (F12)
- **Błędy importu** - NIE używaj importów! Definiuj funkcje inline
- **`client.output()` nie działa** - Użyj `client.clientAdapter.output()`
- **Triggery nie reagują** - Sprawdź wzorzec regex
- **Kolory nie działają** - Użyj funkcji `colorFromHex()` z przykładów
- **Plugin jako "Legacy"** - Dodaj funkcję `init` zwracającą `PluginInfo`
