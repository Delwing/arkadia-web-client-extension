// Some room-wide messages ("... wypala sie i gasnie.") are shown for every
// character present, not just you — a pipe, a lamp and similar items burning
// out all read the same way for everyone in the location. A line names another
// character as the owner in one of two ways:
//
//   * an introduced character, as a capitalized name in the middle of the
//     sentence ("Stara wygieta fajka Pabla wypala sie i gasnie.") — already
//     excluded by patterns that only allow lowercase words around the noun; or
//   * an unintroduced character, as a genitive "jakiegos/jakiejs tam <rasa>"
//     ("... fajka jakiegos tam krasnoluda wypala sie i gasnie.").
//
// These are the genitive owner words that flag the second form. Drop a line
// containing any of them: the item belongs to someone else, so it must not
// drive your own state.
export const OTHER_OWNER_WORDS = [
    "jakiegos", "jakiejs",
    "elfa", "elfki", "mezczyzny", "kobiety", "ogra", "ogrzycy",
    "krasnoluda", "krasnoludki", "polelfa", "polelfki", "niziolka", "niziolki",
    "halflinga", "halflinki", "mutanta", "mutantki", "gnoma", "gnomki",
];

// Regex fragment (an alternation) for use inside a larger pattern, typically a
// negative lookahead: `^(?!.*\\b(?:${OTHER_OWNER_WORDS_ALT})\\b)...`.
export const OTHER_OWNER_WORDS_ALT = OTHER_OWNER_WORDS.join("|");
