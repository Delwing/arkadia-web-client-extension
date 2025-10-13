import { DataSource } from './types';

export class APIDataSource<T> implements DataSource<T> {
  constructor(private readonly url: string, private readonly fetchFn: typeof fetch = fetch) {}

  async load(): Promise<T> {
    try {
      const response = await this.fetchFn(this.url, {
        headers: {
          Accept: 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error(`API request failed with status ${response.status}`);
      }

      return (await response.json()) as T;
    } catch (error) {
      console.error(`APIDataSource failed to load ${this.url}`, error);
      throw error;
    }
  }
}
