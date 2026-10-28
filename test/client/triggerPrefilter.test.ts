import Triggers from '@client/Triggers';
import { AnsiAwareBuffer } from '@client/ansi/FormatState';
import { mayMatch, prefilterMisses, prefilterVerifyStats, requiredLiteral, requiredLiterals } from '@client/triggerPrefilter';
import fs from 'fs';
import path from 'path';
import gagsData from '@client/scripts/gags_lua.json';

describe('requiredLiteral', () => {
  test.each([
    ['(?<name>.*) atakuje cie!', '', ' atakuje cie!'],
    ['^Wiedziony naglym instynktem siegasz po', '', 'Wiedziony naglym instynktem siegasz po'],
    ['^(.*) uciekl.* ci\\.$', '', ' uciekl'],
    ['^Trzymasz .* w (prawej|lewej) rece.*', '', 'Trzymasz '],
    ['Twoj depozyt\\: (\\d+)', '', 'Twoj depozyt: '],
    ['abc?def', '', 'def'],
    ['abcd+ef', '', 'abcd'],
    ['xy{2,}zzz', '', 'zzz'],
    ['wxyz{0,3}q', '', 'wxy'],
    ['(\\w+\\s+)?srebrn(a|e|ych)(?=.*\\bmonet)', 'i', 'srebrn'],
    ['[a-z]+ foo [bar]+', '', ' foo '],
  ])('%s -> %s', (source, flags, expected) => {
    expect(requiredLiteral(source, flags)).toBe(expected);
  });

  test.each([
    ['.*', ''],
    ['foo|bar', ''],
    ['^(?:Wychodzisz z ukrycia|Jest tu zbyt ciezko)', ''],
    ['ab', ''],
    ['literal text', 'y'],
    ['literal text', 'iu'],
    ['\\u0041bcdef', ''],
  ])('%s /%s has no prefilter', (source, flags) => {
    expect(requiredLiteral(source, flags)).toBeNull();
  });

  test('finds a literal in most of the Mudlet gag regexes', () => {
    const sources: string[] = [];
    const walk = (node: any) => {
      for (const p of node.patterns ?? []) if (p.type === 1) sources.push(p.pattern);
      (node.triggers ?? []).forEach(walk);
    };
    (gagsData as any[]).forEach(walk);
    const covered = sources.filter(s => requiredLiteral(s) !== null);
    expect(sources.length).toBeGreaterThan(500);
    expect(covered.length / sources.length).toBeGreaterThan(0.9);
  });

  // The one property that matters: whenever a regex matches, its literal is in the line.
  // Lines are built from the regex's own pieces so most of them match, then sometimes mutated.
  test('never rules out a line the regex matches (random regexes and lines)', () => {
    let seed = 7;
    const rnd = (n: number) => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed % n; };
    const pick = (s: string) => s[rnd(s.length)];
    const atoms: [string, () => string][] = [
      ['abc', () => 'abc'], ['xa', () => 'xa'], [' b', () => ' b'], ['a', () => 'a'], ['b', () => 'b'], ['c', () => 'c'], ['ab', () => 'ab'], ['x', () => 'x'], [' ', () => ' '],
      ['.', () => pick('abcx .(1')], ['\\.', () => '.'], ['\\s', () => ' '], ['\\d', () => pick('0123')],
      ['[ab]', () => pick('ab')], ['[^c]', () => pick('abx ')], ['(a|b)', () => pick('ab')], ['(?:ab)', () => 'ab'],
      ['(?=a)', () => ''], ['(?!b)', () => ''], ['\\(', () => '('],
    ];
    const quants: [string, number, number][] = [
      ['', 1, 1], ['', 1, 1], ['', 1, 1], ['', 1, 1], ['', 1, 1], ['?', 0, 1], ['*', 0, 3], ['+', 1, 3], ['{0,2}', 0, 2],
      ['{1,}', 1, 3], ['{2}', 2, 2], ['??', 0, 1], ['+?', 1, 3],
    ];
    const junk = () => Array.from({ length: rnd(4) }, () => pick('abcx .(1')).join('');
    let checked = 0;
    for (let n = 0; n < 8000; n++) {
      const anchoredStart = rnd(4) === 0;
      const anchoredEnd = rnd(4) === 0;
      const parts = Array.from({ length: 2 + rnd(8) }, () => [atoms[rnd(atoms.length)], quants[rnd(quants.length)]] as const);
      const source = (anchoredStart ? '^' : '') + parts.map(([[a], [q]]) => a + q).join('') + (anchoredEnd ? '$' : '');
      const flags = rnd(3) === 0 ? 'i' : '';
      const re = new RegExp(source, flags);
      if (requiredLiteral(source, flags) === null) continue;
      for (let m = 0; m < 15; m++) {
        let line = (anchoredStart ? '' : junk())
          + parts.map(([[, sample], [, min, max]]) => Array.from({ length: min + rnd(max - min + 1) }, sample).join('')).join('')
          + (anchoredEnd ? '' : junk());
        if (flags && rnd(2) === 0) line = line.toUpperCase();
        if (rnd(4) === 0 && line.length > 0) {
          const at = rnd(line.length);
          line = line.slice(0, at) + pick('abcx .(1') + line.slice(at + 1);
        }
        if (re.test(line)) {
          checked++;
          expect({ source, flags, line, pass: mayMatch(re, line) }).toEqual({ source, flags, line, pass: true });
        }
      }
    }
    expect(checked).toBeGreaterThan(5000);
  });
});

describe('requiredLiterals', () => {
  test.each([
    // A plain run wins, as before.
    ['(?<name>.*) atakuje cie!', '', [' atakuje cie!']],
    // Alternations, at the top or in a mandatory group.
    ['foo|bar', '', ['foo', 'bar']],
    ['^(?:Wychodzisz z ukrycia|Jest tu zbyt ciezko)\\.$', '', ['Wychodzisz z ukrycia', 'Jest tu zbyt ciezko']],
    ['(Lekko ranisz|Ranisz|Masakrujesz)', '', ['Lekko ranisz', 'Ranisz', 'Masakrujesz']],
    ['(\\w+) (ryb[aey]|ryb)\\b', '', ['ryb']],
    // A pattern wrapped whole in a group.
    ['(^[ >]*[a-zA-Z (),!]+ omija twoj nieskuteczny blok\\.$)', '', [' omija twoj nieskuteczny blok.']],
    ['^(?<who>.+) (?:rzuca|ciska) (sie|toba)', '', ['rzuca', 'ciska']],
  ])('%s -> %j', (source, flags, expected) => {
    expect(requiredLiterals(source, flags)).toEqual(expected);
  });

  test.each([
    ['(?:abcd)?de'],
    ['(?:abcd)*'],
    ['(?:abcd){0,2}'],
    ['(?=abcd)x'],
    ['(?!abcd)x'],
    ['(?<=abcd)x'],
    ['(?:|abcd)'],
    ['foo|.*'],
    ['ab|cd'],
  ])('%s has no prefilter', (source) => {
    expect(requiredLiterals(source)).toBeNull();
  });

  test('every Mudlet gag regex that matches a corpus line passes its prefilter', () => {
    const corpus = fs.readFileSync(path.resolve('e2e/perf/corpus.txt'), 'utf8').split('\n').filter(Boolean);
    const regexes: RegExp[] = [];
    const walk = (node: any) => {
      for (const p of node.patterns ?? []) if (p.type === 1) regexes.push(new RegExp(p.pattern));
      (node.triggers ?? []).forEach(walk);
    };
    (gagsData as any[]).forEach(walk);
    const wrong: string[] = [];
    let matched = 0;
    for (const re of regexes) {
      for (const line of corpus) {
        if (!re.test(line)) continue;
        matched++;
        if (!mayMatch(re, line)) wrong.push(`/${re.source}/ ${line}`);
      }
    }
    expect(wrong.slice(0, 5)).toEqual([]);
    expect(matched).toBeGreaterThan(40);
  });
});

describe('Triggers literal prefilter', () => {
  const lines = [
    'Rudy ork atakuje cie!',
    'Krasnolud mowi do ciebie: witaj.',
    'Znajdujesz SREBRNE monety.',
    'Nic tu nie ma.',
  ];

  const register = (triggers: Triggers, calls: string[]) => {
    triggers.registerTrigger(/(?<name>.*) atakuje cie!/, (b, m) => { calls.push(`atak:${m.groups?.name}`); return b; });
    triggers.registerTrigger(/srebrn(a|e|ych)/i, (b, m) => { calls.push(`srebro:${m[0]}`); return b; });
    triggers.registerTrigger(/mowi do ciebie/g, (b, m) => { calls.push(`mowi:${m.length}`); return b; });
    triggers.registerTrigger(/^Nic|^Znajdujesz/, (b) => { calls.push('alt'); return b; });
    const group = triggers.registerTrigger([]);
    group.registerChild(/ monety\.$/, (b) => { calls.push('monety'); return b; });
  };

  test('matches the same lines with the prefilter on and off', () => {
    const run = (enabled: boolean) => {
      const triggers = new Triggers({} as any);
      triggers.literalPrefilter = enabled;
      const calls: string[] = [];
      register(triggers, calls);
      lines.forEach(line => triggers.parseLine(new AnsiAwareBuffer(line), ''));
      return calls;
    };
    const off = run(false);
    expect(off).toEqual(['atak:Rudy ork', 'mowi:1', 'srebro:SREBRNE', 'alt', 'monety', 'alt']);
    expect(run(true)).toEqual(off);
  });

  test('skipping ruled-out triggers keeps stayOpenLines, arrays and mid-pass changes as they were', () => {
    const run = (enabled: boolean) => {
      const triggers = new Triggers({} as any);
      triggers.literalPrefilter = enabled;
      const calls: string[] = [];
      // Held open for two more lines that lack its literal: its children must still run.
      const open = triggers.registerTrigger(/^Walka zaczyna sie/, (b) => { calls.push('open'); return b; }, undefined, { stayOpenLines: 2 });
      open.registerChild(/ork/, (b) => { calls.push('open>ork'); return b; });
      triggers.registerTrigger([/^Brak tego/, /^Rudy ork/], (b) => { calls.push('array'); return b; });
      // Registers and removes triggers while the pass is running.
      let added = false;
      triggers.registerTrigger(/atakuje cie!/, (b) => {
        calls.push('atak');
        if (!added) {
          added = true;
          triggers.registerOneTimeTrigger(/atakuje/, (bb) => { calls.push('one-time'); return bb; });
        }
        return b;
      });
      const doomed = triggers.registerTrigger(/^Rudy ork/, (b) => { calls.push('doomed'); return b; });
      triggers.registerTrigger(/^Walka/, (b) => { triggers.removeTrigger(doomed); return b; });
      ['Walka zaczyna sie teraz.', 'Rudy ork atakuje cie!', 'Rudy ork atakuje cie!', 'Rudy ork atakuje cie!', 'Cisza.']
        .forEach(line => triggers.parseLine(new AnsiAwareBuffer(line), ''));
      return calls;
    };
    const off = run(false);
    expect(off).toContain('open>ork');
    expect(off).toContain('one-time');
    expect(off).not.toContain('doomed');
    expect(run(true)).toEqual(off);
  });

  test('leaves a skipped global regex with lastIndex 0, as String.match does', () => {
    const triggers = new Triggers({} as any);
    triggers.literalPrefilter = true;
    const re = /mowi do ciebie/g;
    triggers.registerTrigger(re, (b) => b);
    re.lastIndex = 5;
    triggers.parseLine(new AnsiAwareBuffer('Nic tu nie ma.'), '');
    expect(re.lastIndex).toBe(0);
  });
});

describe('Triggers literal prefilter verify mode', () => {
  // Matches every line, so it "matches" lines without its literal: a stand-in for an
  // extractor bug, driven through the real Trigger.execute path.
  class MatchesAnything extends RegExp {
    [Symbol.match](line: string): RegExpMatchArray {
      const matches = [line] as unknown as RegExpMatchArray;
      matches.index = 0;
      matches.input = line;
      return matches;
    }
  }

  let errorSpy: ReturnType<typeof vi.spyOn>;
  beforeEach(() => { errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {}); });
  afterEach(() => errorSpy.mockRestore());

  const verifying = () => {
    const triggers = new Triggers({} as any);
    triggers.literalPrefilterVerify = true;
    return triggers;
  };

  test('runs every regex and stays quiet when the prefilter agrees', () => {
    const triggers = verifying();
    const cb = vi.fn((b: AnsiAwareBuffer) => b);
    triggers.registerTrigger(/(?<name>.*) atakuje cie!/, cb);
    triggers.registerTrigger(/srebrn(a|e|ych)/i, cb);
    const checkedBefore = prefilterVerifyStats.checked;

    triggers.parseLine(new AnsiAwareBuffer('Rudy ork atakuje cie!'), '');
    triggers.parseLine(new AnsiAwareBuffer('Znajdujesz SREBRNE monety.'), '');
    triggers.parseLine(new AnsiAwareBuffer('Nic tu nie ma.'), '');

    expect(cb).toHaveBeenCalledTimes(2);
    expect(prefilterVerifyStats.checked - checkedBefore).toBe(2);
    expect(errorSpy).not.toHaveBeenCalled();
  });

  test('reports a match the prefilter would have skipped, loudly and with the line', () => {
    const triggers = verifying();
    const cb = vi.fn((b: AnsiAwareBuffer) => b);
    triggers.registerTrigger(new MatchesAnything('needle text'), cb, 'broken-tag');
    const missesBefore = prefilterVerifyStats.misses;
    const keptBefore = prefilterMisses.length;

    triggers.parseLine(new AnsiAwareBuffer('a line without it'), '');

    // Verify never skips: the trigger still fired.
    expect(cb).toHaveBeenCalledTimes(1);
    expect(prefilterVerifyStats.misses - missesBefore).toBe(1);
    expect(prefilterMisses.slice(keptBefore)).toEqual([{
      trigger: 'broken-tag (needle text)',
      source: 'needle text',
      flags: '',
      literal: 'needle text',
      line: 'a line without it',
    }]);
    expect(errorSpy).toHaveBeenCalledTimes(1);
    const message = String(errorSpy.mock.calls[0][0]);
    expect(message).toContain('PREFILTER MISS');
    expect(message).toContain('broken-tag');
    expect(message).toContain('a line without it');
  });

  test('reports a regex three times, then says once that the rest are suppressed', () => {
    const triggers = verifying();
    triggers.registerTrigger(new MatchesAnything('needle text'), (b) => b);
    for (let i = 0; i < 6; i++) triggers.parseLine(new AnsiAwareBuffer(`line ${i}`), '');

    expect(errorSpy).toHaveBeenCalledTimes(4);
    expect(String(errorSpy.mock.calls[3][0])).toContain('suppressing further reports');
  });

  test('is silent when off', () => {
    const triggers = new Triggers({} as any);
    triggers.registerTrigger(new MatchesAnything('needle text'), (b) => b);
    triggers.parseLine(new AnsiAwareBuffer('a line without it'), '');
    expect(errorSpy).not.toHaveBeenCalled();
  });
});
