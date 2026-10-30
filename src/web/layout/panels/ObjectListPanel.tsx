import { useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ObjectListTimersBar } from '../components/ObjectListTimersBar';
import { PANEL_SLOT, useHostSlot, type MovableHost } from '../movableHost';

interface ObjectListPanelProps {
  /** The list ObjectList fills (#objects-list or #objects-list-others); held here while mounted. */
  host: MovableHost;
  /** The weapon / cover / order timers bar; only Kondycje carries it. */
  withTimers?: boolean;
}

export function ObjectListPanel({ host, withTimers = true }: ObjectListPanelProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [timersHost, setTimersHost] = useState<HTMLDivElement | null>(null);

  useHostSlot(host, containerRef, PANEL_SLOT);

  // Docked, the list fills the panel instead of floating where its default spot puts it.
  useLayoutEffect(() => {
    const list = host.element;
    const original = {
      position: list.style.position,
      left: list.style.left,
      top: list.style.top,
      right: list.style.right,
      bottom: list.style.bottom,
      display: list.style.display,
    };

    // A host element for the timers bar inside the list, so it inherits the
    // user's font-size and font-family settings.
    const timers = document.createElement('div');
    const contentEl = list.querySelector('.objects-list-content');
    if (contentEl) {
      list.insertBefore(timers, contentEl);
    } else {
      list.prepend(timers);
    }
    setTimersHost(timers);

    list.style.position = 'relative';
    list.style.left = '';
    list.style.top = '';
    list.style.right = '';
    list.style.bottom = '';
    list.style.display = 'block';
    list.style.width = '100%';
    list.style.height = '100%';

    return () => {
      timers.remove();
      setTimersHost(null);
      Object.assign(list.style, original);
      list.style.width = '';
      list.style.height = '';
    };
  }, [host]);

  return (
    <>
      {withTimers && timersHost && createPortal(<ObjectListTimersBar />, timersHost)}
      <div ref={containerRef} className="object-list-panel-container" />
    </>
  );
}
