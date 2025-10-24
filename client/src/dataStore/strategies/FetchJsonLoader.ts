import { LoaderContext, LoaderResult, LoaderStrategy, RefreshMetadata } from '../types';

export interface FetchJsonLoaderOptions {
  url: string;
  fetchImpl?: typeof fetch;
}

export interface JsonDatasetSnapshot<TData> {
  data: TData;
  timestamp: number;
}

export class FetchJsonLoader<TData, TMeta extends RefreshMetadata = RefreshMetadata>
  implements LoaderStrategy<JsonDatasetSnapshot<TData>, TMeta>
{
  private readonly url: string;
  private readonly fetchImpl: typeof fetch;

  constructor(options: FetchJsonLoaderOptions) {
    this.url = options.url;
    this.fetchImpl = options.fetchImpl ?? fetch.bind(globalThis);
  }

  async load(
    context: LoaderContext<JsonDatasetSnapshot<TData>, TMeta>,
  ): Promise<LoaderResult<JsonDatasetSnapshot<TData>, TMeta>> {
    const response = await this.fetchImpl(this.url);
    const totalHeader = (response as any).headers?.get?.('Content-Length');
    const total = Number.parseInt(totalHeader ?? '0', 10);

    const data = await this.readJson(response, total, context);

    return {
      snapshot: {
        data,
        timestamp: Date.now(),
      },
    };
  }

  private async readJson(
    response: Response,
    total: number,
    context: LoaderContext<JsonDatasetSnapshot<TData>, TMeta>,
  ): Promise<TData> {
    if (response.body && Number.isFinite(total) && total > 0) {
      const reader = response.body.getReader();
      const chunks: Uint8Array[] = [];
      let received = 0;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (value) {
          chunks.push(value);
          received += value.length;
          context.onProgress?.(
            Math.min(100, (received / total) * 100),
            received,
            total,
          );
        }
      }

      const all = new Uint8Array(received);
      let offset = 0;
      for (const chunk of chunks) {
        all.set(chunk, offset);
        offset += chunk.length;
      }

      context.onProgress?.(100, received, total);

      return JSON.parse(new TextDecoder().decode(all));
    }

    const json = await response.json();
    context.onProgress?.(100);
    return json as TData;
  }
}
