import { useState, useEffect, useRef } from "react";
import { useClientEvent } from "../../hooks";

/**
 * OrderTimer component - displays order timer status
 * Shows "Rozkaz: OK" (green) when no timer, or "Rozkaz: X.XX" (yellow) when counting down
 * Only visible when character is team leader
 *
 * Note: This component manipulates the container element directly to match
 * the behavior of the old class-based implementation.
 */
export const OrderTimer: React.FC = () => {
  const [seconds, setSeconds] = useState<number | null>(null);
  const [isLeader, setIsLeader] = useState(false);
  const containerRef = useRef<HTMLElement | null>(null);

  useClientEvent<boolean>("isTeamLeader", (flag) => {
    setIsLeader(Boolean(flag));
  });

  useClientEvent<number | null>("orderTimer", (newSeconds) => {
    setSeconds(newSeconds);
  });

  // Get reference to the container element
  useEffect(() => {
    containerRef.current = document.getElementById("order-timer");
  }, []);

  // Update the container element's properties
  useEffect(() => {
    if (!containerRef.current) return;

    // Hide if not team leader
    if (!isLeader) {
      containerRef.current.style.display = "none";
      return;
    }

    const isActive = seconds != null && seconds > 0;

    if (isActive) {
      containerRef.current.innerHTML = `<span style="color: white;">Rozkaz: </span><span style="color: yellow;">${seconds.toFixed(2)}</span>`;
    } else {
      containerRef.current.innerHTML = `<span style="color: white;">Rozkaz: </span><span style="color: springgreen;">OK</span>`;
    }

    containerRef.current.style.display = "block";
  }, [seconds, isLeader]);

  return null;
};

export default OrderTimer;
