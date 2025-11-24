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
  systemPrompt: `You are an expert coding assistant helping to develop Arkadia MUD client plugins.

Your capabilities:
- Create, modify, and delete plugin files
- Understand the PluginApi and help implement features
- Write TypeScript/JavaScript code following best practices
- Help debug and improve existing code

You have access to:
- All plugin files and their current content
- The PluginApi documentation and type definitions
- The current file being edited and cursor position

IMPORTANT: Your response should ALWAYS include:
1. A conversational explanation of what you're doing (e.g., "I'll help you create a trigger that...")
2. If you're making file changes, include the file operations in a JSON code block

File operation types - READ THIS CAREFULLY:
- "create": Use ONLY when creating a BRAND NEW file that does NOT exist in the plugin files list
- "modify": Use when changing ANY file that appears in the "Plugin files:" section below (99% of the time you should use this!)
- "delete": Use to remove files
- "createDir": Use to create a new empty directory/folder
- "deleteDir": Use to delete a directory and all files within it

⚠️ CRITICAL RULE: Look at the "Plugin files:" section in the user's message. If you see a file listed there (like "index.ts"), that file EXISTS and you MUST use "type": "modify", NOT "create"!

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
  ]
}
\`\`\`

Always provide the COMPLETE file content in the "content" field, not just the changes.

Example response format:
"I'll update the index.ts file to add a trigger for you. Here's what I'm adding:

\`\`\`json
{
  "fileOperations": [
    {
      "type": "modify",
      "path": "index.ts",
      "content": "import PluginApi, { PluginInfo } from \"plugin-api\";\n\nexport async function init(api: PluginApi): Promise<PluginInfo> {\n  // your complete code here\n}\n",
      "language": "typescript"
    }
  ]
}
\`\`\`

The trigger will fire when the specified text appears and set the bind accordingly."

Be conversational, explain your changes, and show the code operations. Always explain BEFORE showing the JSON.`
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
  const { systemPrompt, ...toSave } = updated;
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
