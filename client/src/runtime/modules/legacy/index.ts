import type { ModuleRegistry } from "../../feature-module";

import movementModule from "./movement-module";
import combatModule from "./combat-module";
import inventoryModule from "./inventory-module";
import communityModule from "./community-module";
import extensionsModule from "./extensions-module";

export const legacyModules: ModuleRegistry = [
    movementModule,
    combatModule,
    inventoryModule,
    communityModule,
    extensionsModule,
];

export default legacyModules;
