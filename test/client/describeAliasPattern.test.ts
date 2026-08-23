import { describe, test, expect } from 'vitest';
import { describeAliasPattern } from '@client/ScriptRegistry';

/**
 * The alias patterns are regexes; the feature list shows what a user would type.
 * These are all real patterns lifted from scripts/.
 */
describe('describeAliasPattern', () => {
    test('a plain command reads as itself', () => {
        expect(describeAliasPattern(/^\/zabici$/)).toBe('/zabici');
        expect(describeAliasPattern(/^\/pokaz_skroty$/)).toBe('/pokaz_skroty');
    });

    test('a command with arguments says so', () => {
        // Showing "/zabici2" alone would read as a command that takes none.
        expect(describeAliasPattern(/^\/zabici2 (\d{4}\/\d{1,2}\/\d{1,2})$/)).toBe('/zabici2 …');
        expect(describeAliasPattern(/^\/dodaj_skrot ([0-9]+) "([^"]+)"(?:\s+(.*))?$/)).toBe('/dodaj_skrot …');
    });

    test('an unanchored pattern works too', () => {
        expect(describeAliasPattern(/\/fake (?:--type=(\S+) )?(.+)/)).toBe('/fake …');
    });

    test('escaped punctuation is part of the command', () => {
        expect(describeAliasPattern(/^\/postepy2\+$/)).toBe('/postepy2+');
        expect(describeAliasPattern(/^\/zabici2!$/)).toBe('/zabici2!');
    });

    test('a character class ends the literal', () => {
        expect(describeAliasPattern(/^\/dob ([1-3])$/)).toBe('/dob …');
        expect(describeAliasPattern(/^(\d+)(?:-(\d+))?$/)).toBeNull();
    });

    test('a pattern with no literal head has nothing to show', () => {
        expect(describeAliasPattern(/^(.*)$/)).toBeNull();
    });

    test('a dangling opening quote is not part of the command', () => {
        // /usun_skrot "([^"]+)" leaves a trailing quote that belongs to the
        // pattern, not to anything a user types.
        expect(describeAliasPattern(new RegExp(String.raw`^/usun_skrot "([^"]+)"$`))).toBe('/usun_skrot …');
    });
});
