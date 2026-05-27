/**
 * Pipe-smoking footer indicator.
 *
 * The ember lights up / dims via a CSS opacity cross-fade on the `--lit` class.
 * The smoke is treated as an emitter so the transitions feel natural:
 *  - lighting   -> restart the wisps so the stream emits from the bowl and
 *                  builds up (staggered by the CSS delays);
 *  - extinguish -> stop spawning new wisps and let the in-flight ones finish
 *                  their current rise, then freeze them at the bowl (where they
 *                  are already faded to nothing) so they die out naturally
 *                  instead of all cutting out at once.
 *
 * Lit/unlit is driven by the game via the `pipeLit` client event (see
 * src/client/scripts/pipe.ts).
 */

import mudClient from "./MudClient.ts";

const LIT_CLASS = "pipe-icon--lit";

function getElement(): HTMLElement | null {
  return document.getElementById("pipe-status");
}

function getWisps(el: HTMLElement): HTMLElement[] {
  return Array.from(el.querySelectorAll<HTMLElement>(".pipe-smoke i"));
}

// Tracks the pending "finish this cycle then pause" listeners so that a
// re-light can cancel them before they fire.
let extinguishSignal: AbortController | null = null;

function startSmoke(el: HTMLElement): void {
  extinguishSignal?.abort();
  extinguishSignal = null;
  for (const wisp of getWisps(el)) {
    // Restart the rise animation from the beginning. With the per-wisp CSS
    // delays this makes the stream emit from the bowl and build up over one
    // cycle rather than appearing all at once.
    wisp.style.animation = "none";
    void wisp.offsetWidth; // force reflow so re-applying the animation restarts it
    wisp.style.animation = "";
    wisp.style.animationPlayState = "";
  }
}

function stopSmoke(el: HTMLElement): void {
  extinguishSignal?.abort();
  const controller = new AbortController();
  extinguishSignal = controller;
  for (const wisp of getWisps(el)) {
    // Let the wisp complete its current rise, then freeze it at the cycle
    // boundary (back at the bowl, already faded to opacity 0) so no new wisp
    // appears.
    wisp.addEventListener(
      "animationiteration",
      () => {
        wisp.style.animationPlayState = "paused";
      },
      { once: true, signal: controller.signal }
    );
  }
}

/** Set the pipe lit/unlit state (the future trigger entry point). */
export function setPipeLit(lit: boolean): void {
  const el = getElement();
  if (!el) return;
  el.classList.toggle(LIT_CLASS, lit); // ember fades up / down via CSS
  if (lit) {
    startSmoke(el);
  } else {
    stopSmoke(el);
  }
}

/** Whether the pipe is currently lit. */
export function isPipeLit(): boolean {
  return getElement()?.classList.contains(LIT_CLASS) ?? false;
}

/** Subscribe the footer pipe icon to the game's lit/unlit state. */
export default function initPipeStatus(): void {
  const el = getElement();
  if (!el) return;
  // Driven by the game: lit when the pipe is puffed, unlit when it burns out.
  mudClient.on("pipeLit", (lit) => setPipeLit(lit));
  // The CSS starts the wisps running; if the pipe loads unlit, halt them.
  if (!el.classList.contains(LIT_CLASS)) {
    for (const wisp of getWisps(el)) {
      wisp.style.animationPlayState = "paused";
    }
  }
}
