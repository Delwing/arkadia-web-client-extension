import type { WindowSettingField } from './windowSettings';
import { SEPARATE_OTHERS_SETTING } from './types';

/**
 * Kondycje's options in its settings cog. ObjectList and LayoutContent read the
 * same keys: splitting moves everyone outside the team into a second window.
 */
export const OBJECT_LIST_SETTINGS_FIELDS: WindowSettingField[] = [
  { type: 'toggle', key: SEPARATE_OTHERS_SETTING, label: 'Pozostali w osobnym oknie', default: false },
];
