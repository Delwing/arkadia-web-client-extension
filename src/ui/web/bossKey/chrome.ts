/**
 * Polish UI strings for the fake Word window rendered by the boss key overlay.
 *
 * Every non-ASCII character is written as a `\uXXXX` escape. The rest of
 * `src/web` and `src/ui/web` contains no Polish diacritics at all (the game
 * speaks ASCII-transliterated Polish, so the codebase follows suit), but the
 * whole point of this overlay is that it passes for Word at a glance -- and a
 * ribbon reading "Narzedzia glowne" does not. Escaping keeps the source ASCII
 * like its neighbours while the rendered chrome stays correct.
 *
 * Regenerate with the escape helper rather than typing escapes by hand.
 */

export const APP_TITLE = "Sprawozdanie_Q3_wersja_final2.docx";

export const APP_NAME = "Word";

export const AUTOSAVE = "Autozapis";

export const SEARCH_PLACEHOLDER = "Szukaj";

export const SAVED_STATE = "Zapisano";

export const TABS = [
    "Plik",
    "Narz\u0119dzia g\u0142\u00f3wne",
    "Wstawianie",
    "Rysowanie",
    "Projektowanie",
    "Uk\u0142ad",
    "Odwo\u0142ania",
    "Korespondencja",
    "Recenzja",
    "Widok",
    "Pomoc",
];

export const GROUP_CLIPBOARD = "Schowek";

export const GROUP_FONT = "Czcionka";

export const GROUP_PARAGRAPH = "Akapit";

export const GROUP_STYLES = "Style";

export const GROUP_EDITING = "Edytowanie";

export const PASTE = "Wklej";

export const CUT = "Wytnij";

export const COPY = "Kopiuj";

export const FORMAT_PAINTER = "Malarz format\u00f3w";

export const FONT_NAME = "Calibri (Tekst podstawowy)";

export const STYLE_NORMAL = "Normalny";

export const STYLE_NO_SPACING = "Bez odst\u0119p\u00f3w";

export const STYLE_HEADING1 = "Nag\u0142\u00f3wek 1";

export const STYLE_HEADING2 = "Nag\u0142\u00f3wek 2";

export const STYLE_TITLE = "Tytu\u0142";

export const FIND = "Znajd\u017a";

export const REPLACE = "Zamie\u0144";

export const SELECT = "Zaznacz";

export const STATUS_PAGE = "Strona {0} z {1}";

export const STATUS_WORDS = "Wyrazy: 1247";

export const STATUS_LANGUAGE = "Polski (Polska)";

export const STATUS_ACCESSIBILITY = "U\u0142atwienia dost\u0119pu: wszystko gotowe";

export const DOC_TITLE = "Sprawozdanie z realizacji zada\u0144 w III kwartale";

export const DOC_SUBTITLE = "Zesp\u00f3\u0142 Operacyjny \u2014 wersja robocza do konsultacji";

export const DOC_H1 = "1. Podsumowanie okresu";

export const DOC_P1 = "W omawianym kwartale kontynuowano prace nad ujednoliceniem procedur wewn\u0119trznych oraz aktualizacj\u0105 dokumentacji przekazanej przez jednostki wsp\u00f3\u0142pracuj\u0105ce. Zakres zada\u0144 pozosta\u0142 zgodny z harmonogramem przyj\u0119tym w poprzednim okresie sprawozdawczym, z uwzgl\u0119dnieniem korekt wynikaj\u0105cych z bie\u017c\u0105cej analizy obci\u0105\u017cenia zespo\u0142\u00f3w.";

export const DOC_P2 = "Nie odnotowano istotnych odchyle\u0144 od za\u0142o\u017conych wska\u017anik\u00f3w. Pozycje wymagaj\u0105ce dodatkowego om\u00f3wienia zestawiono w za\u0142\u0105czniku nr 2, wraz z propozycj\u0105 termin\u00f3w realizacji w kolejnym kwartale.";

export const DOC_H2 = "2. Realizacja zada\u0144 szczeg\u00f3\u0142owych";

export const DOC_P3 = "Zadania przypisane poszczeg\u00f3lnym kom\u00f3rkom organizacyjnym realizowano w trybie ci\u0105g\u0142ym. Weryfikacja post\u0119p\u00f3w odbywa\u0142a si\u0119 na cotygodniowych spotkaniach statusowych, kt\u00f3rych protoko\u0142y przekazano do wiadomo\u015bci kierownictwa zgodnie z obowi\u0105zuj\u0105cym obiegiem dokument\u00f3w.";

export const DOC_P4 = "W dalszym ci\u0105gu rekomenduje si\u0119 utrzymanie dotychczasowego trybu raportowania, przy jednoczesnym ograniczeniu liczby zestawie\u0144 cz\u0105stkowych do niezb\u0119dnego minimum.";



export const NAV_TITLE = "Nawigacja";

export const NAV_SEARCH = "Przeszukaj dokument";

export const NAV_TAB_HEADINGS = "Nag\u0142\u00f3wki";

export const NAV_TAB_PAGES = "Strony";

export const NAV_TAB_RESULTS = "Wyniki";

export const NAV_EMPTY = "Utw\u00f3rz w dokumencie nag\u0142\u00f3wki, aby wy\u015bwietli\u0107 je w konspekcie.";

export const FIGURE_CAPTION = "Rysunek 1. Schemat obiegu dokument\u00f3w w jednostce";

export const CHART_CAPTION = "Wykres 1. Realizacja wska\u017anik\u00f3w w uj\u0119ciu kwartalnym";

export const NAV_ATTACKED_BY = "Atakuj\u0105:";
