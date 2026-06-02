import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { WindowRecord } from '../types';
import type { WindowManager } from '../WindowManager';
import { usePanelChrome } from './PanelHeader';
import {
  registerPopoutWindow,
  unregisterPopoutWindow,
} from '@shared/dom/popoutWindows.ts';

interface PopoutWindowLayerProps {
  windows: WindowRecord[];
  manager: WindowManager;
}

/** Path to the dedicated popout entry (popup/index.html). Opened relative to
 *  the current document so it works under any deploy base. */
const POPOUT_ENTRY = 'popup/index.html';

/**
 * Renders each popped-out window into its own browser window. The popup's
 * React subtree is NOT re-created — it lives in the WindowManager's persistent
 * portal-target div (the same one the in-app shells move between dock slots),
 * which we physically relocate into the external window's document. Closing
 * the external window (via its close button or the OS chrome) rescues that div
 * back into the opener and clears the poppedOut flag, so the panel re-renders
 * exactly where it was — floating, docked, tabbed, or split.
 *
 * The external window navigates to a real same-origin entry (popup/index.html)
 * so it loads the full app stylesheet bundle natively; we only mirror the
 * opener's theme classes (which select the active theme) onto it.
 */
export function PopoutWindowLayer({ windows, manager }: PopoutWindowLayerProps) {
  return (
    <>
      {windows.map(w => (
        <PopoutWindow key={w.id} window={w} manager={manager} />
      ))}
    </>
  );
}

/** Move a window's portal target back into the opener document so it survives
 *  the external window being torn down. No-op if it's already home. */
function rescuePortalTarget(manager: WindowManager, id: string): void {
  const target = manager.getPortalTarget(id);
  if (target && target.ownerDocument !== document) {
    document.body.appendChild(target);
  }
}

/** Mirror the opener's theme onto the popout document. The active theme is
 *  selected by a class on <html>/<body> (plus a few data-* attributes); the
 *  CSS itself is loaded by the popout entry. */
function applyPopoutChrome(ext: Window, title: string): void {
  const doc = ext.document;
  doc.title = title ? `${title} — Arkadia` : 'Arkadia';
  doc.documentElement.className = document.documentElement.className;
  // Preserve the entry's own body classes (e.g. nothing important) but add the
  // opener's theme/layout classes so CSS variables resolve.
  doc.body.className = document.body.className;
  for (const attr of Array.from(document.body.attributes)) {
    if (attr.name.startsWith('data-')) {
      doc.body.setAttribute(attr.name, attr.value);
    }
  }
}

function PopoutWindow({
  window: w,
  manager,
}: {
  window: WindowRecord;
  manager: WindowManager;
}) {
  const id = w.id;
  const [mountNode, setMountNode] = useState<HTMLElement | null>(null);

  // Open the external window exactly once for this popout. Geometry is read
  // from the window record's current floating size (or sensible defaults).
  useEffect(() => {
    const width = Math.max(240, Math.round(w.width || 420));
    const height = Math.max(160, Math.round(w.height || 480));
    const left = window.screenX + Math.max(0, Math.round((window.outerWidth - width) / 2));
    const top = window.screenY + Math.max(0, Math.round((window.outerHeight - height) / 3));
    const features = `popup=yes,width=${width},height=${height},left=${left},top=${top}`;

    const ext = window.open(POPOUT_ENTRY, `arkadia-popout-${id}`, features);
    if (!ext) {
      // Popup blocked — fall back to the in-app shell.
      manager.setPoppedOut(id, false);
      return;
    }
    // Make this window discoverable to focus-sensitive helpers (clipboard).
    registerPopoutWindow(ext);

    let cancelled = false;
    let pollTimer = 0;

    // The external window is going away (OS close, refresh, etc.). Rescue the
    // live portal target before its document dies, then restore the panel.
    const handleUnload = () => {
      rescuePortalTarget(manager, id);
      manager.setPoppedOut(id, false);
    };
    // If the opener navigates away while a popout is open, close the popout.
    const closeOnOpenerUnload = () => ext.close();

    const onReady = () => {
      applyPopoutChrome(ext, w.title);
      ext.addEventListener('pagehide', handleUnload);
      window.addEventListener('pagehide', closeOnOpenerUnload);
      setMountNode(ext.document.getElementById('popout-root'));
    };

    // The window navigates to the entry asynchronously — wait until its
    // #popout-root exists and parsing has progressed before portaling in.
    const waitForRoot = () => {
      if (cancelled || ext.closed) return;
      const root = ext.document.getElementById('popout-root');
      if (root && ext.document.readyState !== 'loading') {
        onReady();
      } else {
        pollTimer = window.setTimeout(waitForRoot, 30);
      }
    };
    waitForRoot();

    return () => {
      cancelled = true;
      if (pollTimer) window.clearTimeout(pollTimer);
      ext.removeEventListener('pagehide', handleUnload);
      window.removeEventListener('pagehide', closeOnOpenerUnload);
      unregisterPopoutWindow(ext);
      rescuePortalTarget(manager, id);
      ext.close();
    };
    // Open once: w.title/size are only read for the initial window.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, manager]);

  if (!mountNode) return null;
  return createPortal(<PopoutFrame window={w} manager={manager} />, mountNode);
}

function PopoutFrame({
  window: w,
  manager,
}: {
  window: WindowRecord;
  manager: WindowManager;
}) {
  const chrome = usePanelChrome(w);
  const contentRef = useRef<HTMLDivElement>(null);

  // Attach the window's persistent portal-target div into our content slot —
  // the same contract the in-app shells follow, except this slot lives in the
  // external document.
  useLayoutEffect(() => {
    const slot = contentRef.current;
    const target = manager.getPortalTarget(w.id);
    if (!slot || !target) return;
    slot.appendChild(target);
    return () => {
      if (target.parentNode === slot) slot.removeChild(target);
    };
  }, [manager, w.id]);

  const handleRestore = () => {
    rescuePortalTarget(manager, w.id);
    manager.setPoppedOut(w.id, false);
  };

  // Reuse the docked-popup chrome classes — they already constrain the header
  // height and the action buttons (e.g. the map header menu) to a compact size.
  const frameClass = [
    'managed-panel',
    'popout-frame',
    'docked-panel--popup',
    chrome.panelClassName ?? '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div className={frameClass} data-panel-id={w.id}>
      <div className="managed-panel__header docked-panel__header popout-frame__header">
        <span className="managed-panel__title docked-panel__title popout-frame__title">
          {chrome.title}
        </span>
        <div className="managed-panel__header-actions docked-panel__header-actions">
          {chrome.headerActions}
          <button
            type="button"
            className="panel-button panel-button--popout-restore"
            onClick={handleRestore}
            title="Przywroc do okna glownego"
          />
        </div>
      </div>
      <div
        className="managed-panel__content docked-panel__content popout-frame__content"
        ref={contentRef}
      />
    </div>
  );
}

export default PopoutWindowLayer;
