import {useEffect, useState} from "react";
import {useClientEvent} from "../../hooks";
import eventBus from "@modules/core/eventBus";

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
 * The component listens to the 'multibinds' client event which includes
 * user-created multibinds as well as room binds and drinkable binds.
 */
export const MultiBinds: React.FC = () => {
  const [binds, setBinds] = useState<DisplayMultibind[]>([]);

  // Listen to client event for multibinds updates (includes room binds and drinkable binds)
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
