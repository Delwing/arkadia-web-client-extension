import initUserTriggers, { UserTrigger } from '../src/scripts/userTriggers';
import Triggers from '../src/Triggers';
import { findClosestColor } from '../src/Colors';
import {setItemSync} from "../src/storage";

class FakeClient {
  Triggers = new Triggers(({} as unknown) as any);
  playSound = jest.fn();
  sendCommand = jest.fn();
}


function storeTriggers(triggers: UserTrigger[]) {
  setItemSync('triggers', triggers);
}

describe('userTriggers', () => {
  test('macros modify match only', () => {
    const client = new FakeClient();
    const list: UserTrigger[] = [{ pattern: 'foo', macros: [{ type: 'uppercase' }] }];
    storeTriggers(list);
    initUserTriggers((client as unknown) as any);
    const result = client.Triggers.parseLine('bar foo baz', '');
    expect(result).toBe('bar FOO baz');
  });

  test('uppercase does not break colors', () => {
    const client = new FakeClient();
    const list: UserTrigger[] = [{ pattern: 'foo', macros: [{ type: 'color', color: '#ff0000' }, { type: 'uppercase' }] }];
    storeTriggers(list);
    initUserTriggers((client as unknown) as any);
    const code = findClosestColor('#ff0000');
    const result = client.Triggers.parseLine('bar foo baz', '');
    expect(result).toBe(`bar \x1B[22;38;5;${code}mFOO\x1B[0m baz`);
  });

  test('replace uses pattern match', () => {
    const client = new FakeClient();
    const list: UserTrigger[] = [{ pattern: 'foo', macros: [{ type: 'replace', to: 'bar' }] }];
    storeTriggers(list);
    initUserTriggers((client as unknown) as any);
    const result = client.Triggers.parseLine('foo foo', '');
    expect(result).toBe('bar bar');
  });

  test('beep plays sound', () => {
    const client = new FakeClient();
    const list: UserTrigger[] = [{ pattern: 'foo', macros: [{ type: 'beep' }] }];
    storeTriggers(list);
    initUserTriggers((client as unknown) as any);
    const result = client.Triggers.parseLine('foo', '');
    expect(result).toBe('foo');
    expect(client.playSound).toHaveBeenCalledWith('beep');
  });

  test('command sends command', () => {
    const client = new FakeClient();
    const list: UserTrigger[] = [{ pattern: 'foo', macros: [{ type: 'command', command: 'bar' }] }];
    storeTriggers(list);
    initUserTriggers((client as unknown) as any);
    const result = client.Triggers.parseLine('foo', '');
    expect(result).toBe('foo');
    expect(client.sendCommand).toHaveBeenCalledWith('bar');
  });
});

