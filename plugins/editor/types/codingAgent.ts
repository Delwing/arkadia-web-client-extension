/**
 * Coding Agent Types
 * Type definitions for the AI coding assistant panel
 */

export type AIProvider = 'openai' | 'anthropic' | 'gemini';

export type OpenAIModel = string; // Dynamic models from API
export type AnthropicModel = string; // Dynamic models from API
export type GeminiModel = string; // Dynamic models from API

export interface AIConfig {
  provider: AIProvider;
  apiKey: string;
  model: OpenAIModel | AnthropicModel;
}

export interface Message {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: number;
  fileOperations?: FileOperation[];
  isLoading?: boolean;
  /** Marks an error message; the last one can be retried. */
  isError?: boolean;
}

export interface ConversationHistory {
  pluginId: string;
  messages: Message[];
  lastUpdated: number;
}

export interface FileOperation {
  type: 'create' | 'modify' | 'delete' | 'createDir' | 'deleteDir';
  path: string;
  content?: string;
  language?: 'typescript' | 'javascript' | 'json' | 'plaintext';
}

export interface AttachedFile {
  name: string;
  content: string;
}

export interface AgentRequest {
  prompt: string;
  context: {
    currentFile?: string;
    currentFileContent?: string;
    pluginFiles?: Record<string, string>;
    cursorPosition?: { line: number; column: number };
    selectedText?: string;
    pluginApiDocs?: string;
    attachedFiles?: AttachedFile[];
  };
  conversationHistory: Message[];
}

export interface AgentResponse {
  message: string;
  fileOperations?: FileOperation[];
  error?: string;
}

/** Progress update during multi-step execution */
export interface AgentProgress {
  type: 'tool_call' | 'continuation' | 'truncated' | 'step_complete' | 'retry';
  message: string;
  step: number;
  /** Partial response from a completed step (for incremental display) */
  partialResponse?: {
    message: string;
    fileOperations?: FileOperation[];
  };
}

/** Callback for progress updates during agent execution */
export type AgentProgressCallback = (progress: AgentProgress) => void;

export interface AgentSettings {
  openaiApiKey?: string;
  anthropicApiKey?: string;
  geminiApiKey?: string;
  defaultProvider: AIProvider;
  defaultOpenAIModel: OpenAIModel;
  defaultAnthropicModel: AnthropicModel;
  defaultGeminiModel: GeminiModel;
  systemPrompt: string;
}
