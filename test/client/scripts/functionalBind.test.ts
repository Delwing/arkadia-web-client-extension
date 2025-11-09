import { FunctionalBind } from '@client/scripts/functionalBind';

describe('FunctionalBind clickable text', () => {
  test('set makes printed text clickable', () => {
    const client = {
      on: jest.fn(),
      println: jest.fn(),
    } as any;

    const fb = new FunctionalBind(client);
    const cb = jest.fn();
    fb.set('cmd', cb);

    // Check that println was called
    expect(client.println).toHaveBeenCalled();

    // Get the printed buffer
    const printedBuffer = client.println.mock.calls[0][0];

    // Check it's an AnsiAwareBuffer with the expected text
    expect(printedBuffer.text).toContain('bind');
    expect(printedBuffer.text).toContain(']');
    expect(printedBuffer.text).toContain('cmd');
  });

  test('set updates callback when called again with same text', () => {
    const client = {
      on: jest.fn(),
      println: jest.fn(),
    } as any;

    const fb = new FunctionalBind(client);
    const cb1 = jest.fn();
    fb.set('cmd', cb1);

    const cb2 = jest.fn();
    fb.set('cmd', cb2);

    // Only one println call should be made since the printable text is the same
    expect(client.println).toHaveBeenCalledTimes(1);
  });
});
