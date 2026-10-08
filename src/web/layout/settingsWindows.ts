import { getObjectListChrome } from './builtInChrome';
import { MAP_SETTINGS_FIELDS } from './mapSettingsFields';
import { OBJECT_LIST_SETTINGS_FIELDS } from './objectListSettingsFields';
import { getRegisteredPopups } from './popupRegistry';
import { OBJECT_LIST_OTHERS_ID, PANEL_CONFIGS } from './types';
import type { WindowSettingField } from './windowSettings';

/**
 * Which windows have settings and what they are: the cog in a window's header
 * and the "Ustawienia okien" section of the settings dialog (which reaches them
 * where the header has no room for a cog, on a phone say) read the same list.
 */

/** The built-in windows with settings, in the order the settings dialog lists them. */
const BUILT_IN_SETTINGS_WINDOWS = ['objectList', OBJECT_LIST_OTHERS_ID, 'map'];

/** Windows with a settings cog: every popup plus the built-in Kondycje (and its non-team window) and map. */
export function hasWindowSettings(windowId: string, isPopup: boolean): boolean {
  return isPopup || BUILT_IN_SETTINGS_WINDOWS.includes(windowId);
}

/** The map is a canvas, not text — its settings are only its own fields. */
export function hasAppearanceSettings(windowId: string): boolean {
  return windowId !== 'map';
}

/** A built-in window's own fields (popups register theirs with the popup). */
export function builtInSettingsFields(windowId: string): WindowSettingField[] | undefined {
  if (windowId === 'map') return MAP_SETTINGS_FIELDS;
  // forge-ui retitles Kondycje and drops its stock actions, these with them.
  if (windowId === 'objectList' && !getObjectListChrome()?.hideStockActions) return OBJECT_LIST_SETTINGS_FIELDS;
  return undefined;
}

export interface SettingsWindow {
  id: string;
  title: string;
  fields?: WindowSettingField[];
  appearance: boolean;
}

/**
 * Every window whose settings can be changed now: the built-in ones, then the
 * open popups by title. A closed popup is not registered, so neither its title
 * nor its own fields are known until it opens.
 */
export function listSettingsWindows(): SettingsWindow[] {
  const builtIns = BUILT_IN_SETTINGS_WINDOWS.map(id => ({
    id,
    title: (id === 'objectList' ? getObjectListChrome()?.title : undefined) ?? PANEL_CONFIGS[id]?.title ?? id,
    fields: builtInSettingsFields(id),
    appearance: hasAppearanceSettings(id),
  }));
  const popups = getRegisteredPopups()
    .map(p => ({
      id: p.id,
      title: p.config.title || p.id,
      fields: p.settingsFields,
      appearance: hasAppearanceSettings(p.id),
    }))
    .sort((a, b) => a.title.localeCompare(b.title, 'pl'));
  return [...builtIns, ...popups];
}
