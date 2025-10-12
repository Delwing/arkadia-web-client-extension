import type { FeatureModule, FeatureModuleContext, ModuleRegistry } from "../feature-module";

import { legacyModules } from "./legacy";

export type ModuleLoader = (context: FeatureModuleContext) => void;

export function createModuleLoader(modules: ModuleRegistry): ModuleLoader {
    return (context) => {
        modules.forEach((module) => {
            module.register(context);
        });
    };
}

export const registerLegacyModules = createModuleLoader(legacyModules);

export const defaultModules: ModuleRegistry = legacyModules;

export function registerModules(context: FeatureModuleContext, modules: FeatureModule[] = defaultModules): void {
    modules.forEach((module) => {
        module.register(context);
    });
}

export default registerLegacyModules;
