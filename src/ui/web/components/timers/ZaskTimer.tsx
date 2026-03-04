import { useState, useEffect } from "react";
import { useClientEvent } from "../../hooks";

interface ZaskTimerPayload {
  seconds: number;
  ok: boolean;
}

/**
 * ZaskTimer component - displays zask timer status
 * Shows "Zask: OK" (green) when ok, or "Zask: X" with color based on seconds
 * Color: yellow (>=20s), red (<20s)
 */
export const ZaskTimer: React.FC = () => {
  const [payload, setPayload] = useState<ZaskTimerPayload | null>(null);

  useClientEvent<ZaskTimerPayload | null>("zaskTimer", (newPayload) => {
    setPayload(newPayload);
  });

  useEffect(() => {
    const container = document.getElementById("zask-timer");
    if (!container) return;

    if (!payload) {
      container.className = "";
      return;
    }

    if (payload.ok) {
      container.className = "green";
    } else {
      container.className = payload.seconds >= 20 ? "yellow" : "red";
    }
  }, [payload]);

  if (!payload) {
    return null;
  }

  return (
    <>
      <span style={{ color: "white" }}>Zask: </span>
      <span>{payload.ok ? "OK" : payload.seconds}</span>
    </>
  );
};

export default ZaskTimer;
