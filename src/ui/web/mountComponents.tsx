import { createRoot, type Root } from "react-dom/client";
import { flushSync } from "react-dom";
import { PlaybackControls } from "./components";
import { ContextMenuHost } from "@web/contextMenu";
import StockFooter from "./footer/layout/StockFooter";
import { registerBuiltinFooterItems } from "./footer/builtinItems";

type MountResult = {
  destroy: () => void;
};

/**
 * Mounts all migrated React components into their respective DOM containers
 * Returns a destroy function to unmount all components
 */
export const mountMigratedComponents = (): MountResult => {
  const roots: Root[] = [];

  // The footer: the location binds and the status line (vitals, then the chips
  // from the common footer registry - the built-ins registered here, plugin items
  // as they come), as the footer layout arranges them. Rendered synchronously:
  // setupMobileFooter wires the status line's expander right after this returns.
  registerBuiltinFooterItems();
  const footerContainer = document.getElementById("footer-layout");
  if (footerContainer) {
    const root = createRoot(footerContainer);
    flushSync(() => root.render(<StockFooter />));
    roots.push(root);
  }

  // PlaybackControls uses a portal to render directly to document.body
  const playbackControlsContainer = document.createElement("div");
  playbackControlsContainer.style.display = "none";
  document.body.appendChild(playbackControlsContainer);
  const playbackControlsRoot = createRoot(playbackControlsContainer);
  playbackControlsRoot.render(<PlaybackControls />);
  roots.push(playbackControlsRoot);

  // ContextMenuHost portals its menu directly to document.body
  const contextMenuContainer = document.createElement("div");
  contextMenuContainer.style.display = "none";
  document.body.appendChild(contextMenuContainer);
  const contextMenuRoot = createRoot(contextMenuContainer);
  contextMenuRoot.render(<ContextMenuHost />);
  roots.push(contextMenuRoot);

  return {
    destroy: () => {
      roots.forEach((root) => root.unmount());
      if (playbackControlsContainer.parentNode) {
        playbackControlsContainer.parentNode.removeChild(playbackControlsContainer);
      }
      if (contextMenuContainer.parentNode) {
        contextMenuContainer.parentNode.removeChild(contextMenuContainer);
      }
    },
  };
};
