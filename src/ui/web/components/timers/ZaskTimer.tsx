import { useState, useEffect, useRef } from "react";
import { useClientEvent } from "../../hooks";

interface ZaskTimerPayload {
  seconds: number;
  ok: boolean;
}

/**
 * ZaskTimer component - displays zask timer status
 * Shows "Zask: OK" (green) when ok, or "Zask: X" with color based on seconds
 * Color: yellow (>=20s), red (<20s)
 *
 * Note: This component manipulates the container element directly to match
 * the behavior of the old class-based implementation.
 */
export const ZaskTimer: React.FC = () => {
  const [payload, setPayload] = useState<ZaskTimerPayload | null>(null);
  const containerRef = useRef<HTMLElement | null>(null);

  useClientEvent<ZaskTimerPayload | null>("zaskTimer", (newPayload) => {
    setPayload(newPayload);
  });

  // Get reference to the container element
  useEffect(() => {
    containerRef.current = document.getElementById("zask-timer");
  }, []);

  // Update the container element's properties
  useEffect(() => {
    if (!containerRef.current) return;

    if (!payload) {
      containerRef.current.textContent = "";
      containerRef.current.className = "";
      containerRef.current.style.display = "none";
      return;
    }

    containerRef.current.style.display = "block";
    if (payload.ok) {
      containerRef.current.textContent = "Zask: OK";
      containerRef.current.className = "green";
    } else {
      containerRef.current.textContent = `Zask: ${payload.seconds}`;
      if (payload.seconds >= 20) {
        containerRef.current.className = "yellow";
      } else {
        containerRef.current.className = "red";
      }
    }
  }, [payload]);

  return null;
};

export default ZaskTimer;
