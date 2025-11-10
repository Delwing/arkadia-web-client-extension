import { createRoot, type Root } from "react-dom/client";
import {
  LampTimer,
  CoverTimer,
  ZaskTimer,
  OrderTimer,
  CombatTimer,
  TransportTimer,
  CharStateInfo,
  ReleaseGuard,
  BreakItemWarning,
  MultiBinds,
  CharState,
  AttackMode,
  PackageStatus,
  ClockDisplay
} from "./components";

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
    { id: "cover-timer", Component: CoverTimer },
    { id: "zask-timer", Component: ZaskTimer },
    { id: "order-timer", Component: OrderTimer },
    { id: "combat-timer", Component: CombatTimer },
    { id: "transport-timer", Component: TransportTimer },
    { id: "state-info", Component: CharStateInfo },
    { id: "release-guard", Component: ReleaseGuard },
    { id: "break-item-warning", Component: BreakItemWarning },
    { id: "multi-binds", Component: MultiBinds },
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

  // CharState is special - it uses portals to render to #char-state-text and #char-state-bars
  // We mount it to a hidden container so it can manage its own rendering
  const charStateContainer = document.createElement("div");
  charStateContainer.style.display = "none";
  document.body.appendChild(charStateContainer);
  const charStateRoot = createRoot(charStateContainer);
  charStateRoot.render(<CharState />);
  roots.push(charStateRoot);

  return {
    destroy: () => {
      roots.forEach((root) => root.unmount());
      if (charStateContainer.parentNode) {
        charStateContainer.parentNode.removeChild(charStateContainer);
      }
    },
  };
};
