/**
 * Which plugins have reached into which feature script.
 *
 * Three script-owned surfaces are public plugin API — the `prettyContainers`
 * definition registries, `getHerbManager`, and the `bagManager` containers — so
 * turning one of those scripts off can silently degrade a third-party plugin that
 * has already registered against it.
 *
 * The chosen answer is to let the toggle through but say who it affects first
 * (docs/SCRIPT_DEPENDENCIES.md, *Decisions* §1). That needs attribution, which is
 * what this records: `PluginApi` is constructed per plugin and knows its own id,
 * so each of those surfaces notes the caller as it is used.
 *
 * Usage is remembered rather than sampled. A plugin that registered a filter at
 * load time and never touches the API again is exactly the one that would break
 * quietly, so "has used" is the useful question, not "is using right now".
 */

const usageByScript = new Map<string, Set<string>>();

/** Note that `pluginId` has used something `scriptId` owns. */
export function recordPluginScriptUsage(scriptId: string, pluginId: string): void {
    let plugins = usageByScript.get(scriptId);
    if (!plugins) {
        plugins = new Set();
        usageByScript.set(scriptId, plugins);
    }
    plugins.add(pluginId);
}

/** The plugins that have used this script's public surface, in first-use order. */
export function getPluginsUsingScript(scriptId: string): string[] {
    return Array.from(usageByScript.get(scriptId) ?? []);
}

/** Forget everything a plugin used. Called when it is unloaded. */
export function forgetPluginScriptUsage(pluginId: string): void {
    for (const plugins of usageByScript.values()) {
        plugins.delete(pluginId);
    }
}

/** Test seam. */
export function __resetPluginScriptUsage(): void {
    usageByScript.clear();
}
