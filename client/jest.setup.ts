import 'fake-indexeddb/auto';

process.env.IS_JEST = 'true';

class LocalStorageMock {
  private store: Record<string, string> = {};
  clear() { this.store = {}; }
  getItem(key: string) { return this.store[key] ?? null; }
  setItem(key: string, value: string) { this.store[key] = String(value); }
  removeItem(key: string) { delete this.store[key]; }
}

if (typeof globalThis.localStorage === 'undefined') {
  (globalThis as any).localStorage = new LocalStorageMock();
}

if (typeof globalThis.structuredClone !== 'function') {
  (globalThis as any).structuredClone = (val: any) => JSON.parse(JSON.stringify(val));
}

if (typeof globalThis.fetch !== 'function') {
  if (typeof global.fetch === 'function') {
    (globalThis as any).fetch = global.fetch.bind(global);
  } else {
    (globalThis as any).fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        magics: {},
        magic_keys: [],
        herb_id_to_odmiana: {},
        version: 1,
        herb_id_to_use: {}
      }),
    });
  }
}

if (typeof (require as any).context !== 'function') {
  const path = require('path');
  const fs = require('fs');
  (require as any).context = (base = '.', scanSubDirectories = false, regularExpression = /./) => {
    const baseDir = path.resolve(__dirname, 'src/scripts', base.replace(/^\.\//, ''));
    const files: string[] = [];

    const readDirectory = (directory: string, prefix: string) => {
      fs.readdirSync(directory).forEach((file: string) => {
        const fullPath = path.join(directory, file);
        const relativePath = `${prefix}${file}`;
        if (fs.statSync(fullPath).isDirectory()) {
          if (scanSubDirectories) {
            readDirectory(fullPath, `${relativePath}/`);
          }
          return;
        }
        if (regularExpression.test(relativePath)) {
          files.push(`./${relativePath}`);
        }
      });
    };

    readDirectory(baseDir, '');

    const context = ((key: string) => {
      const filePath = path.join(baseDir, key.replace(/^\.\//, ''));
      const content = fs.readFileSync(filePath, 'utf-8');
      return JSON.parse(content);
    }) as RequireContext;

    context.keys = () => files;
    return context;
  };
}

type RequireContext = ((key: string) => any) & { keys: () => string[] };
