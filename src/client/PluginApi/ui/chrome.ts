import { getUiPort } from "@client/ports";
import {
  registerContextMenuEntry,
  unregisterContextMenuEntry,
  updateContextMenuEntry,
} from "@modules/core/pluginUiRegistry";
import {
  registerFooterButton,
  unregisterFooterButton,
  type FooterButtonTone,
} from "@modules/core/footerButtonRegistry";
import {
  registerFooterComponent,
  unregisterFooterComponent,
  updateFooterComponent,
  updateFooterComponentPluginName,
  setFooterComponentVisible,
  type FooterContent,
} from "@modules/core/pluginFooterRegistry";
import {
  registerPluginWidget,
  unregisterPluginWidget,
  updatePluginWidget,
  updateWidgetPluginName,
  type WidgetContent,
} from "@modules/core/pluginWidgetRegistry";
import type { ReactElement } from "react";
import type { PluginApiContext } from "../context";
import type { UiApi } from "./index";

/**
 * Handle for context menu entries
 */
export interface ContextMenuEntryHandle {
  /**
   * Update the entry label
   * @param label - String or DOM node for rich content
   */
  setLabel(label: string | Node): void;

  /**
   * Update the entry action
   */
  setAction(action: () => void): void;

  /**
   * Remove the entry from the menu
   */
  remove(): void;
}

/**
 * Handle for footer components
 */
export interface FooterComponentHandle {
  /**
   * The DOM element for this footer component.
   * Can be used for direct DOM manipulation when using HTML or DOM node content.
   */
  readonly element: HTMLSpanElement;

  /**
   * Update the component content.
   * Accepts HTML strings, DOM nodes, or React elements.
   * When using React, the component will be re-rendered with the new element.
   * @param content - HTML string, DOM node, or React element
   */
  setContent(content: string | Node | ReactElement): void;

  /**
   * Set component visibility
   * @param visible - Whether the component should be visible
   */
  setVisible(visible: boolean): void;

  /**
   * Remove the component from the footer
   */
  remove(): void;
}

/** Options for {@link UiApi.registerWidget}. */
export interface WidgetOptions {
  /** Name in the "Dodaj widżet" list and the widget's right-click menu; defaults to the plugin's name. */
  label?: string;
  /** Corner of the game output a newly added copy lands in: top/bottom + left/right. Defaults to 'tr'. */
  corner?: 'tl' | 'tr' | 'bl' | 'br';
}

/** Handle for a widget registered with {@link UiApi.registerWidget}. */
export interface WidgetHandle {
  /**
   * The widget's DOM element. Every placed copy shows this one element (only
   * one copy of a plugin widget is drawn at a time).
   */
  readonly element: HTMLDivElement;

  /** Replace the content: HTML string, DOM node, or React element. */
  setContent(content: string | Node | ReactElement): void;

  /** Withdraw the widget. Where the player placed it is kept for next time. */
  remove(): void;
}

/** Options for {@link UiApi.attachScrollback}. */
export interface PluginScrollbackOptions {
  /** Newest lines mirrored into the split pane (default 40). */
  splitLines?: number;
  /** Starting pane height in px (default 120). */
  splitHeight?: number;
  /** Called with the pane height once the player finishes dragging its handle - store it to keep the size. */
  onSplitResize?: (heightPx: number) => void;
  /**
   * Builds the pane's lines, newest last, at most `lines` of them. Without it
   * the last children are cloned, so their event listeners are not carried over.
   */
  renderSplit?: (lines: number) => Node[];
  /** Called when the split view opens (true) or closes (false). */
  onSplitViewChange?: (open: boolean) => void;
  /** How close to the bottom, in px, still counts as "at the bottom" (default 1: only the real bottom closes the split view). */
  bottomThreshold?: number;
}

/** Handle for a scrollback made with {@link UiApi.attachScrollback}. */
export interface PluginScrollbackHandle {
  /** Whether the player is scrolled up and the split pane is showing. */
  isSplitView(): boolean;
  /** Re-pin and redraw the pane after changing a line in place (the children stayed the same). */
  refresh(): void;
  /** Resize the split pane. */
  setSplitHeight(heightPx: number): void;
  /** Close the split view and jump to the newest line. */
  scrollToBottom(): void;
  /** Stop managing the element. Its content stays. */
  remove(): void;
}

/** A hover card for {@link UiApi.setTooltip}. */
export interface PluginTooltip {
  /** Bold first line. */
  header?: string;
  /**
   * Rows of the card: a grey label beside its content (text, or a DOM node for
   * colour or icons), or a bare DOM node laid out full width (a bar, a chart).
   */
  rows?: Array<{ label: string; content: string | Node } | Node>;
  /** What a click does, dimmed at the foot after "kliknij". */
  click?: string;
  /** What a long press does, after "przytrzymaj". */
  hold?: string;
}

/** Handle for a tooltip set with {@link UiApi.setTooltip}. */
export interface PluginTooltipHandle {
  /** Replace the card; null leaves the element without one. */
  update(tooltip: string | PluginTooltip | null): void;
  /** Take the tooltip off the element. */
  remove(): void;
}

/** What a plugin's footer button is. */
export interface FooterButtonOptions {
  label: string;
  /** Sent on click: a command, an alias, anything the command line accepts. */
  command: string;
  tone?: FooterButtonTone;
  /** Name of the state that lights this button up, if it stands for a mode. */
  state?: string;
  /** Where it sits among the buttons; higher is further right. Default 1000. */
  order?: number;
}

export interface FooterButtonHandle {
  /** Replace what the button says or does. */
  update(button: Partial<FooterButtonOptions>): void;
  remove(): void;
}

export function createChromeApi(ctx: PluginApiContext) {
  const contextMenuEntryIds = new Set<string>();
  const footerComponentIds = new Set<string>();
  const footerButtonIds = new Set<string>();
  const widgetIds = new Set<string>();
  const tooltipHandles = new Set<PluginTooltipHandle>();
  const scrollbackHandles = new Set<PluginScrollbackHandle>();
  // The settings panel lists footer components, and "Dodaj widżet" widgets, by plugin name
  ctx.onRename((name) => {
    updateFooterComponentPluginName(ctx.pluginId, name);
    updateWidgetPluginName(ctx.pluginId, name);
  });
  ctx.onCleanup(() => {
    for (const id of Array.from(contextMenuEntryIds)) unregisterContextMenuEntry(id);
    contextMenuEntryIds.clear();
    for (const id of Array.from(footerComponentIds)) unregisterFooterComponent(id);
    footerComponentIds.clear();
    // The player's widget placements stay for next time
    for (const id of Array.from(widgetIds)) unregisterPluginWidget(id);
    widgetIds.clear();
    for (const id of Array.from(footerButtonIds)) unregisterFooterButton(id);
    footerButtonIds.clear();
    for (const handle of Array.from(tooltipHandles)) handle.remove();
    for (const handle of Array.from(scrollbackHandles)) handle.remove();
  });

  function addContextMenuEntry(label: string | Node, action: () => void): ContextMenuEntryHandle {
    const id = ctx.generateId("context-menu");
    registerContextMenuEntry(id, label, action);
    contextMenuEntryIds.add(id);

    return {
      setLabel: (value) => {
        updateContextMenuEntry(id, { label: value });
      },
      setAction: (callback) => {
        updateContextMenuEntry(id, { action: callback });
      },
      remove: () => {
        unregisterContextMenuEntry(id);
        contextMenuEntryIds.delete(id);
      }
    };
  }

  function addFooterComponent(id: string, content: FooterContent, position?: "start" | "end" | number): FooterComponentHandle {
    const fullId = `plugin:${ctx.pluginId}:${id}`;

    // Register the component - registry handles element creation and content rendering
    const record = registerFooterComponent(fullId, content, position, {
      pluginId: ctx.pluginId,
      localId: id
    });
    footerComponentIds.add(fullId);
    // Usually a no-op: a plugin registers its footer component during init(),
    // before the manager has told us its name, and setPluginName follows up.
    if (ctx.pluginName) updateFooterComponentPluginName(ctx.pluginId, ctx.pluginName);

    return {
      get element(): HTMLSpanElement {
        return record.element;
      },
      setContent: (newContent: FooterContent) => {
        updateFooterComponent(fullId, newContent);
      },
      setVisible: (visible) => {
        setFooterComponentVisible(fullId, visible);
      },
      remove: () => {
        unregisterFooterComponent(fullId);
        footerComponentIds.delete(fullId);
      }
    };
  }

  function addWidget(id: string, content: WidgetContent, options?: WidgetOptions): WidgetHandle {
    const fullId = `plugin:${ctx.pluginId}:${id}`;
    const record = registerPluginWidget(fullId, content, options, { pluginId: ctx.pluginId, localId: id });
    widgetIds.add(fullId);
    if (ctx.pluginName) updateWidgetPluginName(ctx.pluginId, ctx.pluginName);
    return {
      get element(): HTMLDivElement {
        return record.element;
      },
      setContent: (next: WidgetContent) => updatePluginWidget(fullId, next),
      remove: () => {
        unregisterPluginWidget(fullId);
        widgetIds.delete(fullId);
      }
    };
  }

  function setTooltip(element: Element, tooltip: string | PluginTooltip | null): PluginTooltipHandle {
    const attached = getUiPort().attachTooltip?.(element, tooltip);
    const handle: PluginTooltipHandle = {
      update: (next) => attached?.update(next),
      remove: () => {
        attached?.remove();
        tooltipHandles.delete(handle);
      }
    };
    tooltipHandles.add(handle);
    return handle;
  }

  function attachScrollback(element: HTMLElement, options: PluginScrollbackOptions = {}): PluginScrollbackHandle {
    const attached = getUiPort().attachScrollback?.(element, options);
    const handle: PluginScrollbackHandle = {
      isSplitView: () => attached?.isSplitView() ?? false,
      refresh: () => attached?.refresh(),
      setSplitHeight: (heightPx) => attached?.setSplitHeight(heightPx),
      scrollToBottom: () => attached?.scrollToBottom(),
      remove: () => {
        attached?.remove();
        scrollbackHandles.delete(handle);
      }
    };
    scrollbackHandles.add(handle);
    return handle;
  }

  function addFooterButton(id: string, button: FooterButtonOptions): FooterButtonHandle {
    const fullId = `plugin:${ctx.pluginId}:${id}`;
    let current: FooterButtonOptions = { ...button };
    const push = () => registerFooterButton({
      id: fullId,
      label: current.label,
      command: current.command,
      tone: current.tone ?? 'neutral',
      state: current.state,
      order: current.order ?? 1000,
      pluginName: ctx.pluginName ?? undefined
    });
    push();
    footerButtonIds.add(fullId);

    return {
      update: (changes: Partial<FooterButtonOptions>) => {
        current = { ...current, ...changes };
        push();
      },
      remove: () => {
        unregisterFooterButton(fullId);
        footerButtonIds.delete(fullId);
      }
    };
  }

  return {
    addContextMenuEntry,
    registerFooterComponent: addFooterComponent,
    registerWidget: addWidget,
    setTooltip,
    attachScrollback,
    registerFooterButton: addFooterButton,
  };
}
