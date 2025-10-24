import type { PersonEntry } from '../../types/people';
import { LoaderStrategy, type LoaderContext, type LoaderResult } from '../types';

type LoadPeopleRequest = {
  id: number;
  type: 'loadPeople';
};

type WorkerSuccessMessage = { id: number; status: 'success'; people: PersonEntry[] };
type WorkerErrorMessage = { id: number; status: 'error'; error: string };
type WorkerMessage = WorkerSuccessMessage | WorkerErrorMessage;

export interface WorkerLoaderMetadata {
  count: number;
}

export interface WorkerLoaderOptions {
  createWorker: () => Worker;
}

export class WorkerLoader<TMeta extends WorkerLoaderMetadata = WorkerLoaderMetadata>
  implements LoaderStrategy<PersonEntry[], TMeta>
{
  private readonly createWorker: () => Worker;
  private worker: Worker | null = null;
  private messageId = 0;
  private readonly pending = new Map<
    number,
    {
      resolve: (value: PersonEntry[]) => void;
      reject: (reason: unknown) => void;
    }
  >();

  constructor(options: WorkerLoaderOptions) {
    this.createWorker = options.createWorker;
  }

  async load(
    context: LoaderContext<PersonEntry[], TMeta>,
  ): Promise<LoaderResult<PersonEntry[], TMeta>> {
    if (typeof Worker === 'undefined') {
      throw new Error('Web Workers are not supported in this environment');
    }

    context.onProgress?.(0);
    const people = await this.fetchFromWorker();
    context.onProgress?.(100);

    return {
      snapshot: people,
      metadata: { count: people.length } as Partial<TMeta>,
    };
  }

  private ensureWorker(): Worker {
    if (this.worker) {
      return this.worker;
    }

    const worker = this.createWorker();

    worker.onmessage = (event: MessageEvent<WorkerMessage>) => {
      const { data } = event;
      const pending = this.pending.get(data.id);
      if (!pending) {
        return;
      }
      this.pending.delete(data.id);
      if (data.status === 'success') {
        pending.resolve(data.people);
      } else {
        pending.reject(new Error(data.error));
      }
    };

    worker.onerror = (event) => {
      const error = new Error(event.message || 'Worker error');
      this.flushPending(error);
      this.disposeWorker();
    };

    worker.onmessageerror = () => {
      const error = new Error('Failed to parse worker message');
      this.flushPending(error);
      this.disposeWorker();
    };

    this.worker = worker;
    return worker;
  }

  private fetchFromWorker(): Promise<PersonEntry[]> {
    return new Promise<PersonEntry[]>((resolve, reject) => {
      const worker = this.ensureWorker();
      const id = this.messageId++;
      this.pending.set(id, { resolve, reject });
      const request: LoadPeopleRequest = { id, type: 'loadPeople' };
      worker.postMessage(request);
    });
  }

  private flushPending(error: Error) {
    this.pending.forEach(({ reject }) => reject(error));
    this.pending.clear();
  }

  private disposeWorker() {
    this.worker?.terminate();
    this.worker = null;
  }
}
