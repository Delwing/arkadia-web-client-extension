/**
 * Google Gemini API Integration
 * Uses the Generative Language API (generateContent) with function calling for
 * documentation lookup and chunked execution for large tasks.
 *
 * Works with any Google AI Studio API key, including the free tier
 * (e.g. gemini-2.0-flash, gemini-1.5-flash). Authentication is a simple
 * `?key=API_KEY` query parameter - no OAuth required.
 */

import type { AgentRequest, AgentResponse, AgentProgressCallback } from '../types/codingAgent';
import { searchDocs, getDocsSummary } from './docsRegistry';
import { fetchWithRetry, describeRetry } from './httpRetry';

/** Maximum continuation loops to prevent infinite loops */
const MAX_CONTINUATIONS = 10;

/**
 * gemini-2.5-flash-lite intermittently returns an empty turn (no parts, no
 * text, no function call) with finishReason STOP, especially right after a
 * tool response. Re-issue the same request this many times before giving up.
 */
const MAX_EMPTY_RETRIES = 3;

/** Instruction appended to unstick an empty (zero-token) Gemini turn. */
const EMPTY_RESPONSE_NUDGE =
  'Your previous response was empty. Continue now and provide your output. ' +
  'If creating or editing files, respond with a ```json block containing a ' +
  '"fileOperations" array, and set "hasMoreSteps": true if more steps remain.';

/** Model context and output limits */
const MODEL_LIMITS: Record<string, { context: number; maxOutput: number }> = {
  'gemini-2.5-pro': { context: 1048576, maxOutput: 65536 },
  'gemini-2.5-flash': { context: 1048576, maxOutput: 65536 },
  'gemini-2.0-flash': { context: 1048576, maxOutput: 8192 },
  'gemini-1.5-pro': { context: 2097152, maxOutput: 8192 },
  'gemini-1.5-flash': { context: 1048576, maxOutput: 8192 },
  'default': { context: 1048576, maxOutput: 8192 }
};

/** Estimate token count from text (rough: ~4 chars per token) */
function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

/** Calculate dynamic max output tokens based on input size and model limits */
function calculateMaxTokens(systemMessage: string, contents: any[], model: string): number {
  // Estimate input tokens
  const inputText = systemMessage + contents.map(c =>
    (c.parts || []).map((p: any) => p.text || JSON.stringify(p)).join('')
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

/** Tool definitions for Gemini function calling */
const functionDeclarations = [
  {
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
  },
  {
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
  },
  {
    name: 'get_compilation_errors',
    description: 'Check the plugin for TypeScript/JavaScript compilation and type errors (the same diagnostics shown in the editor). Returns errors with file, line, and message, or a message saying there are none. Call this after creating or modifying files to verify your changes compile, and fix any reported errors before finishing.',
    parameters: {
      type: 'object',
      properties: {},
      required: []
    }
  }
];

export async function callGemini(
  request: AgentRequest,
  apiKey: string,
  model: string,
  onProgress?: AgentProgressCallback,
  getCompilationErrors?: () => Promise<string>
): Promise<AgentResponse> {
  if (!apiKey) {
    return {
      message: '',
      error: 'Google Gemini API key not configured. Please set it in the settings.'
    };
  }

  try {
    // Build system instruction from conversation history; map remaining messages
    // to Gemini's contents format (roles: 'user' | 'model').
    let systemMessage = '';
    const contents: Array<{ role: string; parts: any[] }> = [];

    for (const msg of request.conversationHistory) {
      if (msg.role === 'system') {
        systemMessage = msg.content;
      } else {
        contents.push({
          role: msg.role === 'assistant' ? 'model' : 'user',
          parts: [{ text: msg.content }]
        });
      }
    }

    // Add docs summary to system message
    systemMessage = systemMessage + '\n\n' + getDocsSummary();

    // Add current request
    contents.push({
      role: 'user',
      parts: [{ text: buildPrompt(request) }]
    });

    // Accumulated response for multi-step execution
    const allFileOperations: any[] = [];
    const messagesParts: string[] = [];
    let continuationCount = 0;
    let emptyRetries = 0;

    while (continuationCount < MAX_CONTINUATIONS) {
      const response = await fetchWithRetry(
        () => makeApiCall(apiKey, model, systemMessage, contents),
        (notice) => onProgress?.({ type: 'retry', message: describeRetry(notice), step: continuationCount + 1 })
      );

      if (!response.ok) {
        const error = await response.json().catch(() => ({ error: { message: 'Unknown error' } }));
        return {
          message: '',
          error: `Gemini API error: ${error.error?.message || response.statusText}`
        };
      }

      const data = await response.json();
      const candidate = data.candidates?.[0];

      if (!candidate) {
        return {
          message: '',
          error: 'Gemini API returned no candidates. The request may have been blocked.'
        };
      }

      const parts: any[] = candidate.content?.parts || [];

      // Check if there are function calls in the response
      const functionCalls = parts.filter((part: any) => part.functionCall);
      const hasText = parts.some((part: any) => typeof part.text === 'string' && part.text.trim());

      // Empty turn handling. A non-STOP/MAX_TOKENS finishReason means the model
      // was blocked or cut off and retrying won't help, so surface it. An empty
      // STOP turn (zero output tokens) is a known flash-lite failure, typically
      // right after a tool result - it is deterministic, so re-issuing the same
      // request is useless. Instead nudge the model with an explicit instruction
      // to produce output, up to MAX_EMPTY_RETRIES times.
      if (functionCalls.length === 0 && !hasText) {
        const finishReason = candidate.finishReason;
        if (finishReason && finishReason !== 'STOP' && finishReason !== 'MAX_TOKENS') {
          return {
            message: '',
            error: `Gemini stopped without producing output (finishReason: ${finishReason}).`
          };
        }
        if (emptyRetries < MAX_EMPTY_RETRIES) {
          emptyRetries++;
          onProgress?.({
            type: 'continuation',
            message: `Empty response from Gemini, nudging for output (${emptyRetries}/${MAX_EMPTY_RETRIES})...`,
            step: continuationCount + 1
          });
          // Change the input so the retry isn't identical. Append the nudge to
          // the trailing user turn (the function response) to respect Gemini's
          // user/model alternation, falling back to a fresh user turn otherwise.
          const last = contents[contents.length - 1];
          const alreadyNudged =
            last?.role === 'user' &&
            last.parts?.some((p: any) => p.text === EMPTY_RESPONSE_NUDGE);
          if (last?.role === 'user' && !alreadyNudged) {
            last.parts.push({ text: EMPTY_RESPONSE_NUDGE });
          } else if (last?.role !== 'user') {
            contents.push({ role: 'user', parts: [{ text: EMPTY_RESPONSE_NUDGE }] });
          }
          continue;
        }
        // Out of retries: return whatever was accumulated, or an error if nothing.
        if (allFileOperations.length === 0 && messagesParts.length === 0) {
          return {
            message: '',
            error: 'Gemini repeatedly returned an empty response. Please try again or switch models.'
          };
        }
        break;
      }
      emptyRetries = 0;

      if (functionCalls.length > 0) {
        // Thinking models (gemini-2.5+) routinely emit explanatory text and a
        // ```json fileOperations block in the SAME turn as a tool call. Extract
        // and surface that text now, otherwise it (and any file operations) are
        // silently dropped because this branch returns to the API loop.
        const turnText = parts
          .filter((part: any) => typeof part.text === 'string')
          .map((part: any) => part.text)
          .join('\n');

        if (turnText.trim()) {
          const parsedTurn = parseAgentResponse(turnText);
          if (onProgress) {
            // Panel displays and executes incrementally; don't also accumulate
            // it into the final return, or it gets shown/executed twice.
            onProgress({
              type: 'step_complete',
              message: `Step ${continuationCount + 1} complete`,
              step: continuationCount + 1,
              partialResponse: {
                message: parsedTurn.message,
                fileOperations: parsedTurn.fileOperations
              }
            });
          } else {
            if (parsedTurn.fileOperations && parsedTurn.fileOperations.length > 0) {
              allFileOperations.push(...parsedTurn.fileOperations);
            }
            if (parsedTurn.message) {
              messagesParts.push(parsedTurn.message);
            }
          }
        }

        // Add model message with function calls to history. Thinking models
        // (gemini-2.5+) attach a `thoughtSignature` to each function-call part
        // that MUST be echoed back, or the next request is rejected with
        // "Function call is missing a thought_signature". Echo any text parts
        // too so the model retains its own reasoning across the continuation.
        contents.push({
          role: 'model',
          parts: [
            ...parts
              .filter((p: any) => typeof p.text === 'string')
              .map((p: any) => ({ text: p.text })),
            ...functionCalls.map((p: any) => {
              const part: any = { functionCall: p.functionCall };
              if (p.thoughtSignature) part.thoughtSignature = p.thoughtSignature;
              return part;
            })
          ]
        });

        // Process function calls and build function responses
        const functionResponses: any[] = [];
        for (const part of functionCalls) {
          const call = part.functionCall;
          if (call.name === 'get_api_docs') {
            const docs = searchDocs(call.args?.topic);

            onProgress?.({
              type: 'tool_call',
              message: `Looking up documentation: "${call.args?.topic}"`,
              step: continuationCount + 1
            });

            functionResponses.push({
              functionResponse: {
                name: 'get_api_docs',
                response: { content: docs }
              }
            });
          } else if (call.name === 'get_file') {
            const filePath = call.args?.path;
            const fileContent = request.context.pluginFiles?.[filePath];

            onProgress?.({
              type: 'tool_call',
              message: `Reading file: "${filePath}"`,
              step: continuationCount + 1
            });

            functionResponses.push({
              functionResponse: {
                name: 'get_file',
                response: {
                  content: fileContent ?? `File not found: "${filePath}". Available files: ${Object.keys(request.context.pluginFiles || {}).join(', ')}`
                }
              }
            });
          } else if (call.name === 'get_compilation_errors') {
            onProgress?.({
              type: 'tool_call',
              message: 'Checking for compilation errors',
              step: continuationCount + 1
            });

            const report = getCompilationErrors
              ? await getCompilationErrors()
              : 'Compilation checking is not available.';

            functionResponses.push({
              functionResponse: {
                name: 'get_compilation_errors',
                response: { content: report }
              }
            });
          }
        }

        // Add function results as a user message
        contents.push({
          role: 'user',
          parts: functionResponses
        });

        // Continue the loop to get the next response
        continuationCount++;
        continue;
      }

      // Extract text content from response
      const assistantMessage = parts
        .filter((part: any) => typeof part.text === 'string')
        .map((part: any) => part.text)
        .join('\n');

      const parsed = parseAgentResponse(assistantMessage);

      // Check if response was truncated or has more steps
      const wasTruncated = candidate.finishReason === 'MAX_TOKENS';
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

        // Add the model's response to history
        contents.push({
          role: 'model',
          parts: [{ text: assistantMessage }]
        });

        // Ask to continue
        contents.push({
          role: 'user',
          parts: [{ text: 'Continue with the next step. Remember to set "hasMoreSteps": true if there are more steps after this one.' }]
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
  contents: any[]
): Promise<Response> {
  // Calculate dynamic max tokens based on input size and model limits
  const maxTokens = calculateMaxTokens(systemMessage, contents, model);

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`;

  return fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      system_instruction: { parts: [{ text: systemMessage }] },
      contents,
      tools: [{ functionDeclarations }],
      generationConfig: {
        maxOutputTokens: maxTokens
      }
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
