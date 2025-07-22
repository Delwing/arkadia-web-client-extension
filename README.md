# Rozszerzenie Arkadia Web Client

Rozszerzenie przeglądarki, które rozbudowuje klienta webowego [Arkadia](https://arkadia.rpg.pl/) o takie funkcje jak wbudowana mapa, dodatkowe triggery oraz konfigurowalna strona opcji. Projekt jest zorganizowany jako monorepo Yarn workspaces zarządzane przez Lerna.

## Pakiety

| Pakiet      | Opis                                                              |
|-------------|-------------------------------------------------------------------|
| `client`    | Content script, zawiera modyfikacje klienta i skrypty             |
| `scripts`   | Skrypty pomocnicze do generowania plików danych.                  |
| `sandbox`   | Sandbox do rozwoju (nie jest częścią publikowanego rozszerzenia). |

## Instalowanie zależności

```bash
yarn install
```

## Zarządzanie pamięcią podręczną

Funkcja `loadCachedJSON` zapisuje pobrane dane w IndexedDB. Dodatkowe funkcje
`clearIndexedDB` oraz `updateIndexedDB` pozwalają odpowiednio usuwać i odświeżać
zapisane wpisy.

## Licencja

MIT
