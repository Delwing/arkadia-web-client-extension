import { gmcp, setGmcp } from '../src/gmcp';

describe('setGmcp', () => {
  beforeEach(() => {
    (globalThis as any).gmcp = {};
  });

  test('sets nested value', () => {
    setGmcp('room.info', { id: 1 });
    expect(gmcp.room.info).toEqual({ id: 1 });
  });

  test('new event overwrites previous value', () => {
    setGmcp('room.time', { daylight: true });
    setGmcp('room.time', { daylight: false });
    expect(gmcp.room.time).toEqual({ daylight: false });
  });

  test('different keys coexist', () => {
    setGmcp('room.info', { id: 1 });
    setGmcp('room.time', { daylight: true });
    expect(gmcp.room.info).toEqual({ id: 1 });
    expect(gmcp.room.time).toEqual({ daylight: true });
  });
});
