import { createElement, useEffect, useRef, type ComponentType, type CSSProperties } from "react";
import "./pluginLabelIcon.css";

/**
 * A plugin's menu label often opens with its own icon. Menus lift that icon into
 * their icon column (drawn at the stock icons' size) instead of adding a puzzle
 * in front of it, so the entry lines up with the built-in ones.
 */

const OWN_ICON_SELECTOR = "svg, img, i, [class*='icon'], [class^='bi-'], [class*=' bi-'], [class*='fa-']";

/** An emoji or symbol (with its variation selector and joined parts) and the space after it. */
const LEADING_SYMBOL_RE = /^\s*([\p{Extended_Pictographic}\p{So}]️?(?:‍[\p{Extended_Pictographic}\p{So}]️?)*)\s*/u;

/** Drawn like a lucide icon, so menus can put it where they put theirs. */
export type OwnIconComponent = ComponentType<{ size?: number; strokeWidth?: number }>;

export interface OwnIcon {
  Icon: OwnIconComponent;
  /** The label without the icon. */
  rest: string | Node;
}

/**
 * A plugin label that opens with its own icon (an svg/img/icon-font element, or
 * an emoji/symbol), split into that icon and the rest of the label. Null when the
 * label has no leading icon. Works on a copy; the plugin keeps its node.
 */
export function splitOwnIcon(label: string | Node): OwnIcon | null {
  const split = splitLabel(label);
  return split ? { Icon: ownIconComponent(split.icon), rest: split.rest } : null;
}

function splitLabel(label: string | Node): { icon: string | Node; rest: string | Node } | null {
  if (typeof label === "string") {
    const m = LEADING_SYMBOL_RE.exec(label);
    return m ? { icon: m[1], rest: label.slice(m[0].length) } : null;
  }
  if (label instanceof Element && label.matches(OWN_ICON_SELECTOR)) {
    return { icon: label.cloneNode(true), rest: "" };
  }
  const copy = label.cloneNode(true);
  const found = copy instanceof Element || copy instanceof DocumentFragment ? copy.querySelector(OWN_ICON_SELECTOR) : null;
  if (found) {
    // Only an icon in front: one after the text is part of the label.
    const before = document.createRange();
    before.setStart(copy, 0);
    before.setEndBefore(found);
    if (before.toString().trim() === "") {
      // Drop the wrappers left empty too: they often carry the margin that spaced the icon.
      let empty: Node | null = found.parentNode;
      found.remove();
      while (empty && empty !== copy && empty instanceof Element && !empty.textContent?.trim() && !empty.querySelector("*")) {
        const parent: Node | null = empty.parentNode;
        empty.remove();
        empty = parent;
      }
      trimLeadingSpace(copy);
      return { icon: found, rest: copy };
    }
  }
  // A DOM label whose text opens with an emoji.
  const firstText = firstTextNode(copy);
  const m = firstText && LEADING_SYMBOL_RE.exec(firstText.data);
  if (firstText && m) {
    firstText.data = firstText.data.slice(m[0].length);
    return { icon: m[1], rest: copy };
  }
  return null;
}

function ownIconComponent(icon: string | Node): OwnIconComponent {
  return function OwnIconView({ size = 14 }) {
    const style = { "--own-icon-size": `${size}px` } as CSSProperties;
    return createElement("span", { className: "plugin-own-icon", style },
      typeof icon === "string" ? icon : createElement(NodeCopy, { node: icon }));
  };
}

function NodeCopy({ node }: { node: Node }) {
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    ref.current?.replaceChildren(node.cloneNode(true));
  }, [node]);
  return createElement("span", { ref });
}

function firstTextNode(node: Node): Text | null {
  const walker = document.createTreeWalker(node, NodeFilter.SHOW_TEXT, {
    acceptNode: (text) => (text.nodeValue?.trim() ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_SKIP),
  });
  return walker.nextNode() as Text | null;
}

function trimLeadingSpace(node: Node): void {
  const text = document.createTreeWalker(node, NodeFilter.SHOW_TEXT).nextNode() as Text | null;
  if (text) text.data = text.data.replace(/^\s+/, "");
}
