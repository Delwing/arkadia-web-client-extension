import type { Edge } from "mudlet-map-renderer";

/**
 * Steps from `from` to each of `targets` along the cheapest path, in one
 * Dijkstra pass over the map graph (the one the pathfinder uses). Asking the
 * pathfinder once per room runs a whole-map search per room, which with a few
 * thousand rooms froze the page for seconds. Stops as soon as every target is
 * settled. A target that cannot be reached (or is not on the map) is null.
 */
export function roomDistances(
    adj: ReadonlyMap<number, readonly Edge[]>,
    from: number,
    targets: Iterable<number>,
): Map<number, number | null> {
    const result = new Map<number, number | null>();
    const pending = new Set<number>();
    for (const id of targets) {
        result.set(id, null);
        if (id === from) result.set(id, 0);
        else pending.add(id);
    }
    if (pending.size === 0 || !adj.has(from)) return result;

    const cost = new Map<number, number>([[from, 0]]);
    const steps = new Map<number, number>([[from, 0]]);
    const done = new Set<number>();
    const heap = new MinHeap();
    heap.push(from, 0);

    while (heap.size > 0 && pending.size > 0) {
        const { id, priority } = heap.pop();
        if (done.has(id) || priority > (cost.get(id) ?? Infinity)) continue;
        done.add(id);
        const hops = steps.get(id)!;
        if (pending.delete(id)) result.set(id, hops);
        for (const edge of adj.get(id) ?? []) {
            if (done.has(edge.id)) continue;
            const next = priority + edge.weight;
            if (next < (cost.get(edge.id) ?? Infinity)) {
                cost.set(edge.id, next);
                steps.set(edge.id, hops + 1);
                heap.push(edge.id, next);
            }
        }
    }
    return result;
}

/** Binary min-heap of room ids by cost (stale entries are skipped on pop). */
class MinHeap {
    private ids: number[] = [];
    private priorities: number[] = [];

    get size(): number {
        return this.ids.length;
    }

    push(id: number, priority: number): void {
        let i = this.ids.length;
        this.ids.push(id);
        this.priorities.push(priority);
        while (i > 0) {
            const parent = (i - 1) >> 1;
            if (this.priorities[parent] <= priority) break;
            this.swap(i, parent);
            i = parent;
        }
    }

    pop(): { id: number; priority: number } {
        const top = { id: this.ids[0], priority: this.priorities[0] };
        const lastId = this.ids.pop()!;
        const lastPriority = this.priorities.pop()!;
        if (this.ids.length > 0) {
            this.ids[0] = lastId;
            this.priorities[0] = lastPriority;
            let i = 0;
            for (;;) {
                const left = 2 * i + 1;
                const right = left + 1;
                let smallest = i;
                if (left < this.ids.length && this.priorities[left] < this.priorities[smallest]) smallest = left;
                if (right < this.ids.length && this.priorities[right] < this.priorities[smallest]) smallest = right;
                if (smallest === i) break;
                this.swap(i, smallest);
                i = smallest;
            }
        }
        return top;
    }

    private swap(a: number, b: number): void {
        [this.ids[a], this.ids[b]] = [this.ids[b], this.ids[a]];
        [this.priorities[a], this.priorities[b]] = [this.priorities[b], this.priorities[a]];
    }
}
