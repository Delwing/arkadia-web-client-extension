import type { Trigger } from '@client/src/Triggers';
import { matchTrigger } from '../src/triggerUtils';

describe('triggerUtils prompt handling', () => {
  test('matches string trigger when line starts with prompt marker', () => {
    const trigger = { pattern: 'test' } as unknown as Trigger;
    expect(matchTrigger(trigger, '> test', 'regular')).toBe(true);
  });

  test('matches string trigger for narrative line prefixed with prompt', () => {
    const trigger = {
      pattern: 'otwierasz na chwile skorzana krasnoludzka torbe',
    } as unknown as Trigger;
    const line =
      '>Otwierasz na chwile skorzana krasnoludzka torbe, sprawdzajac zawartosc. W srodku dostrzegasz wiele zlotych monet, osiemnascie srebrnych monet, dziesiec miedzianych monet, garnczkowy helm z jelenim porozem, drewniana okuta tarcze, pasiasty fluoryt, zolty celestyn, dwa zlociste piryty, oliwkowozielony serpentyn, bezbarwny gorski krysztal i upiorny mglisty calun.';
    expect(matchTrigger(trigger, line, 'regular')).toBe(true);
  });

  test('matches regex trigger when prompt marker contains ANSI codes', () => {
    const trigger = { pattern: /^otwierasz na chwile/ } as unknown as Trigger;
    const line =
      '\u001b[1;33m>\u001b[0m otwierasz na chwile skorzana krasnoludzka torbe, sprawdzajac zawartosc.';
    expect(matchTrigger(trigger, line, 'regular')).toBe(true);
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
