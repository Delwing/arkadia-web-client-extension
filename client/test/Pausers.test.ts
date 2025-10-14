import Pausers from '../src/Pausers';
import appEventBus from '../src/events/app-event-bus';

class FakeMap {
  paused = false;
  setPaused(p: boolean) {
    this.paused = p;
  }
}

class FakeClient {
  Map = new FakeMap();

  addEventListener(event: string, cb: any, _options?: any) {
    return appEventBus.on(event as any, cb);
  }

  sendEvent(type: string, detail?: any) {
    appEventBus.emit(type as any, detail);
  }
}

describe('Pausers', () => {
  let client: FakeClient;

  beforeEach(() => {
    appEventBus.clear();
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
    client.addEventListener('pauserStart', () => { started = true; });
    client.addEventListener('pauserEnd', () => { ended = true; });
    client.sendEvent('gmcp.objects.data', { '1': { paralyzed: true } });
    expect(started).toBe(true);
    client.sendEvent('gmcp.objects.data', { '1': { paralyzed: false } });
    expect(ended).toBe(true);
  });
});
