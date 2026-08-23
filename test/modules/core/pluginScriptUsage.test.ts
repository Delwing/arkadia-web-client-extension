import { describe, test, expect, beforeEach } from 'vitest';
import {
    recordPluginScriptUsage,
    getPluginsUsingScript,
    forgetPluginScriptUsage,
    __resetPluginScriptUsage,
} from '@modules/core/pluginScriptUsage';

/**
 * The attribution the toggle warning is built on: turning off one of the three
 * plugin-facing scripts has to be able to name whose plugin it affects.
 * See docs/SCRIPT_DEPENDENCIES.md, *Decisions* §1.
 */
describe('pluginScriptUsage', () => {
    beforeEach(() => __resetPluginScriptUsage());

    test('a script nobody has touched names nobody', () => {
        expect(getPluginsUsingScript('prettyContainers')).toEqual([]);
    });

    test('it remembers who used what', () => {
        recordPluginScriptUsage('prettyContainers', 'plugin-a');
        recordPluginScriptUsage('herbCounter', 'plugin-b');

        expect(getPluginsUsingScript('prettyContainers')).toEqual(['plugin-a']);
        expect(getPluginsUsingScript('herbCounter')).toEqual(['plugin-b']);
    });

    test('repeated use lists a plugin once', () => {
        recordPluginScriptUsage('bagManager', 'plugin-a');
        recordPluginScriptUsage('bagManager', 'plugin-a');
        recordPluginScriptUsage('bagManager', 'plugin-b');

        expect(getPluginsUsingScript('bagManager')).toEqual(['plugin-a', 'plugin-b']);
    });

    test('usage is remembered, not sampled', () => {
        // A plugin that registered a filter at load time and never called again is
        // exactly the one that would break quietly, so the record has to outlive
        // the call.
        recordPluginScriptUsage('prettyContainers', 'plugin-a');

        expect(getPluginsUsingScript('prettyContainers')).toEqual(['plugin-a']);
    });

    test('unloading a plugin stops it being named', () => {
        recordPluginScriptUsage('prettyContainers', 'plugin-a');
        recordPluginScriptUsage('herbCounter', 'plugin-a');
        recordPluginScriptUsage('herbCounter', 'plugin-b');

        forgetPluginScriptUsage('plugin-a');

        // It can no longer be broken by turning a script off, so warning about it
        // would be false.
        expect(getPluginsUsingScript('prettyContainers')).toEqual([]);
        expect(getPluginsUsingScript('herbCounter')).toEqual(['plugin-b']);
    });
});
