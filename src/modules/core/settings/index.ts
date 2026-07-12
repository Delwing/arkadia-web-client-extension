import type {
    ShellSettings,
    RenderSettings,
    MapSettings,
    BehaviorSettings,
    DeviceViewSettings,
} from '@shared/uiSettingsTypes';
import {
    defaultShellSettings, shellSettingsKeys,
    defaultRenderSettings, renderSettingsKeys,
    defaultMapSettings, mapSettingsKeys,
    defaultBehaviorSettings, behaviorSettingsKeys,
    defaultDeviceViewSettings, deviceViewSettingsKeys,
} from '@shared/settingsDefaults';
import { defineUiSettingsSlice } from './defineSettingsAccessor';

export type { SettingsAccessor } from './defineSettingsAccessor';
export { defineUiSettingsSlice } from './defineSettingsAccessor';

/**
 * Concern-scoped settings accessors. A UI (stock or alt) reads/writes only the
 * slices it owns; each accessor is isolated from sibling fields. See
 * `@shared/uiSettingsTypes` for the slice shapes.
 */

const shell = defineUiSettingsSlice<ShellSettings>(shellSettingsKeys, defaultShellSettings, 'shellSettings');
export const getShellSettings = shell.get;
export const setShellSettings = shell.set;
export const onShellSettingsChange = shell.onChange;

const render = defineUiSettingsSlice<RenderSettings>(renderSettingsKeys, defaultRenderSettings, 'renderSettings');
export const getRenderSettings = render.get;
export const setRenderSettings = render.set;
export const onRenderSettingsChange = render.onChange;

const map = defineUiSettingsSlice<MapSettings>(mapSettingsKeys, defaultMapSettings, 'mapSettings');
export const getMapSettings = map.get;
export const setMapSettings = map.set;
export const onMapSettingsChange = map.onChange;

const behavior = defineUiSettingsSlice<BehaviorSettings>(behaviorSettingsKeys, defaultBehaviorSettings, 'behaviorSettings');
export const getBehaviorSettings = behavior.get;
export const setBehaviorSettings = behavior.set;
export const onBehaviorSettingsChange = behavior.onChange;

// Device-scoped view prefs (font size, map zoom, output buffer size). Unlike the
// slices above, these are physically backed by the device-scoped `uiSettings`
// blob, so they stay per-device rather than syncing across devices.
const deviceView = defineUiSettingsSlice<DeviceViewSettings>(deviceViewSettingsKeys, defaultDeviceViewSettings, 'uiSettings');
export const getDeviceViewSettings = deviceView.get;
export const setDeviceViewSettings = deviceView.set;
export const onDeviceViewSettingsChange = deviceView.onChange;
