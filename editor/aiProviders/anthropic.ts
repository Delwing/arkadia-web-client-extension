/**
 * Anthropic Claude API Integration
 * Supports tool calling for documentation lookup and chunked execution for large tasks.
 */

import type { AgentRequest, AgentResponse, AgentProgressCallback } from '../types/codingAgent';
import { searchDocs, getDocsSummary } from './docsRegistry';

/** Maximum continuation loops to prevent infinite loops */
const MAX_CONTINUATIONS = 10;

/** Model context and output limits */
const MODEL_LIMITS: Record<string, { context: number; maxOutput: number }> = {
  'claude-sonnet-4': { context: 200000, maxOutput: 16000 },
  'claude-3-5-sonnet': { context: 200000, maxOutput: 8192 },
  'claude-3-5-haiku': { context: 200000, maxOutput: 8192 },
  'claude-3-opus': { context: 200000, maxOutput: 4096 },
  'claude-3-sonnet': { context: 200000, maxOutput: 4096 },
  'claude-3-haiku': { context: 200000, maxOutput: 4096 },
  'default': { context: 200000, maxOutput: 8192 }
};

/** Estimate token count from text (rough: ~4 chars per token) */
function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

/** Calculate dynamic max_tokens based on input size and model limits */
function calculateMaxTokens(systemMessage: string, messages: any[], model: string): number {
  // Estimate input tokens
  const inputText = systemMessage + messages.map(m =>
    typeof m.content === 'string' ? m.content : JSON.stringify(m.content)
  ).join('');
  const inputTokens = estimateTokens(inputText);

  // Find matching model config
  const config = Object.entries(MODEL_LIMITS).find(([key]) =>
    key !== 'default' && model.includes(key)
  )?.[1] || MODEL_LIMITS.default;

  // Calculate available tokens for response
  const available = config.context - inputTokens - 500; // 500 token buffer

  // Clamp between reasonable min/max
  const minTokens = 4000;
  const maxTokens = Math.min(available, config.maxOutput);

  return Math.max(minTokens, maxTokens);
}

/** Tool definitions for Anthropic tool use */
const tools = [
  {
    name: 'get_api_docs',
    description: 'Fetch PluginApi documentation for a specific topic. Use this to look up API details for triggers, events, map, colors, commands, aliases, ui, bind, team, gmcp, attackQueue, objects, prettyContainers, herbs, objectListFilters, AnsiAwareBuffer, etc.',
    input_schema: {
      type: 'object',
      properties: {
        topic: {
          type: 'string',
          description: 'The API topic to look up (e.g., "triggers", "events", "map", "colors", "AnsiAwareBuffer")'
        }
      },
      required: ['topic']
    }
  },
  {
    name: 'get_file',
    description: 'Read the content of a plugin file. Use this to read files you need to understand or modify.',
    input_schema: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: 'The file path from the plugin files listing (e.g., "index.ts", "utils/helpers.ts")'
        }
      },
      required: ['path']
    }
  }
];

export async function callAnthropic(
  request: AgentRequest,
  apiKey: string,
  model: string,
  onProgress?: AgentProgressCallback
): Promise<AgentResponse> {
  if (!apiKey) {
    return {
      message: '',
      error: 'Anthropic API key not configured. Please set it in the settings.'
    };
  }

  try {
    // Build system message from conversation history
    let systemMessage = '';
    const userMessages: Array<{ role: string; content: any }> = [];

    for (const msg of request.conversationHistory) {
      if (msg.role === 'system') {
        systemMessage = msg.content;
      } else {
        userMessages.push({
          role: msg.role,
          content: msg.content
        });
      }
    }

    // Add docs summary to system message
    systemMessage = systemMessage + '\n\n' + getDocsSummary();

    // Add current request
    userMessages.push({
      role: 'user',
      content: buildPrompt(request)
    });

    // Accumulated response for multi-step execution
    const allFileOperations: any[] = [];
    const messagesParts: string[] = [];
    let continuationCount = 0;

    while (continuationCount < MAX_CONTINUATIONS) {
      const response = await makeApiCall(apiKey, model, systemMessage, userMessages);

      if (!response.ok) {
        const error = await response.json().catch(() => ({ error: { message: 'Unknown error' } }));
        return {
          message: '',
          error: `Anthropic API error: ${error.error?.message || response.statusText}`
        };
      }

      const data = await response.json();

      // Check if there are tool uses in the response
      const toolUses = data.content.filter((block: any) => block.type === 'tool_use');

      if (toolUses.length > 0) {
        // Add assistant message with tool uses to history
        userMessages.push({
          role: 'assistant',
          content: data.content
        });

        // Process tool uses and build tool results
        const toolResults: any[] = [];
        for (const toolUse of toolUses) {
          if (toolUse.name === 'get_api_docs') {
            const docs = searchDocs(toolUse.input.topic);

            // Report progress
            onProgress?.({
              type: 'tool_call',
              message: `Looking up documentation: "${toolUse.input.topic}"`,
              step: continuationCount + 1
            });

            toolResults.push({
              type: 'tool_result',
              tool_use_id: toolUse.id,
              content: docs
            });
          } else if (toolUse.name === 'get_file') {
            const filePath = toolUse.input.path;
            const fileContent = request.context.pluginFiles?.[filePath];

            onProgress?.({
              type: 'tool_call',
              message: `Reading file: "${filePath}"`,
              step: continuationCount + 1
            });

            toolResults.push({
              type: 'tool_result',
              tool_use_id: toolUse.id,
              content: fileContent ?? `File not found: "${filePath}". Available files: ${Object.keys(request.context.pluginFiles || {}).join(', ')}`
            });
          }
        }

        // Add tool results as user message
        userMessages.push({
          role: 'user',
          content: toolResults
        });

        // Continue the loop to get the next response
        continuationCount++;
        continue;
      }

      // Extract text content from response
      const textBlocks = data.content.filter((block: any) => block.type === 'text');
      const assistantMessage = textBlocks.map((block: any) => block.text).join('\n');

      const parsed = parseAgentResponse(assistantMessage);

      if (parsed.fileOperations && parsed.fileOperations.length > 0) {
        allFileOperations.push(...parsed.fileOperations);
      }
      if (parsed.message) {
        messagesParts.push(parsed.message);
      }

      // Check if response was truncated or has more steps
      const wasTruncated = data.stop_reason === 'max_tokens';
      const hasMoreSteps = parsed.hasMoreSteps || wasTruncated;

      if (hasMoreSteps && continuationCount < MAX_CONTINUATIONS - 1) {
        // Emit step_complete with partial response so UI can display it immediately
        onProgress?.({
          type: 'step_complete',
          message: `Step ${continuationCount + 1} complete`,
          step: continuationCount + 1,
          partialResponse: {
            message: parsed.message,
            fileOperations: parsed.fileOperations
          }
        });

        // Report continuation status
        if (wasTruncated) {
          onProgress?.({
            type: 'truncated',
            message: 'Response was truncated, requesting continuation...',
            step: continuationCount + 1
          });
        } else {
          onProgress?.({
            type: 'continuation',
            message: `Continuing to next step...`,
            step: continuationCount + 1
          });
        }

        // Add the assistant's response to history
        userMessages.push({
          role: 'assistant',
          content: assistantMessage
        });

        // Ask to continue
        userMessages.push({
          role: 'user',
          content: 'Continue with the next step. Remember to set "hasMoreSteps": true if there are more steps after this one.'
        });

        continuationCount++;
        continue;
      }

      // Done - return accumulated results
      break;
    }

    return {
      message: messagesParts.join('\n\n---\n\n'),
      fileOperations: allFileOperations
    };

  } catch (error) {
    return {
      message: '',
      error: `Request failed: ${error instanceof Error ? error.message : 'Unknown error'}`
    };
  }
}

async function makeApiCall(
  apiKey: string,
  model: string,
  systemMessage: string,
  messages: any[]
): Promise<Response> {
  // Calculate dynamic max tokens based on input size and model limits
  const maxTokens = calculateMaxTokens(systemMessage, messages, model);

  return fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify({
      model,
      max_tokens: maxTokens,
      system: systemMessage,
      messages,
      tools
    })
  });
}

function buildPrompt(request: AgentRequest): string {
  let prompt = request.prompt;

  if (request.context.selectedText) {
    prompt += `\n\nSelected text:\n\`\`\`\n${request.context.selectedText}\n\`\`\``;
  }

  if (request.context.cursorPosition) {
    prompt += `\n\nCursor position: Line ${request.context.cursorPosition.line}, Column ${request.context.cursorPosition.column}`;
    if (request.context.currentFile) {
      prompt += ` in ${request.context.currentFile}`;
    }
  }

  if (request.context.pluginFiles && Object.keys(request.context.pluginFiles).length > 0) {
    const entries = Object.entries(request.context.pluginFiles);
    prompt += `\n\nPlugin files (${entries.length} files):`;
    for (const [path, content] of entries) {
      prompt += `\n  - ${path} (${content.length} chars)`;
    }
    prompt += '\n\nUse the get_file tool to read file contents when needed.';
  }

  return prompt;
}

interface ParsedResponse {
  message: string;
  fileOperations?: any[];
  hasMoreSteps?: boolean;
}

function parseAgentResponse(content: string): ParsedResponse {
  const response: ParsedResponse = {
    message: '',
    fileOperations: [],
    hasMoreSteps: false
  };

  const trimmedContent = content.trim();

  // First, try to parse as pure JSON (AI responded with just JSON object)
  if (trimmedContent.startsWith('{')) {
    try {
      const parsed = JSON.parse(trimmedContent);
      if (parsed.fileOperations && Array.isArray(parsed.fileOperations)) {
        response.fileOperations = parsed.fileOperations;
        response.hasMoreSteps = parsed.hasMoreSteps || false;
        // Generate a helpful message describing the operations
        const operationsSummary = parsed.fileOperations.map((op: any) =>
          `${op.type} ${op.path}`
        ).join(', ');
        response.message = `Executing file operations: ${operationsSummary}`;
        return response;
      }
    } catch (_e) {
      // Not pure JSON, continue to check for markdown blocks
    }
  }

  // Try to find JSON object anywhere in the content (AI might add text before/after)
  const jsonObjectMatch = trimmedContent.match(/\{[\s\S]*"fileOperations"[\s\S]*\}/);
  if (jsonObjectMatch) {
    try {
      const parsed = JSON.parse(jsonObjectMatch[0]);
      if (parsed.fileOperations && Array.isArray(parsed.fileOperations)) {
        response.fileOperations = parsed.fileOperations;
        response.hasMoreSteps = parsed.hasMoreSteps || false;
        // Remove the JSON from the message
        const messageWithoutJson = trimmedContent.replace(jsonObjectMatch[0], '').trim();
        if (messageWithoutJson) {
          response.message = messageWithoutJson;
        } else {
          const operationsSummary = parsed.fileOperations.map((op: any) =>
            `${op.type} ${op.path}`
          ).join(', ');
          response.message = `Executing file operations: ${operationsSummary}`;
        }
        return response;
      }
    } catch (_e) {
      // Not valid JSON, continue
    }
  }

  // Try to extract file operations from JSON blocks (markdown format)
  const jsonBlockRegex = /```json\s*\n([\s\S]*?)\n```/g;
  let match;
  let messageContent = content;

  while ((match = jsonBlockRegex.exec(content)) !== null) {
    try {
      const parsed = JSON.parse(match[1]);
      if (parsed.fileOperations && Array.isArray(parsed.fileOperations)) {
        response.fileOperations = parsed.fileOperations;
        response.hasMoreSteps = parsed.hasMoreSteps || false;
        // Remove the JSON block from the message content
        messageContent = messageContent.replace(match[0], '').trim();
      }
    } catch (_e) {
      // Not valid JSON, ignore
    }
  }

  // Set message to the content without JSON blocks
  response.message = messageContent;

  return response;
}
