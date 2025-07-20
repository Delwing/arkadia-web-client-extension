import initUserTriggers, { UserTrigger } from '../src/scripts/userTriggers';
import Triggers from '../src/Triggers';
import { findClosestColor } from '../src/Colors';

class FakeClient {
  Triggers = new Triggers(({} as unknown) as any);
  addEventListener = jest.fn();
  removeEventListener = jest.fn();
  port = { postMessage: jest.fn() } as any;
}

describe('userTriggers', () => {
  test('macros modify line', () => {
    const client = new FakeClient();
    initUserTriggers((client as unknown) as any);
    const apply = client.addEventListener.mock.calls.find(c => c[0] === 'storage')[1];
    const list: UserTrigger[] = [{ pattern: 'foo', macros: [{ type: 'uppercase' }] }];
    apply({ detail: { key: 'triggers', value: list } } as any);
    const result = client.Triggers.parseLine('foo', '');
    expect(result).toBe('FOO');
  });

  test('uppercase does not break colors', () => {
    const client = new FakeClient();
    initUserTriggers((client as unknown) as any);
    const apply = client.addEventListener.mock.calls.find(c => c[0] === 'storage')[1];
    const list: UserTrigger[] = [{ pattern: 'foo', macros: [{ type: 'color', color: '#ff0000' }, { type: 'uppercase' }] }];
    apply({ detail: { key: 'triggers', value: list } } as any);
    const code = findClosestColor('#ff0000');
    const result = client.Triggers.parseLine('foo', '');
    expect(result).toBe(`\x1B[22;38;5;${code}mFOO\x1B[0m`);
  });
});

