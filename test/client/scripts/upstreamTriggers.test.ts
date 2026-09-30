import Triggers from '@client/Triggers';
import { AnsiAwareBuffer } from '@client/ansi/FormatState';
import {
  patternToTrigger,
  registerUpstreamTrigger,
  upstreamPatterns,
  type UpstreamTrigger,
} from '@client/scripts/upstreamTriggers';

const generated = import.meta.glob<UpstreamTrigger[]>(
  '../../../src/client/scripts/{*_patterns,follow_special_exits_patterns}.json',
  { eager: true, import: 'default' },
);

describe('upstream trigger helpers', () => {
  test('converts each Mudlet pattern type', () => {
    expect(patternToTrigger({ pattern: 'atakuje cie!', type: 0 })).toBe('atakuje cie!');
    expect(patternToTrigger({ pattern: '^(?<attacker>\\w+) x$', type: 1 })).toEqual(/^(?<attacker>\w+) x$/);
    expect(patternToTrigger({ pattern: 'Nagle jakas strzala.', type: 2 })).toEqual(/^Nagle jakas strzala\./);
    expect(patternToTrigger({ pattern: 'Nie masz (nic).', type: 3 })).toEqual(/^Nie masz \(nic\)\.$/);
  });

  test('turns a leading PCRE (?i) into the i flag', () => {
    expect(patternToTrigger({ pattern: '(?i)rzemienna petla', type: 1 })).toEqual(/rzemienna petla/i);
  });

  test('picks triggers by the exact function their script calls', () => {
    const triggers: UpstreamTrigger[] = [
      { name: 'a', script: 'trigger_func_rusalka()', patterns: [{ pattern: 'a', type: 0 }] },
      { name: 'b', script: 'trigger_func_rusalka2()', patterns: [{ pattern: 'b', type: 0 }] },
    ];
    expect(upstreamPatterns(triggers, 'trigger_func_rusalka')).toEqual(['a']);
    expect(() => upstreamPatterns(triggers, 'trigger_func_missing')).toThrow(/extract-upstream-triggers/);
  });

  test('registers a trigger with a parent as its child', () => {
    const triggers = new Triggers(({} as unknown) as any);
    const callback = jest.fn((line: AnsiAwareBuffer) => line);
    registerUpstreamTrigger(triggers, {
      name: 'gates',
      script: 'trigger_func_mapper_gates_gates()',
      patterns: [{ pattern: '^Probujesz otworzyc .*brame.*', type: 1 }],
      parents: [{ name: 'gates', patterns: [{ pattern: '^[ >]*Probujesz', type: 1 }] }],
    }, callback);
    triggers.parseLine(new AnsiAwareBuffer('Probujesz otworzyc wielka brame.'), '');
    expect(callback).toHaveBeenCalledTimes(1);
  });

  test('every generated pattern compiles', () => {
    const files = Object.entries(generated);
    expect(files.length).toBeGreaterThanOrEqual(8);
    for (const [file, triggers] of files) {
      for (const trigger of triggers) {
        expect(trigger.patterns.length, `${file} ${trigger.name}`).toBeGreaterThan(0);
        for (const entry of trigger.patterns) {
          expect(() => patternToTrigger(entry), `${file} ${entry.pattern}`).not.toThrow();
        }
      }
    }
  });
});
