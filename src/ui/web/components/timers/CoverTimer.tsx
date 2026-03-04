import { useState, useEffect } from "react";
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

  const isActive = seconds != null && seconds > 0;

  useEffect(() => {
    const container = document.getElementById("cover-timer");
    if (!container) return;
    container.className = isActive ? "yellow" : "green";
  }, [isActive]);

  return (
    <>
      <span style={{ color: "white" }}>Zas: </span>
      <span>{isActive ? seconds.toFixed(2) : "OK"}</span>
    </>
  );
};

export default CoverTimer;
