import { DataSource, DataStoreProgressListener } from './types';

interface WorkerRequest {
  type: 'load';
}

interface WorkerSuccessResponse<T> {
  type: 'success';
  payload: T;
}

interface WorkerErrorResponse {
  type: 'error';
  message: string;
}

type WorkerResponse<T> = WorkerSuccessResponse<T> | WorkerErrorResponse;

type WorkerFactory = () => Worker;

export class WorkerDataSource<T> implements DataSource<T> {
  private worker: Worker | null = null;
  private workerPromise: Promise<Worker> | null = null;

  constructor(private readonly createWorker: WorkerFactory) {}

  async load(onProgress?: DataStoreProgressListener): Promise<T> {
    const worker = await this.getWorker();

    return new Promise<T>((resolve, reject) => {
      const messageListener = (event: MessageEvent) => {
        const data = event.data as WorkerResponse<T>;
        if (!data || (data.type !== 'success' && data.type !== 'error')) {
          return;
        }

        cleanup();
        if (data.type === 'success') {
          onProgress?.(1);
          resolve(data.payload);
        } else {
          reject(new Error(data.message));
        }
      };

      const errorListener = (event: ErrorEvent) => {
        console.error('WorkerDataSource worker error', event.message);
        cleanup();
        reject(event.error ?? new Error(event.message));
      };

      const cleanup = () => {
        worker.removeEventListener('message', messageListener);
        worker.removeEventListener('error', errorListener);
      };

      worker.addEventListener('message', messageListener);
      worker.addEventListener('error', errorListener);
      onProgress?.(0);
      const request: WorkerRequest = { type: 'load' };
      worker.postMessage(request);
    });
  }

  private async getWorker(): Promise<Worker> {
    if (this.worker) {
      return this.worker;
    }

    if (this.workerPromise) {
      return this.workerPromise;
    }

    this.workerPromise = Promise.resolve(this.createWorker());
    this.worker = await this.workerPromise;
    this.workerPromise = null;
    return this.worker;
  }
}
