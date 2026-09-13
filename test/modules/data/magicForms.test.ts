import { findMagicByForm, getMagicForms, getSingleMagicForm } from '@modules/data/magicForms';
import type { MagicsFile } from '@modules/data/dataStores/magicsStore';

const data: MagicsFile = {
  version: 3,
  magics: {
    'lsniaca plomienista tarcza': {
      type: ['tarcza'],
      odmiana: {
        mianownik: ['lsniaca plomienista tarcza'],
        dopelniacz: ['lsniacej plomienistej tarczy'],
        biernik: ['lsniaca plomienista tarcze'],
        mnoga_mianownik: ['lsniace plomieniste tarcze'],
        mnoga_biernik: ['lsniace plomieniste tarcze'],
      },
    },
    'smocza szkatulka': {
      type: ['pojemnik'],
      odmiana: {
        mianownik: ['otwarta smocza szkatulka', 'zamknieta smocza szkatulka'],
        biernik: ['otwarta smocza szkatulke', 'zamknieta smocza szkatulke'],
        mnoga_mianownik: ['otwarte smocze szkatulki', 'zamkniete smocze szkatulki'],
        mnoga_biernik: ['otwarte smocze szkatulki', 'zamkniete smocze szkatulki'],
      },
    },
    'snieznobialy luskowy pancerz': {
      type: ['zbroja'],
      odmiana: {
        mianownik: ['snieznobialy lsniacy pancerz', 'snieznobialy luskowy pancerz'],
        biernik: ['snieznobialy lsniacy pancerz', 'snieznobialy luskowy pancerz'],
        mnoga_mianownik: ['snieznobiale lsniace pancerze', 'snieznobiale luskowe pancerze'],
      },
    },
    'ciemna owalna maska': {
      type: ['maska'],
      odmiana: {
        mianownik: ['ciemna owalna maska'],
        mnoga_mianownik: ['ciemne owalne maski'],
      },
    },
    'pozlacane okulary z niebieskawych szkielek': {
      type: ['okulary'],
      odmiana: {
        mnoga_mianownik: ['pozlacane okulary z niebieskawych szkielek'],
        mnoga_biernik: ['pozlacane okulary z niebieskawych szkielek'],
      },
    },
    'starozytna runiczna zbroja plytowa': {
      type: ['zbroja'],
      odmiana: {
        mianownik: ['starozytna runiczna zbroja plytowa'],
        biernik: ['starozytna runiczna zbroje plytowa'],
      },
      dodatkowe_regexps: ['plytach twojego starozytnego pancerza'],
    },
  },
};

describe('getMagicForms', () => {
  test('collects every form of an entry', () => {
    expect(getMagicForms(data.magics['lsniaca plomienista tarcza'])).toEqual([
      'lsniaca plomienista tarcza',
      'lsniacej plomienistej tarczy',
      'lsniaca plomienista tarcze',
      'lsniace plomieniste tarcze',
    ]);
  });

  test('includes extra forms and deduplicates homographs', () => {
    expect(getMagicForms(data.magics['starozytna runiczna zbroja plytowa'])).toEqual([
      'starozytna runiczna zbroja plytowa',
      'starozytna runiczna zbroje plytowa',
      'plytach twojego starozytnego pancerza',
    ]);
  });

  test('reads a v2 entry that has only a flat form list', () => {
    expect(getMagicForms({ type: ['tarcza'], regexps: ['rogata tarcza', 'rogate tarcze'] })).toEqual([
      'rogata tarcza',
      'rogate tarcze',
    ]);
  });
});

describe('findMagicByForm', () => {
  test('reports the matched form and its case', () => {
    const match = findMagicByForm(data, 'lsniace plomieniste tarcze');
    expect(match?.key).toBe('lsniaca plomienista tarcza');
    expect(match?.form).toBe('lsniace plomieniste tarcze');
    expect(match?.case).toBe('mnoga_mianownik');
  });

  test('matches a form embedded in a longer item name', () => {
    expect(findMagicByForm(data, 'na plytach twojego starozytnego pancerza widnieja runy')?.key)
      .toBe('starozytna runiczna zbroja plytowa');
  });

  test('leaves an extra form without a case', () => {
    const match = findMagicByForm(data, 'plytach twojego starozytnego pancerza');
    expect(match?.case).toBeUndefined();
  });

  test('ignores an unknown item', () => {
    expect(findMagicByForm(data, 'stalowy miecz')).toBeUndefined();
  });

  test('ignores missing data', () => {
    expect(findMagicByForm(undefined, 'lsniaca plomienista tarcza')).toBeUndefined();
  });
});

describe('getSingleMagicForm', () => {
  test('turns a plural into the singular biernik', () => {
    expect(getSingleMagicForm(data, 'lsniace plomieniste tarcze')).toBe('lsniaca plomienista tarcze');
  });

  test('corrects the case of a singular mianownik', () => {
    expect(getSingleMagicForm(data, 'lsniaca plomienista tarcza')).toBe('lsniaca plomienista tarcze');
  });

  test('keeps the variant the printed form describes', () => {
    expect(getSingleMagicForm(data, 'zamkniete smocze szkatulki')).toBe('zamknieta smocza szkatulke');
    expect(getSingleMagicForm(data, 'otwarte smocze szkatulki')).toBe('otwarta smocza szkatulke');
  });

  test('picks the variant word by word, not by shared prefix', () => {
    expect(getSingleMagicForm(data, 'snieznobiale luskowe pancerze')).toBe('snieznobialy luskowy pancerz');
    expect(getSingleMagicForm(data, 'snieznobiale lsniace pancerze')).toBe('snieznobialy lsniacy pancerz');
  });

  test('falls back to the mianownik when the data has no biernik', () => {
    expect(getSingleMagicForm(data, 'ciemne owalne maski')).toBe('ciemna owalna maska');
  });

  test('keeps the plural for an item that has no singular', () => {
    expect(getSingleMagicForm(data, 'pozlacane okulary z niebieskawych szkielek'))
      .toBe('pozlacane okulary z niebieskawych szkielek');
  });

  test('resolves an extra form to the singular biernik', () => {
    expect(getSingleMagicForm(data, 'plytach twojego starozytnego pancerza'))
      .toBe('starozytna runiczna zbroje plytowa');
  });

  test('returns nothing for an item that is not a magic', () => {
    expect(getSingleMagicForm(data, 'stalowy miecz')).toBeUndefined();
  });
});
