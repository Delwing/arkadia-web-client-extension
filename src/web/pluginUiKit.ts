/**
 * The React and UI components the web UI hands to plugins.
 *
 * Exposed as `api.ui.react` / `api.ui.components` through the plugin-host port,
 * and on `globalThis.__arkadiaPluginUi` for bundled plugins whose `react` and
 * `@arkadia/ui` imports are mapped to it (see @shared/pluginUiGlobal).
 *
 * The component set is deliberately small and experimental: every component
 * here becomes something plugins depend on, so add one only when a plugin
 * needs it.
 */
import React from 'react';
import type { PluginUiKit } from '@client/ports';
import { PLUGIN_UI_GLOBAL, type PLUGIN_UI_COMPONENT_NAMES } from '@shared/pluginUiGlobal.ts';
import {
    Button,
    Check,
    Field,
    HeaderButton,
    Input,
    MenuButton,
    Notice,
    Segmented,
    Select,
} from '@web-ui/primitives';

const components: Record<typeof PLUGIN_UI_COMPONENT_NAMES[number], unknown> = {
    Button,
    Check,
    Field,
    HeaderButton,
    Input,
    MenuButton,
    Notice,
    Segmented,
    Select,
};

const kit: PluginUiKit = Object.freeze({ React, components: Object.freeze({ ...components }) });

export function getPluginUiKit(): PluginUiKit {
    return kit;
}

/** Publish the kit for bundled plugins. Called once when the UI installs its ports. */
export function publishPluginUiKit(): void {
    (globalThis as Record<string, unknown>)[PLUGIN_UI_GLOBAL] = kit;
}
