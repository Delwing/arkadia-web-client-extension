# Arkadia Web Client

Przeglądarkowy klient Arkadii z wbudowaną mapą, własnymi triggerami oraz konfigurowalną stroną ustawień. Repozytorium jest zorganizowane jako monorepo Yarn workspaces.

## Pakiety

| Pakiet | Opis |
|--------|------|
| `client` | Skrypt uruchamiany w kliencie Arkadii; zawiera poprawki, triggery i towarzyszące skrypty. |
| `web-client` | Aplikacja React używana podczas rozwoju oraz jako strona ustawień. |
| `scripts` | Skrypty pomocnicze do generowania danych dla projektu. |

## Instalacja

Zainstaluj zależności dla wszystkich przestrzeni roboczych:

```bash
yarn install
```

## Rozwój

- Uruchom serwer deweloperski web-clienta:

  ```bash
  yarn --cwd web-client dev
  ```

- Przebuduj skrypt klienta przy zmianie plików:

  ```bash
  yarn --cwd client watch
  ```

## Testy

Uruchom testy jednostkowe dla każdego pakietu:

```bash
yarn --cwd client test
yarn --cwd web-client test
```

## Budowanie

Zbuduj aplikację React web-client:

```bash
yarn --cwd web-client build
```

## Licencja

MIT

