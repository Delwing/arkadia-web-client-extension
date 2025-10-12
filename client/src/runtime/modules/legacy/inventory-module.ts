import type { FeatureModule } from "../../feature-module";

import { initItemCollector } from "../../../scripts/itemCollector";
import initContainers from "../../../scripts/prettyContainers";
import initBagManager from "../../../scripts/bagManager";
import initDeposits from "../../../scripts/deposits";
import initHerbShop from "../../../scripts/herbShop";
import initArmorShop from "../../../scripts/armorShop";
import initSmith from "../../../scripts/smith";
import initHerbCounter from "../../../scripts/herbCounter";
import initHerbDescriptions from "../../../scripts/herbDescriptions";
import initLvlCalc from "../../../scripts/lvlCalc";
import initCompareAll from "../../../scripts/compareAll";
import initItemCondition from "../../../scripts/itemCondition";
import initDurability from "../../../scripts/durability";
import initWearUsed from "../../../scripts/wearUsed";
import initObjectAliases from "../../../scripts/objectAliases";
import initMagicKeys from "../../../scripts/magicKeys";
import initMagics from "../../../scripts/magics";
import initOdlozMagie from "../../../scripts/odlozMagie";
import initPriceEvaluation from "../../../scripts/priceEvaluation";
import initStoneValue from "../../../scripts/stoneValue";
import initSelfEvaluation from "../../../scripts/selfEvaluation";
import initSkills from "../../../scripts/skills";
import initCoinColors from "../../../scripts/coinColors";
import initWeaponColors from "../../../scripts/weaponColors";
import initWeaponEvaluation from "../../../scripts/weaponEvaluation";
import initArmorEvaluation from "../../../scripts/armorEvaluation";
import initParryShieldEvaluation from "../../../scripts/parryShieldEvaluation";

const inventoryModule: FeatureModule = {
    id: "legacy.inventory",
    register({ client }) {
        const aliases = client.aliases;

        const itemCollector = initItemCollector(client, aliases);
        (client as any).ItemCollector = itemCollector;

        initContainers(client);
        initBagManager(client, aliases);
        initDeposits(client, aliases);
        initHerbShop(client);
        initArmorShop(client);
        initSmith(client, aliases);
        initHerbCounter(client, aliases);
        initHerbDescriptions(client);
        initLvlCalc(client, aliases);
        initCompareAll(client, aliases);
        initItemCondition(client);
        initDurability(client);
        initWearUsed(client);
        initObjectAliases(client, aliases);
        initMagicKeys(client);
        initMagics(client);
        initOdlozMagie(client, aliases);
        initPriceEvaluation(client);
        initStoneValue(client, aliases);
        initSelfEvaluation(client, aliases);
        initSkills(client, aliases);
        initCoinColors(client);
        initWeaponColors(client);
        initWeaponEvaluation(client);
        initArmorEvaluation(client);
        initParryShieldEvaluation(client);
    },
};

export default inventoryModule;
