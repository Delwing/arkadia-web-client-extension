/**
 * The old home of the ANSI formatting model, kept so existing imports work.
 * New code imports from the file that owns the thing:
 * - `colors` — colour types and helpers, the Mudlet palette
 * - `formatSnapshot` — the formatting state of a piece of text, and segments
 * - `AnsiParser` — ANSI SGR escapes to segments
 * - `renderSegments` — segments to HTML / DOM
 * - `AnsiAwareBuffer` — the formatted line
 * - `TextSelection` — part of a line, to change without counting positions
 */
export type {ColorInput, LinkInput, StyleInput, StyleSpec} from "./style";
export type {FormatColor, HexColor, IndexedColor, RgbColor} from "./colors";
export {DIM_EASINGS, isDimEasing} from "./formatSnapshot";
export type {BufferSegment, DimEasing, DimEffect, FormatHyperlink, FormatStateSnapshot, TextRange} from "./formatSnapshot";
export {cloneState as cloneFormatState, statesEqual as formatStatesEqual} from "./formatSnapshot";
export {AnsiAwareBuffer} from "./AnsiAwareBuffer";
export {TextSelection} from "./TextSelection";
export type {SelectTarget} from "./TextSelection";
