import { useState } from "react";
import { useClientEvent } from "../../hooks";
import eventBus from "@modules/core/eventBus";

/**
 * ReleaseGuard component - toggle button for release guard state
 * Shows "Pusc zas: on/off" and toggles state on click
 */
export const ReleaseGuard: React.FC = () => {
  const [state, setState] = useState(true);

  useClientEvent<boolean>("releaseGuard", (newState) => {
    setState(newState);
  });

  const handleClick = () => {
    eventBus.emit("releaseGuard", !state);
  };

  const className = state ? "on" : "off";
  const text = `Pusc zas: ${state ? "on" : "off"}`;

  return (
    <span className={className} onClick={handleClick}>
      {text}
    </span>
  );
};

export default ReleaseGuard;
