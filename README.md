# Arkadia Web Client

Przeglądarkowy klient Arkadii z wbudowaną mapą, własnymi triggerami oraz konfigurowalną stroną ustawień.

## Struktura projektu

| Katalog | Opis |
|---------|------|
| `src/client` | Skrypt uruchamiany w kliencie Arkadii; zawiera poprawki, triggery i towarzyszące skrypty. |
| `src/web` | Aplikacja React używana jako interfejs klienta i strona ustawień. |
| `src/shared` | Wspólny kod używany zarówno przez klienta jak i interfejs webowy. |
| `e2e` | Testy end-to-end używające Playwright. |
| `scripts` | Skrypty pomocnicze do generowania danych dla projektu. |

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

## Budowanie

Zbuduj aplikację:

```bash
yarn build
```

## Licencja

MIT

