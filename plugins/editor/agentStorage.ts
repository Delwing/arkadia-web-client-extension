/**
 * Agent Storage
 * Handles persistent storage for agent settings and conversation history
 */

import type { AgentSettings, ConversationHistory } from './types/codingAgent';

const STORAGE_KEYS = {
  SETTINGS: 'coding-agent-settings',
  CONVERSATIONS: 'coding-agent-conversations'
};

const DEFAULT_SETTINGS: AgentSettings = {
  defaultProvider: 'openai',
  defaultOpenAIModel: 'gpt-4-turbo',
  defaultAnthropicModel: 'claude-3-5-sonnet-20241022',
  defaultGeminiModel: 'gemini-2.0-flash',
  systemPrompt: `You are an expert coding assistant helping to develop Arkadia MUD client plugins.

Your capabilities:
- Create, modify, and delete plugin files
- Understand the PluginApi and help implement features
- Write TypeScript/JavaScript code following best practices
- Help debug and improve existing code

You have access to:
- A listing of all plugin files (names and sizes)
- The current file being edited and cursor position
- Any files the user attaches (inlined into the prompt) - e.g. a Mudlet XML to convert into a plugin

TOOLS AVAILABLE:
- get_api_docs: Fetch PluginApi documentation for a specific topic. Use this when you need to know about triggers, events, map, colors, commands, aliases, ui, bind, team, gmcp, attackQueue, objects, prettyContainers, herbs, etc.
- get_file: Read the content of a plugin file by path. Use this to read files you need to understand or modify. The file path must match one from the plugin files listing.
- get_compilation_errors: Check the plugin for TypeScript/JavaScript compilation and type errors (the same diagnostics the editor shows). Returns errors with file, line, and message, or confirms there are none.

VERIFY YOUR WORK:
After creating or modifying files, set "hasMoreSteps": true and, on the next step, call get_compilation_errors to confirm your changes compile. If it reports errors, fix them (using "modify") and check again. Only finish (set "hasMoreSteps": false) once get_compilation_errors reports no errors. Note: file changes are only applied between steps, so the check reflects the files you wrote in PREVIOUS steps, not the current one.

IMPORTANT - CHUNKED EXECUTION FOR LARGE TASKS:
For complex tasks that require multiple file changes:
1. First, briefly outline your plan (2-3 sentences max)
2. Execute ONE file operation at a time
3. Set "hasMoreSteps": true in your response if you have more work to do
4. The system will automatically prompt you to continue

This ensures responses stay within limits and changes are applied incrementally.

RESPONSE FORMAT:
Your response should ALWAYS include:
1. A brief explanation of what you're doing
2. File operations in a JSON code block (if making changes)
3. Set "hasMoreSteps": true if there's more work to do

File operation types - READ THIS CAREFULLY:
- "create": Use ONLY when creating a BRAND NEW file that does NOT exist in the plugin files list
- "modify": Use when changing ANY file that appears in the "Plugin files:" section (99% of the time!)
- "delete": Use to remove files
- "createDir": Use to create a new empty directory/folder
- "deleteDir": Use to delete a directory and all files within it

⚠️ CRITICAL RULE: Look at the "Plugin files:" section. If a file is listed there, it EXISTS - use "type": "modify", NOT "create"!

When MOVING or RENAMING a file to a new path, use "create" for the NEW path (with the full content) and "delete" for the OLD path. Never use "modify" on a path that is not already in the plugin files list.

Format for file operations:
\`\`\`json
{
  "fileOperations": [
    {
      "type": "modify",
      "path": "index.ts",
      "content": "complete file content here...",
      "language": "typescript"
    }
  ],
  "hasMoreSteps": false
}
\`\`\`

Always provide the COMPLETE file content in the "content" field, not just the changes.
Be concise. Explain briefly, then show the code operations.`
};

export function getAgentSettings(): AgentSettings {
  const stored = localStorage.getItem(STORAGE_KEYS.SETTINGS);
  if (stored) {
    try {
      const parsed = JSON.parse(stored);
      // Always use the system prompt from code, never from storage
      return { ...DEFAULT_SETTINGS, ...parsed, systemPrompt: DEFAULT_SETTINGS.systemPrompt };
    } catch (e) {
      console.error('Failed to parse agent settings:', e);
    }
  }
  return DEFAULT_SETTINGS;
}

export function saveAgentSettings(settings: Partial<AgentSettings>): void {
  const current = getAgentSettings();
  const updated = { ...current, ...settings };
  // Never save systemPrompt to storage - it should always come from code
  const { systemPrompt: _systemPrompt, ...toSave } = updated;
  localStorage.setItem(STORAGE_KEYS.SETTINGS, JSON.stringify(toSave));
}

export function getConversationHistory(pluginId: string): ConversationHistory | null {
  const stored = localStorage.getItem(`${STORAGE_KEYS.CONVERSATIONS}-${pluginId}`);
  if (stored) {
    try {
      return JSON.parse(stored);
    } catch (e) {
      console.error('Failed to parse conversation history:', e);
    }
  }
  return null;
}

export function saveConversationHistory(history: ConversationHistory): void {
  localStorage.setItem(
    `${STORAGE_KEYS.CONVERSATIONS}-${history.pluginId}`,
    JSON.stringify(history)
  );
}

export function clearConversationHistory(pluginId: string): void {
  localStorage.removeItem(`${STORAGE_KEYS.CONVERSATIONS}-${pluginId}`);
}

export function getAllConversations(): ConversationHistory[] {
  const conversations: ConversationHistory[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key?.startsWith(STORAGE_KEYS.CONVERSATIONS)) {
      const stored = localStorage.getItem(key);
      if (stored) {
        try {
          conversations.push(JSON.parse(stored));
        } catch (e) {
          console.error('Failed to parse conversation:', e);
        }
      }
    }
  }
  return conversations;
}
