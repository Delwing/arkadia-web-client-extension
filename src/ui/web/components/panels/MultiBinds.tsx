import { useState, useEffect } from "react";
import { useClientEvent } from "../../hooks";
import eventBus from "@client/src/eventBus";
import { subscribe as subscribeMultibinds, type StoredMultibindRecord } from "../../../../../web-client/src/dataStores/multibindStore";
import { getMultibindLabel } from "@client/src/multibindKeys";
import { getClientInstance } from "@shared/runtime";

interface DisplayMultibind {
  index: number;
  action: string;
  label: string;
}

/**
 * MultiBinds component - displays grid of multi-bind action buttons
 * Shows list of bindable actions with labels, sends commands on click
 *
 * Note: This component manages the "active" class on its container (#multi-binds)
 * directly via DOM manipulation to match the CSS expectations.
 *
 * This component subscribes directly to the multibindStore to get initial state,
 * ensuring binds are shown even if the component mounts after the initial load.
 */
export const MultiBinds: React.FC = () => {
  const [binds, setBinds] = useState<DisplayMultibind[]>([]);

  // Subscribe to store for initial state and updates
  useEffect(() => {
    const unsubscribe = subscribeMultibinds((stored: StoredMultibindRecord[]) => {
      const client = getClientInstance();
      const currentRoomId = client?.Map?.currentRoom?.id;

      if (typeof currentRoomId !== 'number') {
        setBinds([]);
        return;
      }

      // Filter and convert to display format
      const display = stored
        .filter(record => record.roomId === currentRoomId)
        .map(({ index, action }) => ({
          index,
          action,
          label: getMultibindLabel(index),
        }))
        .sort((a, b) => a.index - b.index);

      setBinds(display);
    });

    return unsubscribe;
  }, []);

  // Also listen to client event for room changes
  useClientEvent<{ list?: DisplayMultibind[] }>("multibinds", (payload) => {
    const list = Array.isArray(payload?.list) ? payload.list : [];
    setBinds(list);
  });

  // Manage the "active" class on the container element
  useEffect(() => {
    const container = document.getElementById("multi-binds");
    if (container) {
      if (binds.length > 0) {
        container.classList.add("active");
      } else {
        container.classList.remove("active");
      }
    }
  }, [binds.length]);

  const handleBindClick = (action: string) => (event: React.MouseEvent) => {
    event.preventDefault();
    if (action.trim()) {
      eventBus.emit("sendCommand", { command: action });
    }
  };

  // Return buttons directly without wrapper div
  return (
    <>
      {binds
        .slice()
        .sort((a, b) => a.index - b.index)
        .map((bind) => (
          <button
            key={bind.index}
            type="button"
            className="multi-bind"
            title={bind.action}
            onClick={handleBindClick(bind.action)}
            disabled={!bind.action.trim()}
          >
            <span className="multi-bind-key">[{bind.label}]</span>
            <span className="multi-bind-action">{bind.action}</span>
          </button>
        ))}
    </>
  );
};

export default MultiBinds;
