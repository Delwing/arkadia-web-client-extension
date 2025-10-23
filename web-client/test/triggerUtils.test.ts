import type { Trigger } from '@client/src/Triggers';
import { matchTrigger } from '../src/triggerUtils';

describe('triggerUtils prompt handling', () => {
  test('matches string trigger when line starts with prompt marker', () => {
    const trigger = { pattern: 'test' } as unknown as Trigger;
    expect(matchTrigger(trigger, '> test', 'regular')).toBe(true);
  });

  test('passes line with prompt back to function triggers', () => {
    const received: string[] = [];
    const trigger = {
      pattern: (raw: string, stripped: string) => {
        received.push(raw);
        return stripped === 'test';
      },
    } as unknown as Trigger;

    expect(matchTrigger(trigger, '> test', 'regular')).toBe(true);
    expect(received).toEqual(['> test']);
  });

  test('does not duplicate prompt across multiline input', () => {
    const line = '> first line\nsecond line';
    let captured = '';
    const trigger = {
      pattern: (raw: string) => {
        captured = raw;
        return true;
      },
    } as unknown as Trigger;

    expect(matchTrigger(trigger, line, 'multiline')).toBe(true);
    expect(captured).toBe(line);
  });
});
