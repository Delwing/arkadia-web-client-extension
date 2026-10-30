/**
 * OpenAI API Integration
 * Supports tool calling for documentation lookup and chunked execution for large tasks.
 */

import type { AgentRequest, AgentResponse, AgentProgressCallback } from '../types/codingAgent';
import { searchDocs, getDocsSummary } from './docsRegistry';
import { fetchWithRetry, describeRetry } from './httpRetry';

/** Maximum continuation loops to prevent infinite loops */
const MAX_CONTINUATIONS = 10;

/** Model context and output limits */
const MODEL_LIMITS: Record<string, { context: number; maxOutput: number }> = {
  'gpt-5': { context: 128000, maxOutput: 32768 },
  'gpt-5-mini': { context: 128000, maxOutput: 16384 },
  'gpt-4o': { context: 128000, maxOutput: 16384 },
  'gpt-4-turbo': { context: 128000, maxOutput: 4096 },
  'gpt-4': { context: 8192, maxOutput: 4096 },
  'o1': { context: 200000, maxOutput: 100000 },
  'o3': { context: 200000, maxOutput: 100000 },
  'default': { context: 128000, maxOutput: 8192 }
};

/** Estimate token count from text (rough: ~4 chars per token) */
function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

/** Calculate dynamic max_tokens based on input size and model limits */
function calculateMaxTokens(messages: any[], model: string): number {
  // Estimate input tokens
  const inputText = messages.map(m =>
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

/** Tool definitions for OpenAI function calling */
const tools = [
  {
    type: 'function' as const,
    function: {
      name: 'get_api_docs',
      description: 'Fetch PluginApi documentation for a specific topic. Use this to look up API details for triggers, events, map, colors, commands, aliases, ui, bind, team, gmcp, attackQueue, objects, prettyContainers, herbs, objectListFilters, AnsiAwareBuffer, etc.',
      parameters: {
        type: 'object',
        properties: {
          topic: {
            type: 'string',
            description: 'The API topic to look up (e.g., "triggers", "events", "map", "colors", "AnsiAwareBuffer")'
          }
        },
        required: ['topic']
      }
    }
  },
  {
    type: 'function' as const,
    function: {
      name: 'get_file',
      description: 'Read the content of a plugin file. Use this to read files you need to understand or modify.',
      parameters: {
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
  },
  {
    type: 'function' as const,
    function: {
      name: 'get_compilation_errors',
      description: 'Check the plugin for TypeScript/JavaScript compilation and type errors (the same diagnostics shown in the editor). Returns errors with file, line, and message, or a message saying there are none. Call this after creating or modifying files to verify your changes compile, and fix any reported errors before finishing.',
      parameters: {
        type: 'object',
        properties: {},
        required: []
      }
    }
  }
];

export async function callOpenAI(
  request: AgentRequest,
  apiKey: string,
  model: string,
  onProgress?: AgentProgressCallback,
  getCompilationErrors?: () => Promise<string>
): Promise<AgentResponse> {
  if (!apiKey) {
    return {
      message: '',
      error: 'OpenAI API key not configured. Please set it in the settings.'
    };
  }

  try {
    // Ensure system message is first
    const systemMessage = request.conversationHistory.find(m => m.role === 'system');
    const otherMessages = request.conversationHistory.filter(m => m.role !== 'system');

    const messages: Array<{ role: string; content?: string; tool_call_id?: string; tool_calls?: any[] }> = [
      ...(systemMessage ? [{
        role: 'system' as const,
        content: systemMessage.content + '\n\n' + getDocsSummary()
      }] : []),
      ...otherMessages.map(msg => ({
        role: msg.role as 'user' | 'assistant',
        content: msg.content
      })),
      {
        role: 'user' as const,
        content: buildPrompt(request)
      }
    ];

    // Accumulated response for multi-step execution
    const allFileOperations: any[] = [];
    const messagesParts: string[] = [];
    let continuationCount = 0;

    while (continuationCount < MAX_CONTINUATIONS) {
      const response = await fetchWithRetry(
        () => makeApiCall(apiKey, model, messages),
        (notice) => onProgress?.({ type: 'retry', message: describeRetry(notice), step: continuationCount + 1 })
      );

      if (!response.ok) {
        const error = await response.json().catch(() => ({ error: { message: 'Unknown error' } }));
        return {
          message: '',
          error: `OpenAI API error: ${error.error?.message || response.statusText}`
        };
      }

      const data = await response.json();
      const choice = data.choices[0];

      // Handle tool calls
      if (choice.message.tool_calls && choice.message.tool_calls.length > 0) {
        // Add assistant message with tool calls to history
        messages.push(choice.message);

        // Process each tool call
        for (const toolCall of choice.message.tool_calls) {
          if (toolCall.function.name === 'get_api_docs') {
            const args = JSON.parse(toolCall.function.arguments);
            const docs = searchDocs(args.topic);

            // Report progress
            onProgress?.({
              type: 'tool_call',
              message: `Looking up documentation: "${args.topic}"`,
              step: continuationCount + 1
            });

            // Add tool response to messages
            messages.push({
              role: 'tool',
              tool_call_id: toolCall.id,
              content: docs
            });
          } else if (toolCall.function.name === 'get_file') {
            const args = JSON.parse(toolCall.function.arguments);
            const fileContent = request.context.pluginFiles?.[args.path];

            onProgress?.({
              type: 'tool_call',
              message: `Reading file: "${args.path}"`,
              step: continuationCount + 1
            });

            messages.push({
              role: 'tool',
              tool_call_id: toolCall.id,
              content: fileContent ?? `File not found: "${args.path}". Available files: ${Object.keys(request.context.pluginFiles || {}).join(', ')}`
            });
          } else if (toolCall.function.name === 'get_compilation_errors') {
            onProgress?.({
              type: 'tool_call',
              message: 'Checking for compilation errors',
              step: continuationCount + 1
            });

            const report = getCompilationErrors
              ? await getCompilationErrors()
              : 'Compilation checking is not available.';

            messages.push({
              role: 'tool',
              tool_call_id: toolCall.id,
              content: report
            });
          }
        }

        // Continue the loop to get the next response
        continuationCount++;
        continue;
      }

      // Regular message response
      const assistantMessage = choice.message?.content || '';
      const parsed = parseAgentResponse(assistantMessage);

      // Check if response was truncated or has more steps
      const wasTruncated = choice.finish_reason === 'length';
      const hasMoreSteps = parsed.hasMoreSteps || wasTruncated;
      const willContinue = hasMoreSteps && continuationCount < MAX_CONTINUATIONS - 1;

      // When this step is emitted incrementally below (onProgress present and we
      // will continue), the panel displays and executes it right away. Don't also
      // accumulate it into the final return, or it gets shown/executed a second time.
      if (!(willContinue && onProgress)) {
        if (parsed.fileOperations && parsed.fileOperations.length > 0) {
          allFileOperations.push(...parsed.fileOperations);
        }
        if (parsed.message) {
          messagesParts.push(parsed.message);
        }
      }

      if (willContinue) {
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
        messages.push({
          role: 'assistant',
          content: assistantMessage
        });

        // Ask to continue
        messages.push({
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
  messages: any[]
): Promise<Response> {
  // Calculate dynamic max tokens based on input size and model limits
  const maxTokens = calculateMaxTokens(messages, model);

  // GPT-4o and newer models use max_completion_tokens instead of max_tokens
  const useNewTokenParam = model.includes('gpt-4o') ||
                           model.includes('gpt-5') ||
                           model.includes('o1') ||
                           model.includes('o3');

  const requestBody: any = {
    model,
    messages,
    tools
  };

  if (useNewTokenParam) {
    requestBody.max_completion_tokens = maxTokens;
  } else {
    requestBody.max_tokens = maxTokens;
  }

  return fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`
    },
    body: JSON.stringify(requestBody)
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

  if (request.context.attachedFiles && request.context.attachedFiles.length > 0) {
    prompt += `\n\nAttached files (provided by the user for reference, e.g. a Mudlet XML to convert into a plugin):`;
    for (const file of request.context.attachedFiles) {
      prompt += `\n\n--- ${file.name} ---\n\`\`\`\n${file.content}\n\`\`\``;
    }
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
