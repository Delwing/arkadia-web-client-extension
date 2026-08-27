// Telling apart the two kinds of special exit the map records.
//
// Some are places you move onto - "latarnia", "wyjscie", "schody" - and some are commands that
// move you - "wejdz na gore", "zejdz na dol", "zanurkuj". The distinction answers two questions at
// once, because both come down to the same thing:
//
//   * Can the command take a movement prefix? "jedz na wejdz na gore" is not a command.
//   * Can a carriage use the exit at all? You cannot climb a rock while sitting on a wagon; the
//     game says so outright - "Nie mozesz tego zrobic, gdyz siedzisz." - and prefixing it fares no
//     better: "Nie ma zadnej drogi prowadzacej na wejdz na skaly."
//
// A space is the tell. Surveying the published map, every one of the 262 multi-word special exits
// is a command, and of the 138 single-word ones only the four named below are.

/** The only single-word special exits in the published map that are imperatives, not places. */
const VERB_EXITS = new Set(['zanurkuj', 'wyskocz', 'wyplyn', 'zawroc']);

/**
 * Whether an exit names somewhere you can be driven to, rather than an action you have to perform.
 *
 * Compass directions always qualify - they never contain a space, since "polnocny-wschod" is
 * hyphenated. Three rooms record something that is not a command at all (two Mudlet `script:`
 * bodies and one bare room number); those fail the plain-word test and are left alone.
 */
export function isDrivableExit(exit: string): boolean {
    const trimmed = exit.trim();
    if (!/^[a-z][a-z-]*$/i.test(trimmed)) return false;
    return !VERB_EXITS.has(trimmed.toLowerCase());
}
