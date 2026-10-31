import { getPluginHostPort } from "@client/ports";
import {
setFooterButtonState
} from "@modules/core/footerButtonRegistry";
import type { ReactElement } from "react";
import type { PluginApiContext } from "../context";
import type { ContextMenuEntryHandle,FooterComponentHandle,WidgetOptions,WidgetHandle,PluginScrollbackOptions,PluginScrollbackHandle,PluginTooltip,PluginTooltipHandle,FooterButtonOptions,FooterButtonHandle } from "./chrome";
import { createChromeApi } from "./chrome";
import type { PluginReact,PluginUiComponents } from "./kit";
import type { PopupContent,PopupHandle,PopupSizeOptions,PersistentPopupConfig,PersistentPopupHandle,PopupMenuEntryHandle } from "./popups";
import { createPopupApi } from "./popups";

/**
 * UI helpers for plugins
 */
export interface UiApi {
  /**
   * The host's React. Build popup content with it so hooks work: a plugin
   * that bundles its own React gets a second copy, and hooks then fail.
   * Throws when no UI host is running.
   *
   * @example
   * ```typescript
   * const { createElement: h, useState } = api.ui.react;
   * function Counter() {
   *   const [n, setN] = useState(0);
   *   return h(api.ui.components.Button, { onClick: () => setN(n + 1) }, `Klik ${n}`);
   * }
   * await api.ui.registerPersistentPopup({ id: 'counter', title: 'Licznik', createContent: () => h(Counter) });
   * ```
   */
  readonly react: PluginReact;

  /**
   * The client's own UI components (Button, HeaderButton, Segmented, …).
   * Throws when no UI host is running.
   *
   * @experimental This set and its props may change between client versions.
   */
  readonly components: PluginUiComponents;

  /**
   * Create a draggable popup window.
   *
   * @deprecated Use {@link registerPersistentPopup} instead for popups that need
   * docking and persistence across page reloads. This method generates popup IDs
   * from title hashes, which are not stable and prevent proper state restoration.
   *
   * @param title - Popup title text
   * @param body - Popup body content (string or DOM node)
   * @param options - Starting size of the popup
   * @returns Promise that resolves with handle for controlling the popup once mounted
   */
  createPopup(title: string, body: PopupContent, options?: PopupSizeOptions): Promise<PopupHandle>;

  /**
   * Register a persistent popup that can be docked and restored on page reload.
   *
   * If the popup was docked or pinned in a previous session, it will be
   * automatically opened when this method is called. The `wasRestored` property
   * on the returned handle indicates whether this happened.
   *
   * @param config - Popup configuration including ID, title, and content factory
   * @returns Promise that resolves with handle for controlling the popup
   *
   * @example
   * ```typescript
   * const popup = await api.ui.registerPersistentPopup({
   *   id: 'myInventory',
   *   title: 'My Inventory',
   *   createContent: async () => {
   *     const items = await loadInventoryData();
   *     return createInventoryView(items);
   *   }
   * });
   *
   * // Check if popup was restored from previous session
   * if (popup.wasRestored) {
   *   console.log('Popup was restored');
   * }
   *
   * // Toggle popup with menu entry
   * api.ui.addPopupMenuEntry('My Inventory', () => {
   *   popup.isOpen ? popup.close() : popup.open();
   * });
   * ```
   */
  registerPersistentPopup(config: PersistentPopupConfig): Promise<PersistentPopupHandle>;

  /**
   * Add an entry to the main (☰) menu
   * @param label - Entry label (string or DOM node for rich content like SVG icons)
   * @param onSelect - Callback invoked when entry is selected
   * @returns Handle for updating or removing the entry
   */
  addPopupMenuEntry(label: string | Node, onSelect: () => void): PopupMenuEntryHandle;

  /**
   * Add an entry to the output context menu
   * @param label - Entry label (string or DOM node for rich content like SVG icons)
   * @param action - Callback invoked when entry is selected
   * @returns Handle for updating or removing the entry
   */
  addContextMenuEntry(label: string | Node, action: () => void): ContextMenuEntryHandle;

  /**
   * Register a footer bar component.
   * Adds a custom component to the footer bar (next to built-in components like
   * Rozkaz timer, Clock, Attack mode, etc.)
   *
   * Supports three content types:
   * - HTML strings: Simple inline HTML
   * - DOM nodes: Pre-created DOM elements
   * - React elements: Full React components with state and hooks
   *
   * The content is drawn as it is, with no frame around it. To look like the
   * built-in chips, use their classes:
   * `<span class="chip"><span class="chip__ico">…</span><span class="chip__text">`
   * `<span class="chip__lab">Label</span><span class="chip__val">value</span></span></span>`
   * (add `chip--warn` / `chip--danger` for urgency).
   *
   * @param id - Unique identifier for this component (will be namespaced by plugin)
   * @param content - HTML string, DOM node, or React element
   * @param position - Where to insert: 'start', 'end' (default), or numeric index
   * @returns Handle for updating, hiding, or removing the component
   *
   * @example
   * ```typescript
   * // Simple HTML string
   * const timer = api.ui.registerFooterComponent(
   *   'myTimer',
   *   '<span style="color: yellow;">Timer: 0</span>'
   * );
   *
   * // Update content periodically
   * let seconds = 0;
   * setInterval(() => {
   *   seconds++;
   *   timer.setContent(`<span style="color: yellow;">Timer: ${seconds}</span>`);
   * }, 1000);
   * ```
   *
   * @example
   * ```typescript
   * // DOM node
   * const statusSpan = document.createElement('span');
   * statusSpan.style.color = 'springgreen';
   * statusSpan.textContent = 'Ready';
   *
   * const status = api.ui.registerFooterComponent('status', statusSpan);
   *
   * // Direct DOM manipulation
   * status.element.style.color = 'red';
   * status.element.textContent = 'Busy';
   * ```
   *
   * @example
   * ```typescript
   * // React component with state
   * import { useState, useEffect } from 'react';
   *
   * const MyTimer: React.FC = () => {
   *   const [seconds, setSeconds] = useState(0);
   *
   *   useEffect(() => {
   *     const interval = setInterval(() => setSeconds(s => s + 1), 1000);
   *     return () => clearInterval(interval);
   *   }, []);
   *
   *   return <span style={{ color: 'yellow' }}>Timer: {seconds}</span>;
   * };
   *
   * // Register React component
   * const timer = api.ui.registerFooterComponent('myTimer', <MyTimer />);
   *
   * // Can also update with new React element
   * timer.setContent(<MyTimer key="reset" />);
   * ```
   *
   * @example
   * ```typescript
   * // React component using client events (like built-in OrderTimer)
   * import { useState } from 'react';
   * import { useClientEvent } from '@web/hooks';
   *
   * const AttackStatus: React.FC = () => {
   *   const [isAttacking, setIsAttacking] = useState(false);
   *
   *   useClientEvent('combatStart', () => setIsAttacking(true));
   *   useClientEvent('combatEnd', () => setIsAttacking(false));
   *
   *   if (!isAttacking) return null;
   *   return <span style={{ color: 'red' }}>COMBAT</span>;
   * };
   *
   * api.ui.registerFooterComponent('attackStatus', <AttackStatus />);
   * ```
   */
  registerFooterComponent(
    id: string,
    content: string | Node | ReactElement,
    position?: 'start' | 'end' | number
  ): FooterComponentHandle;

  /**
   * Offer a widget: a small frameless piece the player can lay over the game
   * output wherever they like (Menu → Widżety → Dodaj, or `/widzety`). The
   * plugin only provides the content; placing, moving, sizing and removing it
   * is the player's, and where they put it is remembered, so it comes back there
   * whenever the plugin loads. Widgets are withdrawn with the plugin.
   *
   * The content is drawn on a soft see-through plate; keep it small. A widget
   * whose element is empty is hidden until it has something to show.
   *
   * @example
   * ```typescript
   * const widget = api.ui.registerWidget('licznik', '<b>0</b> zabitych', { label: 'Licznik zabitych', corner: 'tl' });
   * let kills = 0;
   * api.on('allEnemiesKilled', () => widget.setContent(`<b>${++kills}</b> zabitych`));
   * ```
   */
  registerWidget(id: string, content: string | Node | ReactElement, options?: WidgetOptions): WidgetHandle;

  /**
   * Add a button beside the command line, alongside the player's own
   * (Ustawienia -> Stopka). The button sends `command` when clicked; give it a
   * `state` name and it lights up whenever {@link UiApi.setFooterButtonState}
   * turns that state on. Plugin buttons are drawn dashed, and only the plugin
   * adds or removes them.
   *
   * @example
   * ```typescript
   * api.ui.registerFooterButton('podroz', {
   *   label: 'Tryb: podroz',
   *   command: 'tryb podroz',
   *   tone: 'accent',
   *   state: 'podroz',
   * });
   * api.ui.setFooterButtonState('podroz', true);
   * ```
   */
  registerFooterButton(id: string, button: FooterButtonOptions): FooterButtonHandle;

  /**
   * Turn a footer button's state on or off. Any button - the plugin's or the
   * player's own - whose state carries this name draws itself as on.
   */
  setFooterButtonState(name: string, on: boolean): void;

  /**
   * Give an element a hover card in the client's own tooltip, the one the
   * built-in footer chips, herbs and books use, instead of a browser `title`.
   * Shown above the element once the mouse rests on it for about half a second,
   * like a `title`; clicking the element leaves it up. Pass a string for one line, or a card with a header,
   * label/value rows and click / hold hints.
   *
   * The card is redrawn at once when you call `update()` while it is shown, so
   * a ticking value can follow along. Tooltips are removed with the plugin.
   *
   * @example
   * ```typescript
   * const chip = api.ui.registerFooterComponent('timer', '<span class="chip">…</span>');
   * const tip = api.ui.setTooltip(chip.element, {
   *   header: 'Mój licznik',
   *   rows: [{ label: 'Pozostało', content: '0:42' }],
   *   click: 'zresetuj licznik',
   * });
   * tip.update({ header: 'Mój licznik', rows: [{ label: 'Pozostało', content: '0:41' }] });
   * ```
   */
  setTooltip(element: Element, tooltip: string | PluginTooltip | null): PluginTooltipHandle;

  /**
   * Make a scrolling list behave like the game output and the built-in chat
   * window: it stays pinned to the bottom as lines arrive, and once the player
   * scrolls up to read, the newest lines stay in sight in a pane at the bottom
   * (the split view) with a handle to resize it.
   *
   * Give it the element that scrolls (`overflow-y: auto`, no bottom padding)
   * and add, remove or replace its children as you like - every change re-pins
   * it. Children are cloned into the pane, which drops their event listeners;
   * pass `renderSplit` when the lines need live handlers. Removed with the plugin.
   *
   * @example
   * ```typescript
   * const list = document.createElement('div');
   * list.style.cssText = 'height: 100%; overflow-y: auto';
   * const scrollback = api.ui.attachScrollback(list, {
   *   splitHeight: popup.getSetting('splitHeight', 120),
   *   onSplitResize: (height) => popup.setSetting('splitHeight', height),
   * });
   * list.append(lineElement); // pinned, or mirrored into the pane
   * ```
   */
  attachScrollback(element: HTMLElement, options?: PluginScrollbackOptions): PluginScrollbackHandle;
}

export function createUiApi(ctx: PluginApiContext): UiApi {
  const uiKit = () => {
    const kit = getPluginHostPort().getUiKit();
    if (!kit) {
      throw new Error('Plugin UI is not available: no UI host is running.');
    }
    return kit;
  };
  return {
    get react() {
      return uiKit().React as PluginReact;
    },
    get components() {
      return uiKit().components as unknown as PluginUiComponents;
    },
    ...createPopupApi(ctx),
    ...createChromeApi(ctx),
    setFooterButtonState: (name, on) => setFooterButtonState(name, on),
  };
}
