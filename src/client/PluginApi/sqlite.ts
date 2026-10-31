import { getPluginHostPort } from "@client/ports";

/**
 * SQLite API - read a SQLite file the player picks, such as a Mudlet database
 * (Database_<nazwa>.db in the Mudlet profile folder), to import its data.
 */
export interface SqliteApi {
  /**
   * Run named queries against a SQLite file. The file is opened in memory, so
   * nothing a query does reaches it.
   *
   * @param file - The file (e.g. from an `<input type="file">`) or its bytes
   * @param queries - SQL by a name of your choice
   * @returns The rows of each query under its name, every row an object keyed by column
   * @throws When the file is not a SQLite database or a query fails
   *
   * @example
   * ```typescript
   * const { notes } = await api.sqlite.read(file, {
   *   notes: 'SELECT character, room, text FROM notes',
   * });
   * for (const row of notes) console.log(row.character, row.room, row.text);
   * ```
   */
  read(file: Blob | ArrayBuffer, queries: Record<string, string>): Promise<Record<string, Record<string, unknown>[]>>;
}

export function createSqliteApi(): SqliteApi {
  return {
    read: async (file, queries) => {
      // A copy: the worker takes the buffer it is sent
      const buffer = file instanceof ArrayBuffer ? file.slice(0) : await file.arrayBuffer();
      return getPluginHostPort().readSqlite(buffer, queries);
    },
  };
}
