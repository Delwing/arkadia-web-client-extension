/**
 * OpenAI API Integration
 * Supports tool calling for documentation lookup and chunked execution for large tasks.
 */

import type { AgentRequest, AgentResponse, AgentProgressCallback } from '../types/codingAgent';
import { searchDocs, getDocsSummary } from './docsRegistry';

/** Maximum continuation loops to prevent infinite loops */
const MAX_CONTINUATIONS = 10;

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
  }
];

export async function callOpenAI(
  request: AgentRequest,
  apiKey: string,
  model: string,
  onProgress?: AgentProgressCallback
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
      const response = await makeApiCall(apiKey, model, messages);

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
          }
        }

        // Continue the loop to get the next response
        continuationCount++;
        continue;
      }

      // Regular message response
      const assistantMessage = choice.message?.content || '';
      const parsed = parseAgentResponse(assistantMessage);

      if (parsed.fileOperations && parsed.fileOperations.length > 0) {
        allFileOperations.push(...parsed.fileOperations);
      }
      if (parsed.message) {
        messagesParts.push(parsed.message);
      }

      // Check if response was truncated or has more steps
      const wasTruncated = choice.finish_reason === 'length';
      const hasMoreSteps = parsed.hasMoreSteps || wasTruncated;

      if (hasMoreSteps && continuationCount < MAX_CONTINUATIONS - 1) {
        // Report progress
        if (wasTruncated) {
          onProgress?.({
            type: 'truncated',
            message: 'Response was truncated, requesting continuation...',
            step: continuationCount + 1
          });
        } else {
          onProgress?.({
            type: 'continuation',
            message: `Step ${continuationCount + 1} complete, continuing...`,
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
    requestBody.max_completion_tokens = 4000;
  } else {
    requestBody.max_tokens = 4000;
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

  if (request.context.currentFile && request.context.currentFileContent) {
    prompt += `\n\nCurrent file (${request.context.currentFile}):\n\`\`\`\n${request.context.currentFileContent}\n\`\`\``;
  }

  if (request.context.pluginFiles && Object.keys(request.context.pluginFiles).length > 0) {
    prompt += '\n\nPlugin files:';
    for (const [path, content] of Object.entries(request.context.pluginFiles)) {
      prompt += `\n\n${path}:\n\`\`\`\n${content}\n\`\`\``;
    }
  }

  // Note: pluginApiDocs is no longer included here - AI will use get_api_docs tool instead

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

  // First, try to parse as pure JSON (AI responded with just JSON object)
  const trimmedContent = content.trim();
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
