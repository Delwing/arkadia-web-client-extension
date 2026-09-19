import { performance } from 'perf_hooks';
import Triggers from '@client/Triggers';
import { AnsiAwareBuffer } from '@client/ansi/FormatState';

const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Token triggers index by word, regex triggers scan every pattern per line, so the
 * gap is meant to be structural rather than marginal.
 *
 * Measuring that on a shared CI runner needs care, and the first version of this
 * test had none: it timed one pass of each and asserted `token < regex` with no
 * margin. Worse, it timed the token pass FIRST, so that pass absorbed the JIT
 * warm-up while the regex pass ran on an already-hot VM - the measurement was
 * biased against the very thing it asserted. It failed on CI at 488ms vs 324ms
 * while the implementation was fine.
 *
 * So: warm both paths before timing, take the MINIMUM of several rounds (the
 * robust statistic for timings - noise only ever adds), and alternate the order
 * within each round so no pass is permanently first.
 */
describe('Trigger performance', () => {
  test('token triggers are faster than regex triggers', () => {
    const entries = Array.from({ length: 200 }, (_, index) => ({ description: `osoba ${index}` }));
    const lines: string[] = [];

    const tokenT = new Triggers({} as any);
    const regexT = new Triggers({} as any);

    entries.forEach(p => {
      tokenT.registerTokenTrigger(p.description, () => undefined);
      regexT.registerTrigger(new RegExp(`\\b${escapeRegExp(p.description)}\\b`));
      lines.push(`prefix ${p.description} suffix`);
    });

    const repetitions = 50;
    const dataset: string[] = [];
    for (let i = 0; i < repetitions; i++) {
      dataset.push(...lines);
    }

    const runOnce = (t: Triggers) => dataset.forEach(l => t.parseLine(new AnsiAwareBuffer(l), ''));
    const timeOnce = (t: Triggers) => {
      const start = performance.now();
      runOnce(t);
      return performance.now() - start;
    };

    // Warm-up: both paths get a hot VM before anything is measured.
    runOnce(tokenT);
    runOnce(regexT);

    let tokenTime = Infinity;
    let regexTime = Infinity;
    for (let round = 0; round < 5; round++) {
      // Alternate which one is measured first, so ordering effects cancel.
      if (round % 2 === 0) {
        tokenTime = Math.min(tokenTime, timeOnce(tokenT));
        regexTime = Math.min(regexTime, timeOnce(regexT));
      } else {
        regexTime = Math.min(regexTime, timeOnce(regexT));
        tokenTime = Math.min(tokenTime, timeOnce(tokenT));
      }
    }

    expect(tokenTime).toBeLessThan(regexTime);
  });
});
