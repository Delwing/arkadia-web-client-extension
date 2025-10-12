import type { FeatureModule } from "../../feature-module";

import People from "../../../People";
import initChatHistory from "../../../scripts/chatHistory";
import initGuildPostfix from "../../../scripts/guildPostfix";
import initLanguage from "../../../scripts/language";
import initNewMail from "../../../scripts/newMail";
import registerGagTriggers from "../../../scripts/gags";
import registerLuaGagTriggers from "../../../scripts/luaGags";

const communityModule: FeatureModule = {
    id: "legacy.community",
    register({ client }) {
        const aliases = client.aliases;

        initChatHistory(client, aliases);
        initGuildPostfix(client);
        initLanguage(client, aliases);
        initNewMail(client);

        new People(client);
        registerGagTriggers(client);
        registerLuaGagTriggers(client);
    },
};

export default communityModule;
