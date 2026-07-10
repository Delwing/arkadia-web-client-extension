import type {
    ShellSettings,
    RenderSettings,
    MapSettings,
    BehaviorSettings,
} from '@shared/uiSettingsTypes';
import {
    defaultShellSettings, shellSettingsKeys,
    defaultRenderSettings, renderSettingsKeys,
    defaultMapSettings, mapSettingsKeys,
    defaultBehaviorSettings, behaviorSettingsKeys,
} from '@shared/settingsDefaults';
import { defineUiSettingsSlice } from './defineSettingsAccessor';

export type { SettingsAccessor } from './defineSettingsAccessor';
export { defineUiSettingsSlice } from './defineSettingsAccessor';

/**
 * Concern-scoped settings accessors. A UI (stock or alt) reads/writes only the
 * slices it owns; each accessor is isolated from sibling fields. See
 * `@shared/uiSettingsTypes` for the slice shapes.
 */

const shell = defineUiSettingsSlice<ShellSettings>(shellSettingsKeys, defaultShellSettings);
export const getShellSettings = shell.get;
export const setShellSettings = shell.set;
export const onShellSettingsChange = shell.onChange;

const render = defineUiSettingsSlice<RenderSettings>(renderSettingsKeys, defaultRenderSettings);
export const getRenderSettings = render.get;
export const setRenderSettings = render.set;
export const onRenderSettingsChange = render.onChange;

const map = defineUiSettingsSlice<MapSettings>(mapSettingsKeys, defaultMapSettings);
export const getMapSettings = map.get;
export const setMapSettings = map.set;
export const onMapSettingsChange = map.onChange;

const behavior = defineUiSettingsSlice<BehaviorSettings>(behaviorSettingsKeys, defaultBehaviorSettings);
export const getBehaviorSettings = behavior.get;
export const setBehaviorSettings = behavior.set;
export const onBehaviorSettingsChange = behavior.onChange;
