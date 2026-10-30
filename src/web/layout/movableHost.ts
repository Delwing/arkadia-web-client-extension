import { useLayoutEffect, useSyncExternalStore, type RefObject } from 'react';

/** The element's own spot when no panel shows it. */
export const DEFAULT_SLOT = 0;
/** A layout panel showing the element. */
export const PANEL_SLOT = 1;

interface Slot {
  parent: HTMLElement;
  /** Inserted before this node of the parent when given and still there; appended otherwise. */
  before: Node | null;
  priority: number;
  seq: number;
}

/**
 * An element that keeps living while the place it shows in changes: the map's
 * drawing surface, the object lists. Their contents belong to an engine
 * (`EmbeddedMap`, `ObjectList`), not to React, so a remount would lose them.
 *
 * Places ("slots") attach to the host and detach again; the host sits in the
 * attached slot with the highest priority, the latest one on a tie. The default
 * spot attaches at priority 0, a layout panel showing the element at 1, so a
 * panel closing hands the element back to where it was without either side
 * keeping track of the other.
 *
 * React never renders the host element itself, only the slots it sits in, so
 * moving it between them is safe: to React it is a foreign child of whichever
 * slot holds it.
 */
export class MovableHost {
  private slots: Slot[] = [];
  private seq = 0;
  private current: Slot | null = null;
  private readonly listeners = new Set<() => void>();

  constructor(readonly element: HTMLElement) {}

  /** A host around a new element with this id (and attributes). */
  static create(id: string, attributes: Record<string, string> = {}): MovableHost {
    const element = document.createElement('div');
    element.id = id;
    for (const [name, value] of Object.entries(attributes)) element.setAttribute(name, value);
    return new MovableHost(element);
  }

  /** Offer a place; returns the detach. */
  attach(parent: HTMLElement, priority = 0, before: Node | null = null): () => void {
    const slot: Slot = { parent, before, priority, seq: this.seq++ };
    this.slots.push(slot);
    this.place();
    return () => {
      this.slots = this.slots.filter((s) => s !== slot);
      this.place();
    };
  }

  /** The priority of the slot holding the element, or null while it is nowhere. */
  ownerPriority(): number | null {
    return this.current?.priority ?? null;
  }

  /** Resolves once some place holds the element (at once if one does). */
  whenPlaced(): Promise<void> {
    if (this.current) return Promise.resolve();
    return new Promise((resolve) => {
      const off = this.subscribe(() => {
        if (!this.current) return;
        off();
        resolve();
      });
    });
  }

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  };

  private place(): void {
    let best: Slot | null = null;
    for (const slot of this.slots) {
      if (!best || slot.priority > best.priority || (slot.priority === best.priority && slot.seq > best.seq)) {
        best = slot;
      }
    }
    if (best) {
      const before = best.before && best.before.parentNode === best.parent ? best.before : null;
      if (this.element.parentNode !== best.parent || (before && this.element.nextSibling !== before)) {
        best.parent.insertBefore(this.element, before);
      }
    } else {
      this.element.remove();
    }
    if (best !== this.current) {
      this.current = best;
      for (const listener of [...this.listeners]) listener();
    }
  }
}

/** Hold `host` in the element behind `ref` while mounted (and `enabled`). */
export function useHostSlot(host: MovableHost | null, ref: RefObject<HTMLElement | null>, priority: number, enabled = true): void {
  useLayoutEffect(() => {
    const parent = ref.current;
    if (!host || !parent || !enabled) return;
    return host.attach(parent, priority);
  }, [host, ref, priority, enabled]);
}

/** Whether the slot at `priority` is the one holding `host` now. */
export function useHostHeldAt(host: MovableHost, priority: number): boolean {
  return useSyncExternalStore(host.subscribe, () => host.ownerPriority() === priority);
}
