import { FunctionalBind } from '@client/scripts/functionalBind';

describe('FunctionalBind clickable text', () => {
  test('set makes printed text clickable', () => {
    const client = {
      on: jest.fn(),
      println: jest.fn(),
      createButton: jest.fn(() => ({ remove: jest.fn() })),
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

  test('set updates button callback when called again with same text', () => {
    const button: any = { remove: jest.fn(), onclick: () => {} };
    const client = {
      on: jest.fn(),
      println: jest.fn(),
      createButton: jest.fn(() => button),
    } as any;

    const fb = new FunctionalBind(client);
    const cb1 = jest.fn();
    fb.set('cmd', cb1);

    const cb2 = jest.fn();
    fb.set('cmd', cb2);

    // clicking the button should invoke the latest callback
    button.onclick();
    expect(cb2).toHaveBeenCalled();
  });
});
