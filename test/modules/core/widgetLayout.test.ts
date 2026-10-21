import { beforeEach, describe, expect, test, vi } from 'vitest';
import { globalStorage } from '@modules/core/storage';
import {
    addWidget,
    getWidgetInstances,
    isWidgetEditMode,
    removeWidget,
    setWidgetEditMode,
    setWidgetSetting,
    subscribeWidgets,
    updateWidget,
} from '@modules/core/widgetLayout';

beforeEach(() => {
    globalStorage.set('widgetLayout', []);
    setWidgetEditMode(false);
});

describe('widget layout', () => {
    test('an added widget is stored in its corner', () => {
        const id = addWidget('clock', 'br');
        expect(getWidgetInstances()).toEqual([{ id, type: 'clock', corner: 'br', dx: 12, dy: 12 }]);
        expect(globalStorage.get('widgetLayout')).toEqual(getWidgetInstances());
    });

    test('a second widget in the same corner lands below the first', () => {
        addWidget('clock', 'tr');
        addWidget('vitals', 'tr');
        addWidget('compass', 'bl');
        const [a, b, c] = getWidgetInstances();
        expect(b.dy).toBeGreaterThan(a.dy);
        expect(c.dy).toBe(12);
    });

    test('two copies of one type are allowed and kept apart', () => {
        const a = addWidget('clock');
        const b = addWidget('clock');
        setWidgetSetting(a, 'view', 'other');
        expect(getWidgetInstances().find(w => w.id === a)?.settings).toEqual({ view: 'other' });
        expect(getWidgetInstances().find(w => w.id === b)?.settings).toBeUndefined();
    });

    test('moving and removing', () => {
        const id = addWidget('clock');
        updateWidget(id, { corner: 'bl', dx: 40, dy: 5, scale: 1.25 });
        expect(getWidgetInstances()[0]).toMatchObject({ corner: 'bl', dx: 40, dy: 5, scale: 1.25, type: 'clock' });
        removeWidget(id);
        expect(getWidgetInstances()).toEqual([]);
    });

    test('a layout written elsewhere (sync, another tab) is picked up, and junk is dropped', () => {
        const listener = vi.fn();
        const off = subscribeWidgets(listener);
        globalStorage.set('widgetLayout', [
            { id: 'a', type: 'plugin:x:y', corner: 'tl', dx: 1, dy: 2 },
            { id: 'b', type: 'clock', corner: 'middle', dx: 0, dy: 0 },
            null,
        ] as never);
        off();
        expect(listener).toHaveBeenCalled();
        expect(getWidgetInstances().map(w => w.id)).toEqual(['a']);
    });

    test('edit mode toggles and notifies', () => {
        const listener = vi.fn();
        const off = subscribeWidgets(listener);
        setWidgetEditMode();
        expect(isWidgetEditMode()).toBe(true);
        setWidgetEditMode(true);
        expect(listener).toHaveBeenCalledTimes(1);
        setWidgetEditMode();
        expect(isWidgetEditMode()).toBe(false);
        off();
    });
});
