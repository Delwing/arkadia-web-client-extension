/**
 * Window headers and tab bars find out whether they fit on one row by putting
 * their layout classes off for a moment and reading natural widths. Done one
 * header at a time, every header costs the browser two full layouts, and
 * dragging a splitter in a busy dock resizes many headers each frame.
 *
 * A measure here is a generator that alternates reads and writes, yielding
 * between them: read the live layout, write the measuring classes, read the
 * natural widths, write everything back. Run together they move in lockstep,
 * so all the reads of one phase share a single layout however many headers
 * there are.
 */
export type HeaderMeasure = Generator<void, void, void>;

/** Steps every measure through its phases together. */
export function runMeasures(measures: Iterable<HeaderMeasure>): void {
  let pending = Array.from(measures);
  while (pending.length > 0) {
    pending = pending.filter(m => !m.next().done);
  }
}

type MeasureFactory = () => HeaderMeasure;

const watchers = new Map<Element, Set<MeasureFactory>>();
let observer: ResizeObserver | null = null;

function onResize(entries: ResizeObserverEntry[]) {
  const due = new Set<MeasureFactory>();
  for (const entry of entries) {
    watchers.get(entry.target)?.forEach(f => due.add(f));
  }
  runMeasures(Array.from(due, f => f()));
}

/** Measures again whenever one of the elements resizes, in one batch with
 *  every other header resized in the same frame, or whatever `contents` holds
 *  changes. Returns the unsubscribe. */
export function observeHeader(
  elements: Element[],
  measure: MeasureFactory,
  contents?: Element | null
): () => void {
  if (typeof ResizeObserver === 'undefined') return () => {};
  observer ??= new ResizeObserver(onResize);
  // A row of actions stacked under the title spans the header whatever it
  // holds, so a popup swapping its actions (switching tabs, say) resizes
  // nothing observed. Measuring only toggles classes, which this ignores.
  const mutations = contents ? new MutationObserver(() => runMeasures([measure()])) : null;
  mutations?.observe(contents!, { childList: true, subtree: true, characterData: true });
  for (const el of elements) {
    let set = watchers.get(el);
    if (!set) {
      set = new Set();
      watchers.set(el, set);
      observer.observe(el);
    }
    set.add(measure);
  }
  return () => {
    mutations?.disconnect();
    for (const el of elements) {
      const set = watchers.get(el);
      if (!set) continue;
      set.delete(measure);
      if (set.size === 0) {
        watchers.delete(el);
        observer?.unobserve(el);
      }
    }
  };
}
