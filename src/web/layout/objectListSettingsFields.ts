import type { WindowSettingField } from './windowSettings';
import { LEADER_MARK_SETTING, SEPARATE_OTHERS_SETTING } from './types';

/**
 * Kondycje's options in its settings cog. ObjectList and LayoutContent read the
 * same keys: splitting moves everyone outside the team into a second window.
 */
export const OBJECT_LIST_SETTINGS_FIELDS: WindowSettingField[] = [
  { type: 'toggle', key: SEPARATE_OTHERS_SETTING, label: 'Pozostali w osobnym oknie', default: false },
  { type: 'toggle', key: LEADER_MARK_SETTING, label: 'Korona przy numerze lidera drużyny', default: true },
];
