import type { WindowSettingField } from './windowSettings';

/**
 * The map's options in its settings cog. MapHeaderMenu reads the same keys
 * (useBuiltInPanelSetting) and pushes each change to the map renderer.
 */
export const MAP_SETTINGS_FIELDS: WindowSettingField[] = [
  // Checked = the area label moves into the header, i.e. the map overlay hides it.
  { type: 'toggle', key: 'labelVisible', label: 'Etykieta w naglowku', default: true, inverted: true },
  { type: 'toggle', key: 'alwaysShowNote', label: 'Notatka zawsze widoczna', default: false },
  { type: 'toggle', key: 'showGrid', label: 'Siatka', default: false },
  { type: 'toggle', key: 'showAreaExitLabels', label: 'Etykiety wyjsc obszaru', default: true },
  { type: 'toggle', key: 'showTransportStops', label: 'Przystanki transportu', default: false },
  { type: 'toggle', key: 'showCarriageBlocks', label: 'Nieprzejezdne dla wozu', default: false },
];
