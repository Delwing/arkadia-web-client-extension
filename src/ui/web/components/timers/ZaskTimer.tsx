import { useState } from "react";
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

  // Hide if no payload
  if (!payload) {
    return null;
  }

  // Determine display text and class
  if (payload.ok) {
    return (
      <span className="green">
        Zask: OK
      </span>
    );
  }

  const className = payload.seconds >= 20 ? "yellow" : "red";

  return (
    <span className={className}>
      Zask: {payload.seconds}
    </span>
  );
};

export default ZaskTimer;
