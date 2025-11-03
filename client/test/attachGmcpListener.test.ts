import { gmcp, attachGmcpListener } from '../src/gmcp';
import { EventEmitter } from 'events';

class FakeClient {
  private emitter = new EventEmitter();
  on(event: string, cb: any) {
    this.emitter.on(event, cb);
  }
  sendEvent(type: string, detail?: any) {
    this.emitter.emit(type, detail);
  }
}

describe('attachGmcpListener', () => {
  beforeEach(() => {
    (globalThis as any).gmcp = {};
  });

  test('updates gmcp on gmcp event', () => {
    const client = new FakeClient();
    attachGmcpListener(client as any);
    client.sendEvent('gmcp', { path: 'room.info', value: { id: 5 } });
    expect(gmcp.room.info).toEqual({ id: 5 });
  });
});
