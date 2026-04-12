# Arkadia Web Client

Przeglądarkowy klient Arkadii (MUD) z wbudowaną mapą, systemem pluginów, własnymi triggerami, edytorem skryptów oraz konfigurowalną stroną ustawień. Aplikacja działa jako PWA — można ją zainstalować na komputerze i urządzeniach mobilnych.

## Struktura projektu

| Katalog | Opis |
|---------|------|
| `src/client` | Skrypt uruchamiany w kliencie Arkadii; zawiera poprawki, triggery i towarzyszące skrypty. |
| `src/web` | Aplikacja React używana jako interfejs klienta i strona ustawień. |
| `src/shared` | Wspólny kod używany zarówno przez klienta jak i interfejs webowy. |
| `src/modules` | Moduły odpowiedzialne za usługi (event bus, storage, Firebase, zarządzanie urządzeniami). |
| `editor` | Edytor pluginów oparty na Monaco Editor. |
| `viewer` | Przeglądarka logów sesji. |
| `log-viewer` | Samodzielna przeglądarka logów (oddzielny entry point). |
| `helper` | Natywna aplikacja pomocnicza (Go) — system tray, hotkeye, zarządzanie oknem. |
| `examples` | Przykładowe pluginy z serwerem deweloperskim. |
| `docs` | Dokumentacja funkcjonalności (aliasy, bindy, walka, nawigacja, pluginy i inne). |
| `plugin-types` | Definicje typów TypeScript dla API pluginów. |
| `e2e` | Testy end-to-end używające Playwright. |
| `test` | Testy jednostkowe (Vitest). |
| `scripts` | Skrypty pomocnicze do generowania danych dla projektu. |
| `public` | Zasoby statyczne, manifest PWA i ikony. |

## Technologie

- **React 19** + **TypeScript 5.8**
- **Vite 7** (bundler i serwer deweloperski)
- **React-Bootstrap 2** / **Bootstrap 5**
- **Monaco Editor** (edytor pluginów)
- **Firebase** (synchronizacja danych)
- **Vitest** (testy jednostkowe) + **Playwright** (testy e2e)
- **Lua-in-js** (wsparcie skryptów Lua)

## Instalacja

Zainstaluj zależności:

```bash
yarn install
```

## Rozwój

Uruchom serwer deweloperski:

```bash
yarn dev
```

## Testy

Uruchom testy jednostkowe:

```bash
yarn test
```

Uruchom testy end-to-end:

```bash
yarn test:e2e
```

Uruchom linter:

```bash
yarn lint
```

## Budowanie

Zbuduj aplikację:

```bash
yarn build
```

Podgląd zbudowanej aplikacji:

```bash
yarn preview
```

## Pluginy

Generuj typy dla API pluginów:

```bash
yarn generate:plugin-types
```

Zbuduj przykładowe pluginy:

```bash
yarn build:examples
```

Uruchom serwer deweloperski przykładów:

```bash
yarn serve:examples
```

Więcej informacji o systemie pluginów: [`docs/PLUGINS.md`](docs/PLUGINS.md).

## Dokumentacja

Szczegółowa dokumentacja znajduje się w katalogu [`docs/`](docs/):

- [Przegląd](docs/OVERVIEW.md) — ogólny opis projektu
- [Aliasy](docs/ALIASES.md) — definiowanie aliasów
- [Bindy](docs/BINDS.md) — skróty klawiszowe
- [Walka](docs/COMBAT.md) — system walki
- [Nawigacja](docs/NAVIGATION.md) — poruszanie się i mapa
- [Ekwipunek](docs/INVENTORY.md) — zarządzanie przedmiotami
- [Zioła](docs/HERBS.md) — system ziół
- [Śledzenie](docs/TRACKING.md) — śledzenie postępów
- [Skróty](docs/SHORTCUTS.md) — skróty i komendy
- [Synchronizacja](docs/SYNCHRONIZACJA.md) — synchronizacja ustawień między urządzeniami
- [Pluginy](docs/PLUGINS.md) — tworzenie pluginów
- [Testowanie skryptów](docs/SCRIPT_TESTING.md) — jak testować skrypty

## Licencja

MIT
