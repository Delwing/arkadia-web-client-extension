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
 * The graceful extinguish relies on the `animationiteration` event, which the
 * browser throttles (and may never deliver) while the tab is backgrounded. So
 * when the document is hidden we freeze the wisps outright, and we reconcile
 * the smoke whenever the tab becomes visible again — otherwise a pipe that
 * burns out in a background tab would keep smoking until you switch back.
 *
 * Lit/unlit is driven by the game via the `pipeLit` client event (see
 * src/client/scripts/pipe.ts).
 */

import mudClient from "./MudClient.ts";
import eventBus from "@modules/core/eventBus";

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

// The latest lit/unlit state the game asked for, so a visibility change can
// reconcile the smoke (the `animationiteration` listeners may never have fired
// while the tab was hidden).
let pipeLit = false;

function freezeSmoke(el: HTMLElement): void {
  // Drop the animation entirely so each wisp falls back to its base opacity: 0
  // (fully hidden) regardless of where in the rise it currently is. Used when
  // we can't rely on `animationiteration` to land the wisps gracefully.
  extinguishSignal?.abort();
  extinguishSignal = null;
  for (const wisp of getWisps(el)) {
    wisp.style.animation = "none";
  }
}

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
  if (document.hidden) {
    // No reliable `animationiteration` while hidden — freeze now (it's not
    // visible anyway) so the pipe doesn't keep smoking in the background.
    freezeSmoke(el);
    return;
  }
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
  pipeLit = lit;
  el.classList.toggle(LIT_CLASS, lit); // ember fades up / down via CSS
  el.title = lit ? "Zgas fajke" : "Zapal fajke";
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
  pipeLit = el.classList.contains(LIT_CLASS);
  // If the pipe burned out while the tab was hidden, the `animationiteration`
  // listeners never fired, so the wisps could still be mid-rise. Reconcile when
  // the tab comes back into view.
  document.addEventListener("visibilitychange", () => {
    if (document.hidden || pipeLit) return;
    freezeSmoke(el);
  });
  // The CSS starts the wisps running; if the pipe loads unlit, halt them.
  if (!el.classList.contains(LIT_CLASS)) {
    for (const wisp of getWisps(el)) {
      wisp.style.animationPlayState = "paused";
    }
  }
  // Click to toggle: light it (/zapal fills + lights) when unlit, put it out
  // (zgas fajke) when lit.
  el.style.cursor = "pointer";
  el.title = isPipeLit() ? "Zgas fajke" : "Zapal fajke";
  el.addEventListener("click", () => {
    const command = isPipeLit() ? "zgas fajke" : "/zapal";
    eventBus.emit("sendCommand", { command });
  });
}
