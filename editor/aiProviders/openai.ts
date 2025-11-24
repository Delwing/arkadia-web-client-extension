/**
 * OpenAI API Integration
 */

import type { AgentRequest, AgentResponse } from '../types/codingAgent';

export async function callOpenAI(
  request: AgentRequest,
  apiKey: string,
  model: string
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

    const messages = [
      ...(systemMessage ? [{
        role: 'system' as const,
        content: systemMessage.content
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

    // GPT-4o and newer models use max_completion_tokens instead of max_tokens
    const useNewTokenParam = model.includes('gpt-4o') ||
                             model.includes('gpt-5') ||
                             model.includes('o1') ||
                             model.includes('o3');

    const requestBody: any = {
      model,
      messages
    };

    if (useNewTokenParam) {
      requestBody.max_completion_tokens = 4000;
    } else {
      requestBody.max_tokens = 4000;
    }

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify(requestBody)
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: { message: 'Unknown error' } }));
      return {
        message: '',
        error: `OpenAI API error: ${error.error?.message || response.statusText}`
      };
    }

    const data = await response.json();
    const assistantMessage = data.choices[0]?.message?.content || '';

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
