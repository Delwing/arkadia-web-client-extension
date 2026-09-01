import eventBus from "@modules/core/eventBus";
import {getShellSettings, onShellSettingsChange} from "@modules/core/settings";

/**
 * The live instance, so `suppressTitleUpdates` can reach it without being
 * threaded through the UI. Only the stock UI constructs a FightTitle (see
 * `src/web/main.ts`); in a UI that doesn't, the suppressor is a harmless no-op.
 */
let activeInstance: FightTitle | null = null;

/**
 * Stop or resume writing the game's state into `document.title`.
 *
 * The tab title is the one part of the client that stays visible when something
 * is drawn over the whole page: `HpTitle` keeps it reading "Arkadia [5/7]" and
 * this class prefixes a sword during combat, both of which show up on the
 * browser tab and in the Windows taskbar. The boss key overlay suppresses that
 * while it's up and releases it on dismiss, at which point the current title is
 * re-applied.
 *
 * Suppressing here covers `HpTitle` too, since it only ever reaches the title
 * through `setBaseTitle`.
 */
export function suppressTitleUpdates(suppressed: boolean): void {
    activeInstance?.setSuppressed(suppressed);
}

export default class FightTitle {
  private baseTitle: string;
  private readonly originalTitle: string;
  private isFighting = false;
  private readonly fightPrefix = "⚔ ";
  private readonly idlePrefix = "ㅤ ";
  private enabled = true;
  private suppressed = false;

  constructor() {
    this.baseTitle = document.title;
    this.originalTitle = this.baseTitle;
    this.updateTitle(false, true);
    eventBus.on("combatState", (fighting: boolean) => {
      this.updateTitle(fighting);
    });
    eventBus.on("client.disconnect", () => this.reset());
    this.enabled = getShellSettings().fightTitleIcon;
    onShellSettingsChange((shell) => {
      this.enabled = shell.fightTitleIcon;
      this.updateTitle(this.isFighting, true);
    });
    activeInstance = this;
  }

  private reset() {
    this.updateTitle(false, true);
  }

  /**
   * While suppressed, combat/HP updates are still tracked but never written to
   * `document.title` --- whatever the overlay put there stays put. Releasing
   * re-applies the current state in one go.
   */
  setSuppressed(suppressed: boolean) {
    if (this.suppressed === suppressed) return;
    this.suppressed = suppressed;
    if (!suppressed) {
      this.updateTitle(this.isFighting, true);
    }
  }

  private updateTitle(fighting: boolean, force = false) {
    if (!force && this.isFighting === fighting) return;
    this.isFighting = fighting;
    if (this.suppressed) return;
    if (!this.enabled) {
      document.title = this.baseTitle;
      return;
    }
    const prefix = this.isFighting ? this.fightPrefix : this.idlePrefix;
    document.title = `${prefix}${this.baseTitle}`;
  }

  setBaseTitle(title: string) {
    this.baseTitle = title;
    this.updateTitle(this.isFighting, true);
  }

  getOriginalTitle() {
    return this.originalTitle;
  }
}
