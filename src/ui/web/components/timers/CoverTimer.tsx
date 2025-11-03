import { useState } from "react";
import { useClientEvent } from "../../hooks";

/**
 * CoverTimer component - displays cover timer status
 * Shows "Zas: OK" (green) when no timer, or "Zas: X.XX" (yellow) when counting down
 */
export const CoverTimer: React.FC = () => {
  const [seconds, setSeconds] = useState<number | null>(null);

  useClientEvent<number | null>("coverTimer", (newSeconds) => {
    setSeconds(newSeconds);
  });

  // Determine display text and class
  const isActive = seconds != null && seconds > 0;
  const text = isActive ? `Zas: ${seconds.toFixed(2)}` : "Zas: OK";
  const className = isActive ? "yellow" : "green";

  return (
    <span className={className}>
      {text}
    </span>
  );
};

export default CoverTimer;
