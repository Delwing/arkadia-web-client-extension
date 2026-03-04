import { useState, useEffect } from "react";
import { useClientEvent } from "../../hooks";

/**
 * OrderTimer component - displays order timer status
 * Shows "Rozkaz: OK" (green) when no timer, or "Rozkaz: X.XX" (yellow) when counting down
 * Only visible when character is team leader
 */
export const OrderTimer: React.FC = () => {
  const [seconds, setSeconds] = useState<number | null>(null);
  const [isLeader, setIsLeader] = useState(false);

  useClientEvent<boolean>("isTeamLeader", (flag) => {
    setIsLeader(Boolean(flag));
  });

  useClientEvent<number | null>("orderTimer", (newSeconds) => {
    setSeconds(newSeconds);
  });

  const isActive = seconds != null && seconds > 0;

  useEffect(() => {
    const container = document.getElementById("order-timer");
    if (!container) return;

    if (!isLeader) {
      container.className = "";
      container.style.display = "none";
      return;
    }

    container.style.display = "";
    container.className = isActive ? "yellow" : "green";
  }, [isLeader, isActive]);

  if (!isLeader) {
    return null;
  }

  return (
    <>
      <span style={{ color: "white" }}>Rozkaz: </span>
      <span>{isActive ? seconds.toFixed(2) : "OK"}</span>
    </>
  );
};

export default OrderTimer;
