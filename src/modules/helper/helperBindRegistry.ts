export interface HelperBindDefinition {
    id: string;
    label: string;
    category?: string;
}

const registry: HelperBindDefinition[] = [];

export function registerHelperBind(def: HelperBindDefinition) {
    if (!registry.find(b => b.id === def.id)) {
        registry.push(def);
    }
}

export function getHelperBinds(): readonly HelperBindDefinition[] {
    return registry;
}
