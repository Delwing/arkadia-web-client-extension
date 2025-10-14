import { gmcp, setGmcp } from '../src/gmcp';
import appEventBus from '../src/events/app-event-bus';

describe('setGmcp', () => {
  beforeEach(() => {
    Object.keys(gmcp).forEach((key) => {
      delete (gmcp as Record<string, unknown>)[key];
    });
    (window as any).gmcp = gmcp;
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

  test('gmcp event updates gmcp data', () => {
    appEventBus.emit('gmcp', { path: 'room.info', value: { id: 5 } });
    expect(gmcp.room.info).toEqual({ id: 5 });
  });
});
