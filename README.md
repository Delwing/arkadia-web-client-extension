# Rozszerzenie Arkadia Web Client

Rozszerzenie przeglądarki, które rozbudowuje klienta webowego [Arkadia](https://arkadia.rpg.pl/) o takie funkcje jak wbudowana mapa, dodatkowe triggery oraz konfigurowalna strona opcji. Projekt jest zorganizowany jako monorepo Yarn workspaces zarządzane przez Lerna.

## Pakiety

| Pakiet      | Opis |
|-------------|------------------------------------------------------------|
| `client`    | Content script, zawiera modyfikacje klienta i skrypty |
| `web-client` | Aplikacja React wykorzystywana do rozwoju oraz strona opcji |
| `scripts`   | Skrypty pomocnicze do generowania plików danych |

## Instalowanie zależności

```bash
yarn install
```

## Uruchamianie testów

```bash
yarn --cwd client test
```

## Uruchamianie web-client

Aplikacja `web-client` służy do rozwoju i zawiera stronę opcji.
Uruchom ją poleceniem:

```bash
cd web-client
yarn dev
```

## Zarządzanie pamięcią podręczną

Funkcja `loadCachedJSON` zapisuje pobrane dane w IndexedDB. Dodatkowe funkcje
`clearIndexedDB` oraz `updateIndexedDB` pozwalają odpowiednio usuwać i odświeżać
zapisane wpisy.

## Licencja

MIT
