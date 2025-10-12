import type { FeatureModule } from "../../feature-module";

import initAttackBeep from "../../../scripts/attackBeep";
import initAttackQueue from "../../../scripts/attackQueue";
import initLamp from "../../../scripts/lamp";
import initCoverTimer from "../../../scripts/coverTimer";
import initZaskTimer from "../../../scripts/zaskTimer";
import initBinds from "../../../scripts/binds";
import initTempBinds from "../../../scripts/tempBinds";
import { initKillCounter } from "../../../scripts/kill";
import { initImproveCounter } from "../../../scripts/improveCounter";
import initEscape from "../../../scripts/escape";
import initLeaderAttackWarning from "../../../scripts/leaderAttackWarning";
import initBreakItem from "../../../scripts/breakItem";
import initHpAlert from "../../../scripts/hpAlert";
import initIdleFullHp from "../../../scripts/idleFullHp";
import initFullHpTimer from "../../../scripts/fullHpTimer";
import initNoWeaponAlert from "../../../scripts/noWeaponAlert";
import initMagikZnika from "../../../scripts/magikZnika";
import initSeasonPrint from "../../../scripts/seasonPrint";
import initWorldRebirth from "../../../scripts/worldRebirth";
import initDajeCiHighlight from "../../../scripts/dajeCiHighlight";
import initPrzybywajaHighlight from "../../../scripts/przybywajaHighlight";
import initPrzybywajaCount from "../../../scripts/przybywajaCount";
import initInvite from "../../../scripts/invite";

const combatModule: FeatureModule = {
    id: "legacy.combat",
    register({ client }) {
        const aliases = client.aliases;

        initAttackBeep(client);
        initAttackQueue(client, aliases);
        initLamp(client);
        initCoverTimer(client);
        initZaskTimer(client);
        initBinds(client, aliases);
        initTempBinds(client, aliases);

        const killCounter = initKillCounter(client, aliases);
        (client as any).killCounter = killCounter;
        initImproveCounter(client, killCounter, aliases);

        initEscape(client);
        initLeaderAttackWarning(client);
        initBreakItem(client);
        initHpAlert(client);
        initIdleFullHp(client);
        initFullHpTimer(client);
        initNoWeaponAlert(client);
        initMagikZnika(client);
        initSeasonPrint(client);
        initWorldRebirth(client);
        initDajeCiHighlight(client);
        initPrzybywajaHighlight(client);
        initPrzybywajaCount(client);
        initInvite(client);
    },
};

export default combatModule;
