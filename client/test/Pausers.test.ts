import Pausers from '../src/Pausers';
import { EventEmitter } from 'events';

class FakeMap {
  paused = false;
  setPaused(p: boolean) {
    this.paused = p;
  }
}

class FakeClient {
  private emitter = new EventEmitter();
  Map = new FakeMap();
  on(event: string, cb: any) {
    this.emitter.on(event, cb);
    return () => this.emitter.off(event, cb);
  }
  sendEvent(type: string, ...args: any[]) {
    this.emitter.emit(type, ...args);
  }
}

describe('Pausers', () => {
  let client: FakeClient;

  beforeEach(() => {
    client = new FakeClient();
    new Pausers((client as unknown) as any);
    client.sendEvent('gmcp.char.info', { object_num: '1' });
  });

  test('pauses and resumes based on paralyzed state', () => {
    client.sendEvent('gmcp.objects.data', { '1': { paralyzed: true } });
    expect(client.Map.paused).toBe(true);
    client.sendEvent('gmcp.objects.data', { '1': { paralyzed: false } });
    expect(client.Map.paused).toBe(false);
  });

  test('editing state keeps map paused independently', () => {
    client.sendEvent('gmcp.objects.data', { '1': { paralyzed: true } });
    client.sendEvent('gmcp.objects.data', { '1': { editing: true } });
    client.sendEvent('gmcp.objects.data', { '1': { paralyzed: false } });
    expect(client.Map.paused).toBe(true);
    client.sendEvent('gmcp.objects.data', { '1': { editing: false } });
    expect(client.Map.paused).toBe(false);
  });

  test('emits events when pause starts and ends', () => {
    let started = false;
    let ended = false;
    client.on('pauserStart', () => { started = true; });
    client.on('pauserEnd', () => { ended = true; });
    client.sendEvent('gmcp.objects.data', { '1': { paralyzed: true } });
    expect(started).toBe(true);
    client.sendEvent('gmcp.objects.data', { '1': { paralyzed: false } });
    expect(ended).toBe(true);
  });
});
