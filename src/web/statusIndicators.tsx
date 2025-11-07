/**
 * Legacy compatibility wrapper for statusIndicators
 * This file exists for backward compatibility with existing tests
 * The actual components have been migrated to src/ui/web/components/
 */

import { createRoot, type Root } from "react-dom/client";
import { AttackMode } from "@web-ui/components/panels/AttackMode";
import { PackageStatus } from "@web-ui/components/panels/PackageStatus";

type MountResult = {
  destroy: () => void;
};

/**
 * Mounts status indicator components (AttackMode and PackageStatus)
 * @returns Object with destroy function to unmount components
 */
export default function mountStatusIndicators(): MountResult {
  const roots: Root[] = [];

  // Mount AttackMode
  let attackModeContainer = document.getElementById("attack-mode");
  if (!attackModeContainer) {
    attackModeContainer = document.createElement("span");
    attackModeContainer.id = "attack-mode";
    const parent = document.getElementById("status-indicators") || document.body;
    parent.appendChild(attackModeContainer);
  }
  const attackModeRoot = createRoot(attackModeContainer);
  attackModeRoot.render(<AttackMode />);
  roots.push(attackModeRoot);

  // Mount PackageStatus
  let packageStatusContainer = document.getElementById("package-status");
  if (!packageStatusContainer) {
    packageStatusContainer = document.createElement("span");
    packageStatusContainer.id = "package-status";
    const parent = document.getElementById("status-indicators") || document.body;
    parent.appendChild(packageStatusContainer);
  }
  const packageStatusRoot = createRoot(packageStatusContainer);
  packageStatusRoot.render(<PackageStatus />);
  roots.push(packageStatusRoot);

  return {
    destroy: () => {
      roots.forEach((root) => root.unmount());
    },
  };
}
