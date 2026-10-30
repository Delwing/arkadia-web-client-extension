<div align="center">

<img src="public/logo.png" alt="Dargoth Client" width="200" />

# Dargoth Client

**Przeglądarkowy klient Arkadii (MUD)** — z mapą, walką, pluginami, edytorem skryptów i synchronizacją między urządzeniami.

[**▶ Zagraj w przeglądarce**](https://delwing.github.io/arkadia-web-client-extension/) · [Dokumentacja](docs/OVERVIEW.md) · [Pluginy](docs/PLUGINS.md)

![React](https://img.shields.io/badge/React-19-61dafb?logo=react&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-5.8-3178c6?logo=typescript&logoColor=white)
![Vite](https://img.shields.io/badge/Vite-7-646cff?logo=vite&logoColor=white)
![PWA](https://img.shields.io/badge/PWA-ready-5a0fc8?logo=pwa&logoColor=white)
![License](https://img.shields.io/badge/licencja-MIT-green)

</div>

---

## ✨ Możliwości

- 🗺️ **Mapa i nawigacja** — mapa z prowadzeniem, zapisanymi miejscami i notatkami do lokacji
- ⚔️ **Walka** — kolorowanie walki, kolejka celów, zasłanianie, śledzenie zabitych
- 🎒 **Ekwipunek** — pojemniki, zbieranie łupów, depozyty, licznik ziół
- ⌨️ **Aliasy, bindy i triggery** — konfigurowane w ustawieniach, bez pisania kodu
- 🧩 **Pluginy** — własne skrypty w TypeScript/JavaScript, z edytorem opartym na Monaco i asystentem AI
- 💬 **Historia czatu i logi sesji** — przeglądarka logów z wyszukiwaniem
- ☁️ **Synchronizacja** — ustawienia i dane między urządzeniami przez Firebase
- 📱 **PWA i telefon** — instalowalna aplikacja, przyciski mobilne, powiadomienia push, wznawianie sesji przez proxy
- 🖥️ **Aplikacja pomocnicza** — natywny tray, globalne skróty i zarządzanie oknem (Windows/macOS/Linux)

## 🚀 Szybki start

Wymagany **Node 24** i **yarn**.

```bash
yarn install
```

```bash
yarn dev
```

| Komenda | Opis |
|---------|------|
| `yarn dev` | Serwer deweloperski |
| `yarn build` | Build produkcyjny |
| `yarn preview` | Podgląd zbudowanej aplikacji |
| `yarn test` | Testy jednostkowe (Vitest) |
| `yarn test:e2e` | Testy end-to-end (Playwright) |
| `yarn lint` | ESLint |

## 🗂️ Struktura projektu

```
src/
├── client/      # Klient gry: triggery, skrypty, pluginy, ANSI, Lua (bez DOM, niezależny od UI)
├── web/         # Aplikacja React: okna, ustawienia, wyświetlacze
├── ui/          # Prymitywy UI, komponenty i przeglądarka logów
├── shared/      # Kod wspólny dla klienta i UI (zdarzenia)
└── modules/     # Usługi: ustawienia, storage, event bus, dane, Firebase, urządzenia
plugins/
├── editor/      # Edytor pluginów (Monaco) — strona editor/
├── examples/    # Przykładowe pluginy z serwerem deweloperskim
└── types/       # Typy API pluginów i narzędzia arkadia-plugin (paczka npm)
views/
├── viewer/      # Widok, w którym pluginy wyświetlają własne komponenty React — strona viewer/
├── log-viewer/  # Samodzielna przeglądarka logów sesji — strona log-viewer/
└── popup/       # Strona ładowana przez okna wyskakujące — strona popup/
services/
├── ai-worker/      # Cloudflare Worker asystenta AI
├── crowd-worker/   # Cloudflare Worker wspólnych list przedmiotów
├── push-worker/    # Cloudflare Worker powiadomień Web Push
├── session-proxy/  # Proxy sesji (Go): wznawialne telnet ↔ WebSocket
└── helper/         # Natywna aplikacja pomocnicza (Go)
docs/            # Dokumentacja dla graczy (i docs/dev dla deweloperów)
test/            # Testy jednostkowe (odzwierciedlają strukturę src/)
e2e/             # Testy end-to-end (Playwright)
scripts/         # Skrypty deweloperskie i generujące dane
public/          # Zasoby statyczne, manifest PWA, ikony
data/            # Dane gry
```

### Viewer dla pluginów

`viewer/` to pusta powłoka, w której plugin może pokazać własny interfejs w osobnym widoku (karcie lub oknie). Ładuje moduł, który domyślnie eksportuje komponent React, i go renderuje:

- `viewer/?module=<url>` — moduł JS pod wskazanym adresem
- `viewer/?code=<base64>` — kod modułu przekazany w URL

Pozostałe parametry URL trafiają do komponentu w propsie `params`. `React` i `ReactDOM` są dostępne globalnie, więc moduł nie musi ich dołączać.

## 🧩 Pluginy

```bash
yarn build:types       # typy API pluginów (plugins/types)
yarn build:examples    # zbuduj przykładowe pluginy
yarn serve:examples    # serwer deweloperski przykładów
```

Typy są publikowane jako [`@dargoth-client/plugin-types`](plugins/types/README.md). Więcej w [`docs/PLUGINS.md`](docs/PLUGINS.md) i [`plugins/examples/`](plugins/examples/README.md).

## 📚 Dokumentacja

| Dla graczy | |
|---|---|
| [Przegląd](docs/OVERVIEW.md) | Ogólny opis klienta |
| [Walka](docs/COMBAT.md) | Atakowanie, zasłanianie, kolejka celów |
| [Nawigacja](docs/NAVIGATION.md) | Chodzenie, mapa, prowadzenie |
| [Ekwipunek](docs/INVENTORY.md) | Pojemniki, łupy, depozyty |
| [Zioła](docs/HERBS.md) | Licznik i zarządzanie ziołami |
| [Śledzenie](docs/TRACKING.md) | Postępy, zabici, zlecenia |
| [Aliasy](docs/ALIASES.md) · [Bindy](docs/BINDS.md) · [Skróty](docs/SHORTCUTS.md) | Komendy i klawisze |
| [Automatyzacje](docs/AUTOMATYZACJE.md) · [Skrypty](docs/SKRYPTY.md) | Triggery, skrypty, wtyczki |
| [Połączenie](docs/POLACZENIE.md) | Bezpośrednio, pomocnik, proxy |
| [Przyciski mobilne](docs/PRZYCISKI_MOBILNE.md) | Sterowanie na telefonie |
| [Dźwięki](docs/AUDIO_SYSTEM.md) | System audio |
| [Dane](docs/DANE.md) · [Synchronizacja](docs/SYNCHRONIZACJA.md) | Przechowywanie i synchronizacja danych |

| Dla deweloperów | |
|---|---|
| [Pluginy](docs/PLUGINS.md) | Tworzenie pluginów |
| [Testowanie skryptów](docs/SCRIPT_TESTING.md) | Jak testować skrypty |
| [Oddzielenie klienta od UI](docs/CLIENT_UI_DECOUPLING.md) | Jak zbudować własny UI na kliencie |
| [`AGENTS.md`](AGENTS.md) | Architektura i konwencje projektu |

## 📄 Licencja

MIT
