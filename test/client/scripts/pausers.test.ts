import initPausers from '@client/scripts/pausers';
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
    initPausers((client as unknown) as any);
    client.sendEvent('player.objectNum', 1);
  });

  // przeobrazenie swaps the body mid-read: the 'editing: false' that would have
  // ended the pause arrives under an id this script was not watching, so the pause
  // has to lift when the id moves or the mapper stays stuck until relog.
  test('lifts the pause when the player object changes', () => {
    const ended: boolean[] = [];
    client.on('pauserEnd', () => { ended.push(true); });

    client.sendEvent('gmcp.objects.data', { '1': { editing: true } });
    expect(client.Map.paused).toBe(true);

    client.sendEvent('player.objectNum', undefined);
    expect(client.Map.paused).toBe(false);
    expect(ended).toHaveLength(1);

    // ...and the new body starts from a clean slate.
    client.sendEvent('player.objectNum', 2);
    client.sendEvent('gmcp.objects.data', { '2': { editing: false } });
    expect(client.Map.paused).toBe(false);
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
