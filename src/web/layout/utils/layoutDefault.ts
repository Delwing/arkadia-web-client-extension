import { globalStorage } from '@modules/core/storage';
import { isMobileLikeViewport } from '@shared/dom/pointerEnvironment.ts';
import {
  invalidateLayoutCache,
  loadPersistedLayoutState,
  saveLayoutState,
} from './layoutStorage';

/** Set by the old "Duzy ekran? Menedzer okien..." banner's "Nie pokazuj wiecej"
 *  button. The banner is gone, but the flag still means "this user said no". */
const DISMISSED_KEY = 'layoutManagerSuggestionDismissed';

/** Marks the one-time flip as done, so a user who later turns the layout
 *  manager off in settings does not get it switched back on every reload. */
const DEFAULT_APPLIED_KEY = 'layoutManagerDefaultApplied';

/**
 * Turn the layout manager on by default for desktop users.
 *
 * It used to be an offer on the login overlay; now it is simply the default,
 * except for the users who explicitly declined that offer back when it existed.
 * Runs at most once per browser profile — after that the switch in settings is
 * the only thing that moves it.
 *
 * Mobile-like viewports are skipped *without* marking the flip as done, so the
 * same profile still gets the default the first time it opens on a big screen.
 */
export function applyDefaultLayoutMode(): void {
  try {
    if (localStorage.getItem(DEFAULT_APPLIED_KEY) === '1') return;
    if (isMobileLikeViewport()) return;

    localStorage.setItem(DEFAULT_APPLIED_KEY, '1');
    if (localStorage.getItem(DISMISSED_KEY) === '1') return;

    const state = loadPersistedLayoutState();
    if (state.enabled) return;

    saveLayoutState({ ...state, enabled: true });
    invalidateLayoutCache();
    // Matches what the banner's "Wlacz" button did: the dock rails replace the
    // stock button chrome. showButtons lives in the uiSettings blob, so merge
    // onto the existing value instead of replacing it.
    const cur = globalStorage.get('uiSettings') ?? {};
    globalStorage.set('uiSettings', { ...cur, showButtons: false } as never);
  } catch (e) {
    console.error('Failed to apply default layout mode:', e);
  }
}
