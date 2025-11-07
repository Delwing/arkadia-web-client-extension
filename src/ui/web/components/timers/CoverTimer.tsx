import { useState, useEffect, useRef } from "react";
import { useClientEvent } from "../../hooks";

/**
 * CoverTimer component - displays cover timer status
 * Shows "Zas: OK" (green) when no timer, or "Zas: X.XX" (yellow) when counting down
 *
 * Note: This component manipulates the container element directly to match
 * the behavior of the old class-based implementation.
 */
export const CoverTimer: React.FC = () => {
  const [seconds, setSeconds] = useState<number | null>(null);
  const containerRef = useRef<HTMLElement | null>(null);

  useClientEvent<number | null>("coverTimer", (newSeconds) => {
    setSeconds(newSeconds);
  });

  // Get reference to the container element
  useEffect(() => {
    containerRef.current = document.getElementById("cover-timer");
  }, []);

  // Update the container element's properties
  useEffect(() => {
    if (!containerRef.current) return;

    const isActive = seconds != null && seconds > 0;
    const text = isActive ? `Zas: ${seconds.toFixed(2)}` : "Zas: OK";
    const className = isActive ? "yellow" : "green";

    containerRef.current.textContent = text;
    containerRef.current.className = className;
    containerRef.current.style.display = "block";
  }, [seconds]);

  return null;
};

export default CoverTimer;
