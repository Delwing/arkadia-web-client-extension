import type { FeatureModule } from "../../feature-module";

import initExternalScripts from "../../../scripts/externalScripts";
import initUserAliases from "../../../scripts/userAliases";
import initUserTriggers from "../../../scripts/userTriggers";

const extensionsModule: FeatureModule = {
    id: "legacy.extensions",
    register({ client }) {
        const aliases = client.aliases;

        initExternalScripts(client);
        initUserAliases(client, aliases);
        initUserTriggers(client);
    },
};

export default extensionsModule;
