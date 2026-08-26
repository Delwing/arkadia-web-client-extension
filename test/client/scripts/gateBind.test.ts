import { DEFAULT_GATE_COMMAND, getGateBindString, isGateRoom } from '@client/scripts/gateBind';

describe('gate bind helpers', () => {
  test('isGateRoom only accepts a non-empty gate entry', () => {
    expect(isGateRoom(null)).toBe(false);
    expect(isGateRoom({})).toBe(false);
    expect(isGateRoom({ userData: {} })).toBe(false);
    expect(isGateRoom({ userData: { gate: '  ' } })).toBe(false);
    expect(isGateRoom({ userData: { gate: 'zapukaj w brame' } })).toBe(true);
  });

  test('getGateBindString falls back to the default knock', () => {
    expect(getGateBindString(null)).toBe(DEFAULT_GATE_COMMAND);
    expect(getGateBindString({ userData: {} })).toBe(DEFAULT_GATE_COMMAND);
    expect(getGateBindString({ userData: { gate: '   ' } })).toBe(DEFAULT_GATE_COMMAND);
  });

  test('getGateBindString returns the trimmed location command', () => {
    expect(getGateBindString({ userData: { gate: ' zapukaj w brame ' } })).toBe('zapukaj w brame');
  });

  test('brama is accepted as an alias of gate', () => {
    expect(isGateRoom({ userData: { brama: 'zapukaj w brame' } })).toBe(true);
    expect(getGateBindString({ userData: { brama: 'zapukaj w brame' } })).toBe('zapukaj w brame');
  });
});
