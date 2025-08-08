import ArkadiaClient from "./ArkadiaClient.ts";

export default class FightTitle {
  private baseTitle: string;
  private client: typeof ArkadiaClient;
  private playerNum?: string;
  private isFighting = false;

  constructor(client: typeof ArkadiaClient) {
    this.client = client;
    this.baseTitle = document.title;
    client.on("gmcp.char.info", (info: any) => this.handleCharInfo(info));
    client.on("gmcp.objects.data", (data: Record<string, any>) => this.handleObjectsData(data));
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
    const fighting = obj.attack_num !== false && obj.attack_num !== undefined;
    this.updateTitle(fighting);
  }

  private updateTitle(fighting: boolean) {
    if (this.isFighting === fighting) return;
    this.isFighting = fighting;
    document.title = this.isFighting ? `⚔ ${this.baseTitle}` : this.baseTitle;
  }
}

