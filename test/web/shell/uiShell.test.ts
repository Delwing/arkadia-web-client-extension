import { beforeEach, describe, expect, it } from 'vitest';
import { getShellFromUrl, getStoredShell, resolveBootShell, setStoredShell } from '@web/shell/uiShell';

describe('ui shell choice', () => {
  beforeEach(() => localStorage.clear());

  it('defaults to the stock shell', () => {
    expect(getStoredShell()).toBe('stock');
    expect(resolveBootShell('')).toBe('stock');
  });

  it('boots the stored shell', () => {
    setStoredShell('forge');
    expect(resolveBootShell('')).toBe('forge');
    setStoredShell('stock');
    expect(localStorage.getItem('uiShell')).toBeNull();
  });

  it('lets ?ui= win for one load without storing it', () => {
    setStoredShell('forge');
    expect(resolveBootShell('?ui=stock')).toBe('stock');
    expect(getStoredShell()).toBe('forge');
  });

  it('ignores unknown values', () => {
    localStorage.setItem('uiShell', 'neon');
    expect(getStoredShell()).toBe('stock');
    expect(getShellFromUrl('?ui=neon')).toBeNull();
  });
});
