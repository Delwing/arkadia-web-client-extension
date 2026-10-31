import type { FormatStateSnapshot } from "@client/ansi/FormatState";
import { AnsiAwareBuffer } from "@client/ansi/FormatState";
import type { PluginApiContext } from "./context";

/**
 * Output API - Print to game window
 */
export interface OutputApi {
  /**
   * Print text to the game output
   * @param text - Text or buffer to display
   */
  print(text: string | AnsiAwareBuffer): void;
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
      ctx.client.print(text);
    }
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
