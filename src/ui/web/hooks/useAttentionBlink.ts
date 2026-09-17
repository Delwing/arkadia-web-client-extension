import { useEffect, useState } from "react";

/**
 * Drives an attention-grabbing blink for something that stays on screen until
 * the player deals with it: blinks for `burstMs` as soon as `active` turns on,
 * then again for `burstMs` every `intervalMs` for as long as it stays on.
 *
 * Only the `active` edge (re)starts the schedule, so a component that keeps
 * receiving the same state (GMCP re-sends) does not restart the burst.
 */
export function useAttentionBlink(active: boolean, burstMs = 5000, intervalMs = 60000): boolean {
  const [blinking, setBlinking] = useState(false);

  useEffect(() => {
    if (!active) {
      setBlinking(false);
      return;
    }
    let stopTimer: ReturnType<typeof setTimeout> | undefined;
    const burst = () => {
      setBlinking(true);
      clearTimeout(stopTimer);
      stopTimer = setTimeout(() => setBlinking(false), burstMs);
    };
    burst();
    const repeat = setInterval(burst, intervalMs);
    return () => {
      clearTimeout(stopTimer);
      clearInterval(repeat);
    };
  }, [active, burstMs, intervalMs]);

  return blinking;
}
