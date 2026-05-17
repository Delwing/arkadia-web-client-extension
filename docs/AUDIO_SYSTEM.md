# Audio System

Dev-facing notes on `src/client/SoundManager.ts`. Read this before changing how sounds play — the design is shaped by browser autoplay constraints that aren't obvious from the code alone.

## Goals

- Trigger sounds fire reliably in **foreground** tabs (no "first play silent" pattern).
- Trigger sounds fire reliably in **background** tabs (so users get audible alerts while in another tab).
- UI preview buttons (Manage Sounds, sound-category selectors) reuse the same primed elements as in-game triggers.
- Single dependency-free implementation — uses only `HTMLAudioElement`, no Howler, no Web Audio.

## Chrome autoplay constraints we hit

Chrome's autoplay policy turns out to be far more restrictive than the docs suggest. The non-obvious facts:

1. **Activation is per-`<audio>` element, not per-document.** A successful `play()` on one element does not unlock other elements, even when both are created during the same gesture.
2. **Activation is transient.** Even a primed element loses its activation after ~5 seconds of no user interaction. Subsequent `play()` calls return a resolved promise and advance `currentTime` to the end, but no audio is sent to the output device. `play()` does NOT reject — Chrome silently drops the output buffer.
3. **Silent/zero-amplitude data does not grant activation.** A `<audio>` element playing all-zero PCM samples, or any element played at `volume: 0` or `muted: true`, takes Chrome's "muted autoplay is always allowed" free pass and does not count as a real play for the purposes of granting activation.
4. **Changing `src` on a primed element invalidates the activation.** Each `src` assignment triggers the media-element load algorithm, which resets the element's autoplay state.

These four facts together mean:
- We cannot share a single `<audio>` element across multiple sounds (constraint #4).
- We cannot prime elements silently to avoid a startup noise (constraint #3).
- We cannot rely on the initial gesture alone — background triggers fire long after activation expires (constraint #2).
- We cannot prime just one element and expect others to work (constraint #1).

## Architecture

Three pieces, layered:

**1. Per-key cached `<audio>` elements.** One element per known sound key, src set at preload time and never swapped. Keys are discovered from `getCustomSounds()` plus `triggers`, `soundCategories`, and `customBeepSoundKey` in `uiSettings`.

**2. Audible primer on first user gesture.** A document-level capture-phase listener on `click`/`keydown`/`touchstart`/`pointerdown` plays every cached element once at `PRIMER_VOLUME` (~10%), then immediately pauses each as soon as its `play()` promise resolves. The audible duration is ~tens of ms per element, perceived as a single brief blip. This grants each element its per-element autoplay activation.

**3. Continuous keepalive loop.** A separate `<audio>` element loops the beep src at `KEEPALIVE_VOLUME` (-60 dB, inaudible to humans but Chrome counts it as real audio playback). Started immediately after the primer fires. While this loop runs, the page is in continuous "actively playing media" state, which Chrome treats as durable engagement — every `play()` on any primed element produces audible output regardless of how long since the last user interaction.

The visible cost: the tab speaker icon is shown continuously while the keepalive loop runs, and there's a small CPU/battery cost from decoding the looped audio. Both are acceptable trade-offs given the alternative is unreliable audio.

## Code shape

```text
constructor
  ├─ subscribes to client `sound:play` and `sound:category`
  ├─ kicks off discoverAndPreload() — populates this.elements
  └─ installGestureListeners() — primer fires on first gesture

activatePrimer (runs once, in user-gesture stack)
  ├─ for each cached element: volume = 0.1, play(), pause-on-resolve
  └─ starts the keepalive loop (volume = 0.001, loop = true) on the beep src

play(key)
  ├─ cache hit → playElement(audio): volume = 1, currentTime = 0, play()
  └─ cache miss → ensureElement(key).then(playElement) — loses gesture context

previewKey(key)  ← public, called from UI preview buttons
  └─ synchronous play(key) — stays inside the caller's user-activation stack
```

## Testing

Unit tests live in `test/client/Client.test.ts`. They mock `HTMLMediaElement.prototype.play`/`pause` and assert on call counts and the `this` of each call (`audioPlay.mock.contexts`). When adding tests, remember:

- `discoverAndPreload` runs at construction and uses `getCustomSounds()`, which must be mocked.
- The default beep src is loaded via dynamic `import('./sounds')` — mock `@client/sounds` to avoid pulling the real ~100 KB data URI into the test bundle.
- `prepareSounds()` awaits all element creation; assertion code that runs after it can rely on `elements` being populated.
- The keepalive loop fires on the primer activation path, not on `prepareSounds`, so unit tests that don't simulate a user gesture don't hit it.

## What this is NOT solving

- **MEI bootstrap.** A user visiting for the first time on a fresh profile still hears one quiet blip on first gesture. We don't try to suppress it because silent priming doesn't actually unlock audio (see constraint #3).
- **Notification API.** Background alerts when the page itself isn't loaded would need the Notifications/Push API. This system only handles audio while the tab exists.
- **Polyphony.** Each key has one element, so a sound retriggered while still playing restarts from the beginning rather than overlapping. Trigger sounds in a MUD context don't need polyphony.

## Touchpoints

- `src/client/SoundManager.ts` — the implementation.
- `src/client/Client.ts` — instantiates SoundManager; exposes `client.SoundManager` and `client.prepareSounds()`.
- `src/web/uiSettings.ts` — calls `soundManager.previewKey(key)` for the Manage Sounds and category preview buttons.
- `src/web/main.ts` — wires `initUiSettings(client.SoundManager)`.
- `src/client/scripts/userTriggers.ts`, `transportTracker.ts`, etc. — dispatch `client.sendEvent("sound:play", { key })` or `"sound:category"`.
