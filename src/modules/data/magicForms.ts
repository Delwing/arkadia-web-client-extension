import { MAGIC_CASES, type MagicCase, type MagicEntry, type MagicsFile } from './dataStores/magicsStore';

/**
 * Cases that name exactly one item, best first: a command acting on a single
 * item wants the biernik ("wybierz krysztalowa gryfia lampe"), and mianownik is
 * the fallback for entries whose biernik is missing from the data. An item that
 * exists only in the plural (okulary, zapiski) has neither.
 */
const SINGULAR_CASES: MagicCase[] = ['biernik', 'mianownik'];

const regexpCache = new Map<string, RegExp | null>();

/**
 * Matches a form as a whole phrase inside an item name, so "lsniacy krysztalowy
 * wisior" does not match a "wisiorek". v3 forms are plain text, but v2 `regexps`
 * are patterns, so they are interpolated rather than escaped - a form that fails
 * to compile is skipped instead of breaking the caller.
 */
function formRegexp(form: string): RegExp | null {
  let cached = regexpCache.get(form);
  if (cached === undefined) {
    try {
      cached = new RegExp('(^|\\s)' + form + '(\\s|$)', 'i');
    } catch {
      cached = null;
    }
    regexpCache.set(form, cached);
  }
  return cached;
}

/** Length of the common prefix of two strings. */
function commonPrefixLength(a: string, b: string): number {
  const max = Math.min(a.length, b.length);
  let i = 0;
  while (i < max && a[i] === b[i]) i++;
  return i;
}

/**
 * How closely two forms of the same item describe the same variant. Compared
 * word by word, so "snieznobiale luskowe pancerze" scores higher against
 * "snieznobialy luskowy pancerz" than against "snieznobialy lsniacy pancerz",
 * which a plain prefix comparison cannot tell apart.
 */
function formSimilarity(a: string, b: string): number {
  const wordsA = a.toLowerCase().split(/\s+/);
  const wordsB = b.toLowerCase().split(/\s+/);
  let score = 0;
  for (let i = 0; i < Math.min(wordsA.length, wordsB.length); i++) {
    score += commonPrefixLength(wordsA[i], wordsB[i]);
  }
  return score;
}

/** Every form of an item, deduplicated: the cases, then the extras, then v2 forms. */
export function getMagicForms(entry: MagicEntry): string[] {
  const forms: string[] = [];
  const seen = new Set<string>();
  const add = (form: string) => {
    const key = form.toLowerCase();
    if (form && !seen.has(key)) {
      seen.add(key);
      forms.push(form);
    }
  };
  for (const magicCase of MAGIC_CASES) {
    entry.odmiana?.[magicCase]?.forEach(add);
  }
  entry.dodatkowe_regexps?.forEach(add);
  entry.regexps?.forEach(add);
  return forms;
}

export interface MagicFormMatch {
  /** Key of the matched item in `magics`. */
  key: string;
  entry: MagicEntry;
  /** The form that matched, as spelled in the data. */
  form: string;
  /** Case the matched form belongs to; absent for extra forms and v2 data. */
  case?: MagicCase;
}

/**
 * Finds the magic item an item name refers to. The longest matching form wins,
 * so a plural ("lsniace plomieniste tarcze") is not mistaken for a shorter form
 * of another item.
 */
export function findMagicByForm(
  data: MagicsFile | undefined,
  itemName: string,
): MagicFormMatch | undefined {
  if (!data?.magics || !itemName) return undefined;
  let best: MagicFormMatch | undefined;
  for (const [key, entry] of Object.entries(data.magics)) {
    if (!entry) continue;
    const candidates: Array<{ form: string; case?: MagicCase }> = [];
    for (const magicCase of MAGIC_CASES) {
      entry.odmiana?.[magicCase]?.forEach(form => candidates.push({ form, case: magicCase }));
    }
    entry.dodatkowe_regexps?.forEach(form => candidates.push({ form }));
    entry.regexps?.forEach(form => candidates.push({ form }));
    for (const candidate of candidates) {
      if (best && candidate.form.length <= best.form.length) continue;
      if (formRegexp(candidate.form)?.test(itemName)) {
        best = { key, entry, form: candidate.form, case: candidate.case };
      }
    }
  }
  return best;
}

/**
 * The form to use when a command should act on a single item, whatever form the
 * game printed. A container lists several items in the plural ("trzy lsniace
 * plomieniste tarcze"), so taking one needs the singular biernik.
 *
 * Returns undefined for an item that is not a known magic; returns the matched
 * form itself for an item that has no singular in the data.
 */
export function getSingleMagicForm(
  data: MagicsFile | undefined,
  itemName: string,
): string | undefined {
  const match = findMagicByForm(data, itemName);
  if (!match) return undefined;
  for (const magicCase of SINGULAR_CASES) {
    const forms = match.entry.odmiana?.[magicCase];
    if (!forms?.length) continue;
    // Several forms mean several variants of the item; keep the one the printed
    // form describes ("zamkniete smocze szkatulki" -> "zamknieta smocza szkatulke").
    return forms.reduce((best, form) =>
      formSimilarity(form, match.form) > formSimilarity(best, match.form) ? form : best,
    );
  }
  return match.form;
}
