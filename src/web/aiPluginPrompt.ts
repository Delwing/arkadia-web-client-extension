import pluginDocs from "../../docs/PLUGINS.md?raw";
import pluginApiTypes from "../../plugin-types/index.d.ts?raw";

export function buildAiPluginPrompt(description: string): string {
    return `You are writing a plugin for the Arkadia Web Client, a browser extension for the Arkadia MUD game.

Below is the plugin authoring guide (with narrative explanation and worked examples), followed by the complete TypeScript type declarations for the plugin API. The guide does not cover every API namespace — for anything not explained in the guide, rely on the type declarations as the source of truth. Read both carefully, then write a plugin that does the following:

"""
${description.trim()}
"""

Requirements:
- Output ONLY the plugin source code, wrapped in a single fenced code block (\`\`\`typescript ... \`\`\`). Put nothing outside that code block — no explanation or commentary before or after it.
- The module must export an async \`init(api)\` function, and may optionally export a \`destroy(api)\` function for cleanup.
- Use only the API described below — do not invent methods that are not listed in either the guide or the type declarations.
- Write plain TypeScript/JavaScript that can run directly as an ES module (no build step, no imports besides what \`api\` provides).
- If the request implies something the end user should be able to configure or edit later (a target name, a command, a color, a toggle, an interval, etc.), expose it as an editable field via \`configFields\` on \`api.buttonMacros.register\` / \`api.triggerMacros.register\` rather than hardcoding it or leaving it as a TODO — this is a normal, first-class way to make a plugin configurable, not a workaround.
- Plugins are not limited to triggers and macros — \`api.ui\` lets a plugin build its own UI surfaces: draggable/dockable popup windows (\`registerPersistentPopup\`, can hold arbitrary HTML/DOM content and forms), footer bar components (\`registerFooterComponent\`), entries in the ⋮ popup menu (\`addPopupMenuEntry\`), and entries in the output right-click context menu (\`addContextMenuEntry\`). If the request calls for showing a window, a panel, a list, a settings form, or any interactive display beyond a single button, reach for \`api.ui\` instead of trying to force it through triggers or macros.
- The type declarations show React elements as one accepted content type for \`registerFooterComponent\`/popups — ignore that option. This plugin is a plain ES module with no build step, so JSX cannot be transpiled and React is not guaranteed to be importable. Build all \`api.ui\` content with plain HTML strings or \`document.createElement\`/DOM APIs instead.
- Any command string sent to the game server (via \`api.command.send\`, \`client.sendCommand\`, or the \`sendCommand\` event) must always be plain ASCII, with Polish diacritics stripped/replaced by their base letters (ą→a, ć→c, ę→e, ł→l, ń→n, ó→o, ś→s, ź→z, ż→z, and uppercase equivalents) — the game server does not accept accented characters in commands. This only applies to outgoing commands; matching against incoming game output text may still need to handle accented characters.

=== PLUGIN AUTHORING GUIDE ===

${pluginDocs}

=== END GUIDE ===

=== PLUGIN API TYPE DECLARATIONS ===

${pluginApiTypes}

=== END TYPE DECLARATIONS ===

Now write the plugin described above.`;
}
