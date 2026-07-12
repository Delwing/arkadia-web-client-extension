import { createRoot, type Root } from "react-dom/client";
import {
  LampTimer,
  ZaskTimer,
  OrderTimer,
  CombatTimer,
  TransportTimer,
  WorldDestructionTimer,
  CharStateInfo,
  ReleaseGuardTimer,
  BreakItemWarning,
  CharState,
  AttackMode,
  PackageStatus,
  ClockDisplay,
  MailStatus,
  WeaponState,
  TeamPanel,
  PlaybackControls
} from "./components";
import { ContextMenuHost } from "@web/contextMenu";
import MultiBindStrip from "./footer/MultiBindStrip";
import PluginFooterItems from "./footer/PluginFooterItems";

type MountResult = {
  destroy: () => void;
};

/**
 * Mounts all migrated React components into their respective DOM containers
 * Returns a destroy function to unmount all components
 */
export const mountMigratedComponents = (): MountResult => {
  const roots: Root[] = [];

  const componentConfigs = [
    { id: "package-status", Component: PackageStatus },
    { id: "attack-mode", Component: AttackMode },
    { id: "clock-display", Component: ClockDisplay },
    { id: "lamp-timer", Component: LampTimer },
    { id: "release-guard-timer", Component: ReleaseGuardTimer },
    { id: "zask-timer", Component: ZaskTimer },
    { id: "order-timer", Component: OrderTimer },
    { id: "combat-timer", Component: CombatTimer },
    { id: "transport-timer", Component: TransportTimer },
    { id: "world-destruction-timer", Component: WorldDestructionTimer },
    { id: "state-info", Component: CharStateInfo },
    { id: "break-item-warning", Component: BreakItemWarning },
    { id: "mail-status", Component: MailStatus },
    { id: "weapon-state", Component: WeaponState },
    { id: "team-panel", Component: TeamPanel },
  ];

  componentConfigs.forEach(({ id, Component }) => {
    const container = document.getElementById(id);
    if (container) {
      const root = createRoot(container);
      root.render(<Component />);
      roots.push(root);
    } else {
      console.warn(`Container #${id} not found, skipping mount for ${Component.name}`);
    }
  });

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

  // Plugin (and other dynamically-registered) footer items render from the
  // common footerRegistry into the stock footer's #plugin-footer-components slot.
  const pluginFooterContainer = document.getElementById("plugin-footer-components");
  if (pluginFooterContainer) {
    const root = createRoot(pluginFooterContainer);
    root.render(<PluginFooterItems />);
    roots.push(root);
  }

  // CharState is special - it uses portals to render to #char-state-text and #char-state-bars
  // We mount it to a hidden container so it can manage its own rendering
  const charStateContainer = document.createElement("div");
  charStateContainer.style.display = "none";
  document.body.appendChild(charStateContainer);
  const charStateRoot = createRoot(charStateContainer);
  charStateRoot.render(<CharState />);
  roots.push(charStateRoot);

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
      if (charStateContainer.parentNode) {
        charStateContainer.parentNode.removeChild(charStateContainer);
      }
      if (playbackControlsContainer.parentNode) {
        playbackControlsContainer.parentNode.removeChild(playbackControlsContainer);
      }
      if (contextMenuContainer.parentNode) {
        contextMenuContainer.parentNode.removeChild(contextMenuContainer);
      }
    },
  };
};
