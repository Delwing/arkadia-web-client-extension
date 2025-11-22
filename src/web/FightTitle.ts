import ArkadiaClient from "./ArkadiaClient.ts";

export default class FightTitle {
  private baseTitle: string;
  private readonly originalTitle: string;
  private isFighting = false;
  private readonly fightPrefix = "⚔ ";
  private readonly idlePrefix = "ㅤ ";
  private enabled = true;

  constructor(client: typeof ArkadiaClient) {
    this.baseTitle = document.title;
    this.originalTitle = this.baseTitle;
    this.updateTitle(false, true);
    // Listen to centralized combat state event
    client.on("combatState", (fighting: boolean) => {
      this.updateTitle(fighting);
    });
    client.on("client.disconnect", () => this.reset());
    client.on("uiSettings", (payload) => {
      if (payload && typeof payload.fightTitleIcon === "boolean") {
        this.enabled = payload.fightTitleIcon;
        this.updateTitle(this.isFighting, true);
      }
    });
  }

  private reset() {
    this.updateTitle(false, true);
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
