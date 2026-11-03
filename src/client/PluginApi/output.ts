import type { FormatStateSnapshot } from "@client/ansi/FormatState";
import { AnsiAwareBuffer, TextSelection } from "@client/ansi/FormatState";
import { renderTable, type TableOptions } from "@client/ansi/table";
import type { PluginApiContext } from "./context";

export type { TableColumn, TableOptions, TextInput } from "@client/ansi/table";

/**
 * Output API - Print to game window
 */
export interface OutputApi {
  /**
   * Print text to the game output
   * @param text - Text, a line made with `api.text`, or a selection in one
   *               (its whole line is printed, so a chain can be printed as is)
   *
   * @example
   * ```typescript
   * api.output.print('Gotowe.');
   * api.output.print(api.text(`Haslo to: ${password}`).select(password).fg('slate_blue'));
   * ```
   */
  print(text: string | AnsiAwareBuffer | TextSelection): void;

  /** How many characters fit across the game output, or 0 while it is not known yet */
  readonly width: number;

  /**
   * Draw a table, ready to print. Cells can be text, numbers or lines made with
   * `api.text` (with their colours and links). The result is a line like any
   * other, so parts of it can still be selected and coloured. The table fits
   * the output's width: wide columns narrow and their cells wrap.
   *
   * @example
   * ```typescript
   * const table = api.output.table({
   *   title: 'Zestawy ziol',
   *   columns: ['Nazwa', { header: 'Ilosc', align: 'right' }],
   *   rows: sets.map(s => [api.text(s.name).select().fg('orange').link(() => buy(s)), s.amount]),
   *   styles: { header: { bold: true } },
   * });
   * table.selectAll('brak').fg('gray');
   * api.output.print(table);
   * ```
   */
  table(options: TableOptions): AnsiAwareBuffer;
}

/**
 * Colors API - Create and manage colors
 */
export interface ColorsApi {
  /**
   * Create a color from hex string
   * @param hex - Hex color string (e.g., "#ff0000")
   * @returns Format state with the color applied
   */
  fromHex(hex: string): FormatStateSnapshot;

  /**
   * Create a color from RGB values
   * @param r - Red (0-255)
   * @param g - Green (0-255)
   * @param b - Blue (0-255)
   * @returns Format state with the color applied
   */
  fromRgb(r: number, g: number, b: number): FormatStateSnapshot;
}

export function createOutputApi(ctx: PluginApiContext): OutputApi {
  return {
    print: (text) => {
      ctx.client.print(text instanceof TextSelection ? text.line : text);
    },
    get width() {
      return ctx.client.contentWidth || 0;
    },
    table: (options) => renderTable(options, ctx.client.contentWidth || 0),
  };
}

export function createColorsApi(): ColorsApi {
  return {
    fromHex: (hex) => {
      return { foreground: { space: "hex", color: hex } };
    },

    fromRgb: (r, g, b) => {
      return { foreground: { space: "rgb", r, g, b } };
    }
  };
}
