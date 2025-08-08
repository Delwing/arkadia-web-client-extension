import ArkadiaClient from "./ArkadiaClient.ts";

export default class FightTitle {
  private baseTitle: string;
  private client: typeof ArkadiaClient;
  private playerNum?: string;
  private isFighting = false;
  private readonly fightPrefix = "⚔ ";
  private readonly idlePrefix = "  ";

  constructor(client: typeof ArkadiaClient) {
    this.client = client;
    this.baseTitle = document.title;
    this.updateTitle(false, true);
    client.on("gmcp.char.info", (info: any) => this.handleCharInfo(info));
    client.on("gmcp.objects.data", (data: Record<string, any>) => this.handleObjectsData(data));
    client.on("client.disconnect", () => this.reset());
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
    const prefix = this.isFighting ? this.fightPrefix : this.idlePrefix;
    document.title = `${prefix}${this.baseTitle}`;
  }
}

