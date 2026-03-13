import { FetchJsonLoader } from '@modules/data/dataStore/strategies/FetchJsonLoader';
import { LoaderContext } from '@modules/data/dataStore/types';
import { RefreshMetadata } from '@modules/data/dataStore/types';

// Polyfill TextDecoder for jsdom environments where it may not be available.
// The FetchJsonLoader source uses TextDecoder internally on the streaming path.
if (typeof globalThis.TextDecoder === 'undefined') {
  const { TextDecoder: NodeTextDecoder } = require('util');
  (globalThis as any).TextDecoder = NodeTextDecoder;
}

type Meta = RefreshMetadata;

/** Build a minimal fake Response-like object that returns JSON via .json() */
function makeJsonResponse(data: unknown): Response {
  return {
    ok: true,
    body: null,
    headers: {
      get: () => null,
    },
    json: jest.fn(async () => data),
  } as unknown as Response;
}

/**
 * Build a streaming Response-like object that delivers the given JSON payload
 * chunk-by-chunk so that the progress-tracking code path is exercised.
 * Uses Buffer (Node.js built-in) to avoid TextEncoder availability issues in jsdom.
 */
function makeStreamingResponse(data: unknown, chunkSize = 5): Response {
  const buf = Buffer.from(JSON.stringify(data), 'utf-8');
  const encoded = new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength);
  const total = encoded.length;

  const chunks: Uint8Array[] = [];
  for (let offset = 0; offset < encoded.length; offset += chunkSize) {
    chunks.push(encoded.slice(offset, offset + chunkSize));
  }

  // Simple async iterator for a ReadableStream-like reader
  let index = 0;
  const reader = {
    read: jest.fn(async () => {
      if (index < chunks.length) {
        return { done: false, value: chunks[index++] };
      }
      return { done: true, value: undefined };
    }),
  };

  return {
    ok: true,
    body: { getReader: () => reader },
    headers: {
      get: (name: string) => (name === 'Content-Length' ? String(total) : null),
    },
    json: jest.fn(async () => data),
  } as unknown as Response;
}

function makeContext(overrides: Partial<LoaderContext<any, Meta>> = {}): LoaderContext<any, Meta> {
  return {
    previousSnapshot: undefined,
    metadata: undefined,
    force: false,
    onProgress: undefined,
    ...overrides,
  };
}

describe('FetchJsonLoader', () => {
  describe('when Content-Length is absent (fallback path)', () => {
    it('loads JSON data from the configured URL', async () => {
      const payload = { items: [1, 2, 3] };
      const mockFetch = jest.fn(async () => makeJsonResponse(payload));

      const loader = new FetchJsonLoader({ url: 'https://example.com/data.json', fetchImpl: mockFetch as any });

      const result = await loader.load(makeContext());

      expect(mockFetch).toHaveBeenCalledWith('https://example.com/data.json');
      expect(result.snapshot.data).toEqual(payload);
    });

    it('sets a numeric timestamp on the snapshot', async () => {
      const mockFetch = jest.fn(async () => makeJsonResponse({ x: 1 }));
      const loader = new FetchJsonLoader({ url: 'https://example.com/data.json', fetchImpl: mockFetch as any });

      const before = Date.now();
      const result = await loader.load(makeContext());
      const after = Date.now();

      expect(result.snapshot.timestamp).toBeGreaterThanOrEqual(before);
      expect(result.snapshot.timestamp).toBeLessThanOrEqual(after);
    });

    it('calls onProgress(100) at the end when no streaming body is present', async () => {
      const mockFetch = jest.fn(async () => makeJsonResponse({ a: 1 }));
      const loader = new FetchJsonLoader({ url: 'https://example.com/data.json', fetchImpl: mockFetch as any });

      const progressValues: number[] = [];
      await loader.load(makeContext({ onProgress: (p) => progressValues.push(p) }));

      expect(progressValues[progressValues.length - 1]).toBe(100);
    });

    it('uses a custom fetchImpl when provided', async () => {
      const customFetch = jest.fn(async () => makeJsonResponse({ custom: true }));
      const loader = new FetchJsonLoader({ url: 'https://example.com/data.json', fetchImpl: customFetch as any });

      const result = await loader.load(makeContext());

      expect(customFetch).toHaveBeenCalledTimes(1);
      expect(result.snapshot.data).toEqual({ custom: true });
    });
  });

  describe('when Content-Length is present (streaming path)', () => {
    it('reads the body incrementally and reports progress', async () => {
      const payload = { streaming: true, items: [1, 2, 3, 4, 5] };
      const mockFetch = jest.fn(async () => makeStreamingResponse(payload, 4));
      const loader = new FetchJsonLoader({ url: 'https://example.com/data.json', fetchImpl: mockFetch as any });

      const progressValues: number[] = [];
      const result = await loader.load(makeContext({ onProgress: (p) => progressValues.push(p) }));

      // Progress should have been called multiple times (one per chunk + final 100)
      expect(progressValues.length).toBeGreaterThan(1);
      // Final value should be 100
      expect(progressValues[progressValues.length - 1]).toBe(100);
      // All intermediate values should be in [0, 100]
      for (const p of progressValues) {
        expect(p).toBeGreaterThanOrEqual(0);
        expect(p).toBeLessThanOrEqual(100);
      }
      // Parsed data should match original payload
      expect(result.snapshot.data).toEqual(payload);
    });

    it('sets a numeric timestamp on the snapshot when streaming', async () => {
      const payload = { streaming: true };
      const mockFetch = jest.fn(async () => makeStreamingResponse(payload));
      const loader = new FetchJsonLoader({ url: 'https://example.com/data.json', fetchImpl: mockFetch as any });

      const before = Date.now();
      const result = await loader.load(makeContext());
      const after = Date.now();

      expect(result.snapshot.timestamp).toBeGreaterThanOrEqual(before);
      expect(result.snapshot.timestamp).toBeLessThanOrEqual(after);
    });
  });

  describe('when Content-Length is zero or non-numeric (fallback path)', () => {
    it('falls back to response.json() when Content-Length is 0', async () => {
      const payload = { fallback: true };
      const response = {
        ok: true,
        body: { getReader: jest.fn() },
        headers: { get: () => '0' },
        json: jest.fn(async () => payload),
      } as unknown as Response;

      const mockFetch = jest.fn(async () => response);
      const loader = new FetchJsonLoader({ url: 'https://example.com/data.json', fetchImpl: mockFetch as any });

      const result = await loader.load(makeContext());

      // body.getReader should NOT be called — we fell back to json()
      expect(response.body!.getReader).not.toHaveBeenCalled();
      expect(result.snapshot.data).toEqual(payload);
    });

    it('falls back to response.json() when body is null', async () => {
      const payload = { noBody: true };
      const mockFetch = jest.fn(async () => makeJsonResponse(payload));
      const loader = new FetchJsonLoader({ url: 'https://example.com/data.json', fetchImpl: mockFetch as any });

      const result = await loader.load(makeContext());

      expect(result.snapshot.data).toEqual(payload);
    });
  });
});
