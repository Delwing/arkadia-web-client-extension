/**
 * Portal container for plugin popups.
 * This container is mounted inside the LayoutProvider so that
 * plugin popups can access the LayoutContext for docking support.
 */

let portalContainer: HTMLElement | null = null;
const listeners = new Set<() => void>();

/**
 * Set the portal container element.
 * Called by LayoutManagerWrapper when it mounts.
 */
export function setPopupPortalContainer(container: HTMLElement | null): void {
  portalContainer = container;
  // Notify listeners that the portal is ready
  listeners.forEach(listener => listener());
}

/**
 * Get the portal container element.
 * Returns the container inside LayoutProvider, or document.body as fallback.
 */
export function getPopupPortalContainer(): HTMLElement {
  return portalContainer ?? document.body;
}

/**
 * Check if the portal container is available (inside LayoutProvider).
 */
export function isPopupPortalReady(): boolean {
  return portalContainer !== null;
}

/**
 * Wait for the portal container to be ready.
 * Resolves immediately if already ready, otherwise waits.
 */
export function waitForPopupPortal(): Promise<HTMLElement> {
  if (portalContainer) {
    return Promise.resolve(portalContainer);
  }

  return new Promise((resolve) => {
    const listener = () => {
      if (portalContainer) {
        listeners.delete(listener);
        resolve(portalContainer);
      }
    };
    listeners.add(listener);
  });
}
