import type { Trigger, TriggerCallback, TriggerOptions, TriggerPattern, TriggerSubPattern } from "@client/Triggers";
import { waitForLine } from "@client/utils/waitForLine";
import type { PluginApiContext } from "./context";

/**
 * Triggers API - Manage pattern-based triggers
 */
export interface TriggersApi {
  /**
   * Register a trigger that fires when a pattern matches
   * @param pattern - Pattern(s) to match
   * @param callback - Function to call on match
   * @param tag - Optional tag for grouping/removal
   * @param options - Trigger options
   * @returns The registered trigger instance
   */
  register(
    pattern: TriggerPattern,
    callback?: TriggerCallback,
    tag?: string,
    options?: TriggerOptions
  ): Trigger;

  /**
   * Register a one-time trigger (auto-removed after first match)
   * @param pattern - Pattern(s) to match
   * @param callback - Function to call on match
   * @param tag - Optional tag for grouping/removal
   * @param options - Trigger options
   * @returns The registered trigger instance
   */
  registerOneTime(
    pattern: TriggerPattern,
    callback: TriggerCallback,
    tag?: string,
    options?: TriggerOptions
  ): Trigger;

  /**
   * Register a token-based trigger (matches whole words/tokens)
   * Token triggers are optimized for matching whole words rather than regex patterns.
   * They split the line into tokens and match complete token sequences.
   * @param token - Token or phrase to match (will be split by spaces/punctuation)
   * @param callback - Function to call on match
   * @param tag - Optional tag for grouping/removal
   * @param options - Trigger options
   * @returns The registered trigger instance
   *
   * @example
   * ```typescript
   * // Match single word
   * api.triggers.registerToken("zloto", (line, matches) => {
   *   return line.color([0, line.text.length], api.colors.fromHex('#ffd700'));
   * }, "myPlugin");
   *
   * // Match phrase (multiple tokens)
   * api.triggers.registerToken("magiczny miecz", (line, matches) => {
   *   api.output.print("Found magic sword!", "system");
   *   return line;
   * }, "myPlugin");
   * ```
   */
  registerToken(
    token: string,
    callback?: TriggerCallback,
    tag?: string,
    options?: TriggerOptions
  ): Trigger;

  /**
   * Remove a specific trigger
   * @param trigger - Trigger instance to remove
   */
  remove(trigger: Trigger): void;

  /**
   * Remove all triggers with a specific tag
   * @param tag - Tag to filter by
   */
  removeByTag(tag: string): void;

  /**
   * Wait for the first game line that matches one of the patterns.
   *
   * The temporary triggers are removed as soon as one matches, the timeout
   * passes, or the signal aborts. Lines are not changed or gagged.
   *
   * @param patterns - One pattern, or alternatives; the first to match wins
   * @param options - Timeout in ms (none by default), abort signal, trigger tag
   * @returns Which pattern matched, its match and the line text
   * @throws An Error named `TimeoutError` when the timeout passes, and the
   *         signal's reason (an `AbortError` by default) when it aborts
   *
   * @example
   * ```typescript
   * api.command.send('otworz drzwi');
   * const r = await api.triggers.waitFor(
   *   [/^Otwierasz (.*)\.$/, /^Drzwi sa zamkniete na klucz\./],
   *   { timeout: 15000, signal }
   * );
   * if (r.index === 0) console.log('opened', r.match[1]);
   * ```
   */
  waitFor(patterns: TriggerSubPattern | TriggerSubPattern[], options?: WaitForOptions): Promise<WaitForResult>;
}

/** Options for {@link TriggersApi.waitFor} */
export interface WaitForOptions {
  /** Give up after this many milliseconds */
  timeout?: number;
  /** Abort the wait (e.g. when the user presses Stop) */
  signal?: AbortSignal;
  /**
   * Tag for the temporary triggers. Note that removeByTag only removes them;
   * use `signal` to cancel the wait itself.
   */
  tag?: string;
}

/** Result of {@link TriggersApi.waitFor} */
export interface WaitForResult {
  /** Index of the pattern that matched */
  index: number;
  /** The match (capture groups for regex patterns) */
  match: RegExpMatchArray;
  /** Plain text of the matched line */
  line: string;
}

export function createTriggersApi(ctx: PluginApiContext): TriggersApi {
  return {
    register: (pattern, callback, tag, options) => {
      return ctx.client.Triggers.registerTrigger(pattern, callback, tag, options);
    },

    registerOneTime: (pattern, callback, tag, options) => {
      return ctx.client.Triggers.registerOneTimeTrigger(pattern, callback, tag, options);
    },

    registerToken: (token, callback, tag, options) => {
      return ctx.client.Triggers.registerTokenTrigger(token, callback, tag, options);
    },

    remove: (trigger) => {
      ctx.client.Triggers.removeTrigger(trigger);
    },

    removeByTag: (tag) => {
      ctx.client.Triggers.removeByTag(tag);
    },

    waitFor: (patterns, options) => waitForLine(ctx.client.Triggers, patterns, options)
  };
}
