import { beforeEach, describe, expect, it } from 'vitest';
import {
  getDockArrangement,
  initDockArrangement,
  isDockArrangementSwitchable,
  setDockArrangement,
} from '@web/layout/utils/dockArrangement';
import {
  getLayoutOverrides,
  invalidateLayoutCache,
  isRailSpanSupported,
  loadLayoutState,
  loadPersistedLayoutState,
  saveLayoutState,
  setLayoutOverrides,
  setRailSpanSupported,
} from '@web/layout/utils/layoutStorage';

describe('dock arrangement', () => {
  beforeEach(() => {
    localStorage.clear();
    setLayoutOverrides({});
    setRailSpanSupported(false);
    invalidateLayoutCache();
  });

  it('applies the shell default and opts into rail span', () => {
    initDockArrangement('forge', 'leftRight');
    expect(isRailSpanSupported()).toBe(true);
    expect(isDockArrangementSwitchable()).toBe(true);
    expect(getDockArrangement()).toBe('leftRight');
    expect(loadLayoutState().spanningDocks).toBe('leftRight');
  });

  it('keeps the other overrides a shell declared first', () => {
    setLayoutOverrides({ enabled: true });
    initDockArrangement('forge', 'leftRight');
    expect(getLayoutOverrides()).toEqual({ enabled: true, spanningDocks: 'leftRight' });
  });

  it('stores the choice per shell', () => {
    initDockArrangement('stock', 'topBottom');
    setDockArrangement('leftRight');
    expect(loadLayoutState().spanningDocks).toBe('leftRight');

    // The forge shell still gets its own default.
    initDockArrangement('forge', 'topBottom');
    expect(getDockArrangement()).toBe('topBottom');

    initDockArrangement('stock', 'topBottom');
    expect(getDockArrangement()).toBe('leftRight');
  });

  it('never writes the choice into the shared layout state', () => {
    initDockArrangement('stock', 'topBottom');
    setDockArrangement('leftRight');
    saveLayoutState(loadLayoutState());
    expect(loadPersistedLayoutState().spanningDocks).toBe('topBottom');
  });

  it('ignores a corrupt stored value', () => {
    localStorage.setItem('dockArrangement', '{"stock":"diagonal"}');
    initDockArrangement('stock', 'topBottom');
    expect(getDockArrangement()).toBe('topBottom');
  });
});
