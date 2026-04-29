import eventBus from "@modules/core/eventBus";
import FightTitle from "./FightTitle.ts";
import type {GmcpCharState} from "@shared/events";

export default class HpTitle {
  private readonly fightTitle: FightTitle;
  private readonly originalTitle: string;

  constructor(fightTitle: FightTitle) {
    this.fightTitle = fightTitle;
    this.originalTitle = fightTitle.getOriginalTitle();
    eventBus.on("gmcp.char.state", (state) => this.handleState(state));
    eventBus.on("client.disconnect", () => this.reset());
  }

  private reset() {
    this.fightTitle.setBaseTitle(this.originalTitle);
  }

  private handleState(state: GmcpCharState) {
    if (typeof state?.hp !== "number") return;
    const hpValue = state.hp + 1;
    const hpMax = 7;
    this.fightTitle.setBaseTitle(`${this.originalTitle} [${hpValue}/${hpMax}]`);
  }
}
