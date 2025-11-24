/**
 * Anthropic Claude API Integration
 */

import type { AgentRequest, AgentResponse } from '../types/codingAgent';

export async function callAnthropic(
  request: AgentRequest,
  apiKey: string,
  model: string
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
    const userMessages = [];

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

    // Add current request
    userMessages.push({
      role: 'user',
      content: buildPrompt(request)
    });

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model,
        max_tokens: 4096,
        system: systemMessage,
        messages: userMessages
      })
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: { message: 'Unknown error' } }));
      return {
        message: '',
        error: `Anthropic API error: ${error.error?.message || response.statusText}`
      };
    }

    const data = await response.json();
    const assistantMessage = data.content[0]?.text || '';

    return parseAgentResponse(assistantMessage);
  } catch (error) {
    return {
      message: '',
      error: `Request failed: ${error instanceof Error ? error.message : 'Unknown error'}`
    };
  }
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

  if (request.context.pluginApiDocs) {
    prompt += `\n\nPluginApi documentation:\n${request.context.pluginApiDocs}`;
  }

  return prompt;
}

function parseAgentResponse(content: string): AgentResponse {
  const response: AgentResponse = {
    message: '',
    fileOperations: []
  };

  // First, try to parse as pure JSON (AI responded with just JSON object)
  const trimmedContent = content.trim();
  if (trimmedContent.startsWith('{')) {
    try {
      const parsed = JSON.parse(trimmedContent);
      if (parsed.fileOperations && Array.isArray(parsed.fileOperations)) {
        response.fileOperations = parsed.fileOperations;
        // Generate a helpful message describing the operations
        const operationsSummary = parsed.fileOperations.map((op: any) =>
          `${op.type} ${op.path}`
        ).join(', ');
        response.message = `Executing file operations: ${operationsSummary}`;
        return response;
      }
    } catch (e) {
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
        // Remove the JSON block from the message content
        messageContent = messageContent.replace(match[0], '').trim();
      }
    } catch (e) {
      // Not valid JSON, ignore
    }
  }

  // Set message to the content without JSON blocks
  response.message = messageContent;

  return response;
}
