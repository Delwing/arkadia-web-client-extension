# Przykładowe Pluginy Arkadia

Ten katalog zawiera przykładowe pluginy demonstrujące system pluginów Arkadia Web Client.

## 📦 Dostępne Pluginy

1. **simple-highlighter-plugin.ts** - Prosty plugin do podświetlania słów kolorami
2. **example-plugin.ts** - Kompleksowy przykład pokazujący różne funkcje API
3. **combat-alert-plugin.ts** - Zaawansowany plugin śledzący statystyki walki
4. **gmcp-inspector-plugin.ts** - Podgląd surowych zdarzeń GMCP (filtrowanie, pauza, kopiowanie); przydatny przy pisaniu własnych pluginów

## 🚀 Serwer Deweloperski

Aby ułatwić testowanie pluginów lokalnie, dostępny jest serwer deweloperski Express, który:
- Automatycznie kompiluje pluginy TypeScript do JavaScript
- Serwuje je przez HTTP z odpowiednimi nagłówkami CORS
- Dostarcza przyjazny interfejs WWW do kopiowania URL-i pluginów

### Uruchomienie Serwera

```bash
# Zbuduj pluginy (kompilacja .ts do .js)
yarn build:examples

# Uruchom serwer deweloperski
yarn serve:examples
```

Serwer uruchomi się na `http://localhost:3030`

### Używanie Pluginów z Serwera Deweloperskiego

1. Otwórz `http://localhost:3030` w przeglądarce
2. Zobaczysz listę dostępnych pluginów z ich opisami
3. Kliknij "Kopiuj URL" przy wybranym pluginie
4. Otwórz Arkadia Web Client
5. Kliknij przycisk "Skrypty"
6. Wklej skopiowany URL (np. `http://localhost:3030/plugins/example-plugin.js`)
7. Kliknij "Dodaj"
8. Plugin zostanie załadowany i zainicjalizowany

### Edycja Pluginów

Możesz edytować pliki `.ts` w tym katalogu:

```bash
# Po dokonaniu zmian:
yarn build:examples

# Jeśli serwer jest uruchomiony, zrestartuj go:
# Ctrl+C, następnie:
yarn serve:examples
```

W kliencie Arkadia usuń i ponownie dodaj URL pluginu, aby załadować nową wersję.

## 📚 Dokumentacja

Pełna dokumentacja API pluginów dostępna w: `../docs/PLUGINS.md`

## 📦 TypeScript - Typy dla Pluginów

Aby uzyskać pełne wsparcie TypeScript z autocomplete i sprawdzaniem typów, zainstaluj pakiet z definicjami typów:

```bash
# Zainstaluj z serwera
npm install http://delwing.github.io/arkadia-web-client-extension/arkadia-plugin-types.tgz

# Lub zainstaluj z lokalnego serwera deweloperskiego (jeśli uruchomiony)
npm install http://localhost:3030/types/arkadia-plugin-types.tgz

# Lub zainstaluj z lokalnego systemu plików
npm install ../plugin-types
```

Po zainstalowaniu możesz importować typy w swoich pluginach:

```typescript
import type { PluginApi, PluginInfo } from '@arkadia/plugin-types';

export async function init(api: PluginApi): Promise<PluginInfo> {
  // Teraz masz pełne wsparcie IDE z autocomplete!
  api.triggers.register(
    /pattern/i,
    (line, matches) => {
      // TypeScript wie o wszystkich metodach dostępnych na 'line'
      return line.prefix(">> ");
    },
    "myPlugin"
  );

  return {
    name: "My Plugin",
    version: "1.0.0"
  };
}
```

Zobacz `../plugin-types/README.md` dla pełnej dokumentacji typów.

## ⚡ Szybki Start - Tworzenie Własnego Pluginu

```typescript
// moj-plugin.ts
import type { PluginApi, PluginInfo } from '@arkadia/plugin-types';

export async function init(api: PluginApi): Promise<PluginInfo> {
  const tag = "mojPlugin";

  // Użyj wbudowanych API do kolorów
  const RED_COLOR = api.colors.fromHex('#ff0000');

  // Funkcja pomocnicza do kolorowania tekstu
  const colorStringInLine = (line: any, text: string, color: any) => {
    const matchIndex = line.text.indexOf(text);
    if (matchIndex === -1) return line;
    return line.color([matchIndex, matchIndex + text.length], color);
  };

  // Zarejestruj trigger
  api.triggers.register(
    /moj-wzorzec/i,
    (line, matches) => {
      return colorStringInLine(line, matches[0], RED_COLOR);
    },
    tag
  );

  return {
    name: "Mój Plugin",
    version: "1.0.0",
    description: "Opis mojego pluginu"
  };
}

export async function destroy(): Promise<void> {
  // Opcjonalne czyszczenie
}
```

## ⚠️ Ważne Uwagi

- Zawsze importuj typy z `'@arkadia/plugin-types'` dla pełnego wsparcia TypeScript
- Używaj `api.colors.fromHex()` zamiast definiować własne funkcje kolorowania
- Używaj `api.output.print()` do wyświetlania wiadomości systemowych
- Używaj `api.events.emit()` do odtwarzania dźwięków i innych eventów
- Każdy plugin powinien używać unikalnego `tag` dla swoich triggerów

## 🛠️ Struktura Plików

```
examples/
├── README.md                          # Ten plik
├── build.cjs                          # Skrypt budowania (esbuild)
├── server.cjs                         # Serwer deweloperski (Express)
├── simple-highlighter-plugin.ts       # Przykład: prosty
├── example-plugin.ts                  # Przykład: średnio zaawansowany
├── combat-alert-plugin.ts             # Przykład: zaawansowany
└── dist/                              # Skompilowane pliki .js (generowane)
    ├── simple-highlighter-plugin.js
    ├── example-plugin.js
    └── combat-alert-plugin.js
```

## 🐛 Rozwiązywanie Problemów

### Plugin się nie ładuje

- Sprawdź konsolę przeglądarki (F12) w kliencie Arkadia
- Upewnij się, że serwer jest uruchomiony (`yarn serve:examples`)
- Sprawdź, czy URL jest poprawny (powinien kończyć się na `.js`)
- Upewnij się, że plugin został zbudowany (`yarn build:examples`)

### Błędy TypeScript podczas kompilacji

- Sprawdź, czy nie używasz importów z modułów klienta
- Upewnij się, że wszystkie typy są zdefiniowane lokalnie w pluginie

### Zmiany w pluginie nie są widoczne

- Przebuduj plugin: `yarn build:examples`
- W kliencie Arkadia: usuń i ponownie dodaj URL pluginu
- Alternatywnie: przeładuj całą stronę klienta (F5)

## 💡 Wskazówki

- Rozpocznij od `simple-highlighter-plugin.ts` jeśli jesteś nowy w tworzeniu pluginów
- Użyj `example-plugin.ts` jako szablonu dla bardziej złożonych funkcji
- Zobacz `combat-alert-plugin.ts` dla przykładu śledzenia stanu i statystyk
- Testuj lokalnie z serwerem deweloperskim przed wdrożeniem na produkcję

## 📝 Popularne Wzorce

### Podświetlanie Tekstu

```typescript
const RED_COLOR = api.colors.fromHex('#ff0000');

const colorStringInLine = (line: any, text: string, color: any) => {
  const matchIndex = line.text.indexOf(text);
  if (matchIndex === -1) return line;
  return line.color([matchIndex, matchIndex + text.length], color);
};

api.triggers.register(
  /wazne/i,
  (line, matches) => {
    return colorStringInLine(line, matches[0], RED_COLOR);
  },
  tag
);
```

### Dodawanie Prefiksu/Suffiksu

```typescript
api.triggers.register(
  /alarm/i,
  (line) => {
    return line.prefix("⚠️  ", COLOR).suffix("\n");
  },
  tag
);
```

### Odtwarzanie Dźwięków

```typescript
api.triggers.register(
  /niebezpieczenstwo/i,
  (line) => {
    api.events.emit("sound:play", { key: "beep" });
    return line;
  },
  tag
);
```

### Własne Komendy

```typescript
api.aliases.register(/^\/mojakomenda (.+)$/, (matches) => {
  const arg = matches[1];
  api.output.print(`Wykonano komendę z argumentem: ${arg}`);
  return true;
});
```

### Nasłuchiwanie Eventów

```typescript
api.events.on("mapMove", () => {
  console.log("Gracz się przesunął na mapie");
});

api.events.on("enemyKilled", (payload) => {
  api.output.print(`Zabito wroga: ${payload.objNum}`);
});
```

## 🎨 Kolory

Zdefiniuj własne kolory używając API:

```typescript
const GOLD_COLOR = api.colors.fromHex('#ffd700');
const SILVER_COLOR = api.colors.fromHex('#c0c0c0');
const RED_COLOR = api.colors.fromHex('#ff0000');
const GREEN_COLOR = api.colors.fromHex('#00ff00');
const BLUE_COLOR = api.colors.fromHex('#0000ff');
```
