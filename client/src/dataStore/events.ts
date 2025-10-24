import { SnapshotListener } from './types';

type ListenerSet<TSnapshot> = Set<SnapshotListener<TSnapshot>>;

export class SnapshotEventEmitter<TSnapshot> {
  private readonly listeners: ListenerSet<TSnapshot> = new Set();

  subscribe(listener: SnapshotListener<TSnapshot>): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  emit(snapshot: TSnapshot | undefined): void {
    for (const listener of [...this.listeners]) {
      listener(snapshot);
    }
  }
}
