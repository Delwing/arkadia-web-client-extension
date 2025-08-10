import ArkadiaClient from "./ArkadiaClient.ts";
import FightTitle from "./FightTitle.ts";

export default class HpTitle {
  private client: typeof ArkadiaClient;
  private fightTitle: FightTitle;
  private readonly originalTitle: string;

  constructor(client: typeof ArkadiaClient, fightTitle: FightTitle) {
    this.client = client;
    this.fightTitle = fightTitle;
    this.originalTitle = fightTitle.getOriginalTitle();
    this.client.on("gmcp.char.state", (state: any) => this.handleState(state));
    this.client.on("client.disconnect", () => this.reset());
  }

  private reset() {
    this.fightTitle.setBaseTitle(this.originalTitle);
  }

  private handleState(state: any) {
    if (typeof state?.hp !== "number") return;
    const hpValue = state.hp + 1;
    const hpMax = 7;
    this.fightTitle.setBaseTitle(`${this.originalTitle} [${hpValue}/${hpMax}]`);
  }
}
