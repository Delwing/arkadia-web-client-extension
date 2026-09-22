import { createRoot, type Root } from "react-dom/client";
import { flushSync } from "react-dom";
import { PlaybackControls } from "./components";
import { ContextMenuHost } from "@web/contextMenu";
import MultiBindStrip from "./footer/MultiBindStrip";
import StatusLine from "./footer/StatusLine";
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

  // The status line: vitals, then the chips from the common footer registry (the
  // built-ins registered here, plugin items as they come). Rendered synchronously:
  // setupMobileFooter wires its expander button right after this returns.
  registerBuiltinFooterItems();
  const statusContainer = document.getElementById("char-state");
  if (statusContainer) {
    const root = createRoot(statusContainer);
    flushSync(() => root.render(<StatusLine />));
    roots.push(root);
  }

  // MultiBinds is special: it mounts into the persistent #multi-binds container
  // (kept by index.html so main.ts's cached reference + split-view MutationObserver
  // stay valid) and toggles that container's `active` class via onActiveChange —
  // the same DOM contract the stock CSS, the split-view hook and e2e expect.
  const multiBindsContainer = document.getElementById("multi-binds");
  if (multiBindsContainer) {
    const root = createRoot(multiBindsContainer);
    root.render(
      <MultiBindStrip
        onActiveChange={(active) => multiBindsContainer.classList.toggle("active", active)}
      />
    );
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
