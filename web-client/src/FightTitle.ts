import ArkadiaClient from "./ArkadiaClient.ts";

export default class FightTitle {
  private baseTitle: string;
  private readonly originalTitle: string;
  private client: typeof ArkadiaClient;
  private playerNum?: string;
  private isFighting = false;
  private readonly fightPrefix = "⚔ ";
  private readonly idlePrefix = "ㅤ ";
  private enabled = true;

  constructor(client: typeof ArkadiaClient) {
    this.client = client;
    this.baseTitle = document.title;
    this.originalTitle = this.baseTitle;
    this.updateTitle(false, true);
    client.on("gmcp.char.info", (info: any) => this.handleCharInfo(info));
    client.on("gmcp.objects.data", (data: Record<string, any>) => this.handleObjectsData(data));
    client.on("client.disconnect", () => this.reset());
    (window as any).clientExtension?.eventTarget.addEventListener("uiSettings", (ev: CustomEvent) => {
      if (typeof ev.detail?.fightTitleIcon === "boolean") {
        this.enabled = ev.detail.fightTitleIcon;
        this.updateTitle(this.isFighting, true);
      }
    });
  }

  private handleCharInfo(info: any) {
    if (info && typeof info.object_num !== "undefined") {
      this.playerNum = String(info.object_num);
    }
  }

  private handleObjectsData(data: Record<string, any>) {
    if (!this.playerNum) return;
    const obj = data[this.playerNum];
    if (!obj) return;
    if (obj.attack_num === undefined) return;
    const fighting = obj.attack_num !== false;
    this.updateTitle(fighting);
  }

  private reset() {
    this.playerNum = undefined;
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

