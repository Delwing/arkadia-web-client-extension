import initShortExits, { toShort, ORANGE } from '../src/scripts/shortExits';

class FakeClient {
  eventTarget = new EventTarget();
  println = jest.fn();
  addEventListener(event: string, cb: any) {
    this.eventTarget.addEventListener(event, cb);
    return () => this.eventTarget.removeEventListener(event, cb);
  }
}

describe('short exits', () => {
  test('toShort returns input for unknown direction', () => {
    expect(toShort('unknown')).toBe('unknown');
  });

  test('prints exits with unknown direction', () => {
    const client = new FakeClient();
    initShortExits(client as unknown as any);
    const detail = { exits: ['north', 'mystery'] };
    client.eventTarget.dispatchEvent(new CustomEvent('gmcp_msg.room.exits', { detail }));
    expect(client.println).toHaveBeenCalledTimes(1);
    const printed = (client.println as jest.Mock).mock.calls[0][0];
    const prefix = `\x1B[22;38;5;${ORANGE}m`;
    const suffix = '\x1B[0m';
    expect(printed).toBe(prefix + 'n mystery' + suffix);
  });
});
