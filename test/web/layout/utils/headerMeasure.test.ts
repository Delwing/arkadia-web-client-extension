import { describe, expect, it } from 'vitest';
import { runMeasures, type HeaderMeasure } from '@web/layout/utils/headerMeasure.ts';

describe('runMeasures', () => {
  it('steps every measure through each phase before the next', () => {
    const log: string[] = [];
    function* measure(name: string, phases: number): HeaderMeasure {
      for (let i = 1; i <= phases; i++) {
        log.push(`${name}${i}`);
        if (i < phases) yield;
      }
    }

    runMeasures([measure('a', 3), measure('b', 1), measure('c', 2)]);

    expect(log).toEqual(['a1', 'b1', 'c1', 'a2', 'c2', 'a3']);
  });
});
