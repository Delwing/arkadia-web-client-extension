# Rozszerzenie Arkadia Web Client

Rozszerzenie przeglądarki, które rozbudowuje klienta webowego [Arkadia](https://arkadia.rpg.pl/) o takie funkcje jak wbudowana mapa, dodatkowe triggery oraz konfigurowalna strona opcji. Projekt jest zorganizowany jako monorepo Yarn workspaces zarządzane przez Lerna.

## Pakiety

| Pakiet      | Opis                                                              |
|-------------|-------------------------------------------------------------------|
| `extension` | Gotowe rozszerzenie                                               |
| `client`    | Content script, zawiera modyfikacje klienta i skrypty             |
| `options`   | Strona opcji rozszerzenia                                         |
| `scripts`   | Skrypty pomocnicze do generowania plików danych.                  |
| `sandbox`   | Sandbox do rozwoju (nie jest częścią publikowanego rozszerzenia). |

## Instalowanie zależności

```bash
yarn install
```

## Budowanie rozszerzenia

Uruchom poniższe polecenie w katalogu głównym repozytorium:

```bash
yarn build
```

Polecenie wywołuje zadania budujące wszystkich przestrzeni roboczych przez Lerna i pakuje katalog `extension` do archiwum o nazwie `arkadia-extension.<timestamp>.zip`.

W trakcie rozwoju możesz automatycznie przebudowywać projekt po zmianach:

```bash
yarn watch
```

Możesz również uruchamiać skrypty pojedynczej przestrzeni roboczej, na przykład:

```bash
yarn workspace client build
```

## Instalacja

Plik .zip z rozszerzeniem do pobrania z https://github.com/Delwing/arkadia-web-client-extension/releases/latest. Aby załadować wtyczkę do Chrome w trybie deweloperskim:

1. Pobierz plik `arkadia-extension.zip` z wybranego wydania i rozpakuj go.
2. Otwórz w Chrome stronę `chrome://extensions` i włącz **Tryb dewelopera** za pomocą przełącznika w prawym górnym rogu.
3. Kliknij **Wczytaj rozpakowany** i wskaż rozpakowany katalog `extension`.
4. Możesz też po prostu przeciągnąć pobrane archiwum zip na stronę `chrome://extensions`, a Chrome sam zainstaluje rozszerzenie.

Rozszerzenie pojawi się na liście i będzie można je ponownie wczytać po pobraniu nowszego wydania.

## Uruchamianie sandbox

Sandbox to osobna aplikacja przydatna do lokalnych testów. Uruchom ją poleceniem:

```bash
cd sandbox
yarn install
yarn dev
```

Następnie otwórz w przeglądarce `http://localhost:5173`, aby wypróbować funkcje bez pakowania rozszerzenia.

## Licencja

MIT
