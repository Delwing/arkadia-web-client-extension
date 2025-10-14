import { DataSource, DataStoreProgressListener } from './types';

export class APIDataSource<T> implements DataSource<T> {
  constructor(private readonly url: string) {}

  async load(onProgress?: DataStoreProgressListener): Promise<T> {
    try {
      const response = await fetch(this.url, {
        headers: {
          Accept: 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error(`API request failed with status ${response.status}`);
      }

      if (!onProgress) {
        return (await response.json()) as T;
      }

      onProgress(0);

      if (!response.body) {
        const data = (await response.json()) as T;
        onProgress(1);
        return data;
      }

      const contentLengthHeader =
        response.headers.get('content-length') ?? response.headers.get('Content-Length');
      const totalLength = contentLengthHeader ? Number(contentLengthHeader) : NaN;
      const hasTotalLength = Number.isFinite(totalLength) && totalLength > 0;

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let receivedLength = 0;
      let jsonText = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) {
          break;
        }

        if (value) {
          receivedLength += value.byteLength;
          jsonText += decoder.decode(value, { stream: true });

          if (hasTotalLength && totalLength > 0) {
            const progress = Math.min(receivedLength / totalLength, 1);
            onProgress(progress);
          }
        }
      }

      jsonText += decoder.decode();
      onProgress(1);

      return JSON.parse(jsonText) as T;
    } catch (error) {
      console.error(`APIDataSource failed to load ${this.url}`, error);
      throw error;
    }
  }
}
