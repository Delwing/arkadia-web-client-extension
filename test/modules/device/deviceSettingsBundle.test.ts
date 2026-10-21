import { beforeEach, describe, expect, it } from 'vitest';
import { globalStorage } from '@modules/core/storage';
import { getWidgetInstances } from '@modules/core/widgetLayout';
import { exportDeviceSettings, importDeviceSettings } from '@modules/device/deviceSettingsBundle';

const CLOCK = { id: 'w1', type: 'clock', corner: 'bl' as const, dx: 20, dy: 8 };

beforeEach(() => {
    localStorage.clear();
});

describe('device settings bundle: widgets', () => {
    it('exports the placed widgets', () => {
        globalStorage.set('widgetLayout', [CLOCK]);
        expect(exportDeviceSettings().widgetLayout).toEqual([CLOCK]);
    });

    it('leaves the field out when no widget was ever placed', () => {
        expect(exportDeviceSettings()).not.toHaveProperty('widgetLayout');
    });

    it('imports them, and the widget layer sees the change', () => {
        importDeviceSettings({ deviceId: 'd', version: 1, updatedAt: '', widgetLayout: [CLOCK] });
        expect(getWidgetInstances()).toEqual([CLOCK]);
    });
});
