import { performance } from 'perf_hooks';
import Triggers from '@client/Triggers';

const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

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

    // Repeat lines to get a larger sample
    const repetitions = 50;
    const dataset: string[] = [];
    for (let i = 0; i < repetitions; i++) {
      dataset.push(...lines);
    }

    const startToken = performance.now();
    dataset.forEach(l => tokenT.parseLine(l, ''));
    const tokenTime = performance.now() - startToken;

    const startRegex = performance.now();
    dataset.forEach(l => regexT.parseLine(l, ''));
    const regexTime = performance.now() - startRegex;

    expect(tokenTime).toBeLessThan(regexTime);
  });
});
