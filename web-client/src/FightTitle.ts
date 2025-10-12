import type ArkadiaClient from "./ArkadiaClient.ts";
import { subscribeToUiStore, uiStore } from "./ui/store";

export default class FightTitle {
  private baseTitle: string;
  private readonly originalTitle: string;
  private isFighting = false;
  private readonly fightPrefix = "⚔ ";
  private readonly idlePrefix = "ㅤ ";
  private enabled = true;
  private unsubscribeAttack?: () => void;
  private unsubscribePreferences?: () => void;

  constructor(_client: typeof ArkadiaClient) {
    this.baseTitle = document.title;
    this.originalTitle = this.baseTitle;
    this.updateTitle(false, true);
    const initialState = uiStore.getState();
    if (typeof initialState.uiPreferences.fightTitleIcon === "boolean") {
      this.enabled = initialState.uiPreferences.fightTitleIcon;
      this.updateTitle(this.isFighting, true);
    }

    this.unsubscribeAttack = subscribeToUiStore(
      (state) => (state.charState as Record<string, unknown>).attack_num,
      (attackNum) => {
        const fighting = attackNum !== false && attackNum !== undefined;
        this.updateTitle(fighting);
      },
      { fireImmediately: true },
    );

    this.unsubscribePreferences = subscribeToUiStore(
      (state) => state.uiPreferences.fightTitleIcon,
      (next) => {
        if (typeof next === "boolean") {
          this.enabled = next;
          this.updateTitle(this.isFighting, true);
        }
      },
      { fireImmediately: true },
    );
  }

  private updateTitle(fighting: boolean, force = false) {
    if (!force && this.isFighting === fighting) return;
    this.isFighting = fighting;
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

