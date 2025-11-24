/**
 * Coding Agent Panel
 * Main UI controller for the AI coding assistant
 */

import * as monaco from 'monaco-editor';
import type { EditorPluginData } from '@client/utils/pluginEditorStorage.ts';
import type { Message, AgentRequest, AIProvider, FileOperation } from './types/codingAgent';
import { getAgentSettings, saveAgentSettings, getConversationHistory, saveConversationHistory, clearConversationHistory } from './agentStorage';
import { callOpenAI } from './aiProviders/openai';
import { callAnthropic } from './aiProviders/anthropic';
import { executeFileOperations, type AgentFileOperationsContext } from './agentFileOperations';
import type { StatusType } from './types';
import pluginApiTypes from '../plugin-types/index.d.ts?raw';

export class CodingAgentPanel {
  private panel: HTMLElement;
  private messagesContainer: HTMLElement;
  private inputTextarea: HTMLTextAreaElement;
  private sendButton: HTMLButtonElement;
  private previewButton: HTMLButtonElement;
  private settingsButton: HTMLButtonElement;
  private clearButton: HTMLButtonElement;
  private closeButton: HTMLButtonElement;
  private settingsModal: HTMLElement;
  private previewModal: HTMLElement;

  private currentPluginId: string | null = null;
  private messages: Message[] = [];
  private isProcessing = false;

  constructor(
    private getEditorContext: () => {
      plugin: EditorPluginData | null;
      pluginId: string | null;
      editor: monaco.editor.IStandaloneCodeEditor | null;
      editorModels: Map<string, monaco.editor.ITextModel>;
      modifiedFiles: Set<string>;
      currentFilePath: string | null;
      updateStatus: (message: string, type: StatusType) => void;
      renderFileTree: () => void;
      switchToFile: (path: string) => void;
    }
  ) {
    this.panel = document.getElementById('agent-panel')!;
    this.messagesContainer = document.getElementById('agent-messages')!;
    this.inputTextarea = document.getElementById('agent-input') as HTMLTextAreaElement;
    this.sendButton = document.getElementById('agent-send-btn') as HTMLButtonElement;
    this.previewButton = document.getElementById('agent-preview-btn') as HTMLButtonElement;
    this.settingsButton = document.getElementById('agent-settings-btn') as HTMLButtonElement;
    this.clearButton = document.getElementById('agent-clear-btn') as HTMLButtonElement;
    this.closeButton = document.getElementById('agent-close-btn') as HTMLButtonElement;
    this.settingsModal = document.getElementById('agent-settings-modal')!;
    this.previewModal = document.getElementById('agent-preview-modal')!;

    this.setupEventListeners();
    this.loadSettings();
  }

  private setupEventListeners(): void {
    // Send message
    this.sendButton.addEventListener('click', () => this.sendMessage());
    this.inputTextarea.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        this.sendMessage();
      }
    });

    // Update token count when user types
    this.inputTextarea.addEventListener('input', () => this.updateModelInfo());

    // Preview
    this.previewButton.addEventListener('click', () => this.showPreview());
    document.getElementById('agent-preview-close')!.addEventListener('click', () => this.closePreview());

    // Settings
    this.settingsButton.addEventListener('click', () => this.openSettings());
    document.getElementById('agent-settings-cancel')!.addEventListener('click', () => this.closeSettings());
    document.getElementById('agent-settings-save')!.addEventListener('click', () => this.saveSettings());

    // Clear conversation
    this.clearButton.addEventListener('click', () => this.clearConversation());

    // Close panel
    this.closeButton.addEventListener('click', () => this.hide());

    // Close modal on overlay click
    this.settingsModal.addEventListener('click', (e) => {
      if (e.target === this.settingsModal) {
        this.closeSettings();
      }
    });

    this.previewModal.addEventListener('click', (e) => {
      if (e.target === this.previewModal) {
        this.closePreview();
      }
    });

    // API key change listeners to show/hide fetch buttons
    const openaiKeyInput = document.getElementById('agent-openai-key') as HTMLInputElement;
    openaiKeyInput.addEventListener('input', () => {
      const fetchBtn = document.getElementById('agent-openai-fetch-models')!;
      fetchBtn.style.display = openaiKeyInput.value.trim() ? 'block' : 'none';
    });

    const anthropicKeyInput = document.getElementById('agent-anthropic-key') as HTMLInputElement;
    anthropicKeyInput.addEventListener('input', () => {
      const fetchBtn = document.getElementById('agent-anthropic-fetch-models')!;
      fetchBtn.style.display = anthropicKeyInput.value.trim() ? 'block' : 'none';
    });

    // Fetch models buttons
    document.getElementById('agent-openai-fetch-models')!.addEventListener('click', () => this.fetchOpenAIModels());
    document.getElementById('agent-anthropic-fetch-models')!.addEventListener('click', () => this.fetchAnthropicModels());
  }

  public show(): void {
    this.panel.style.display = 'flex';

    // Load conversation history for current plugin
    const context = this.getEditorContext();
    if (context.pluginId && context.pluginId !== this.currentPluginId) {
      this.currentPluginId = context.pluginId;
      this.loadConversationHistory();
    }

    // Update model and token info
    this.updateModelInfo();

    // Scroll to bottom after panel is visible
    // Use setTimeout to ensure the DOM has been updated and panel is rendered
    setTimeout(() => {
      this.scrollToBottom();
    }, 0);
  }

  public hide(): void {
    this.panel.style.display = 'none';
  }

  public toggle(): void {
    if (this.panel.style.display === 'none') {
      this.show();
    } else {
      this.hide();
    }
  }

  private loadConversationHistory(): void {
    if (!this.currentPluginId) {
      this.messages = [];
      this.renderMessages();
      return;
    }

    const history = getConversationHistory(this.currentPluginId);
    if (history) {
      this.messages = history.messages;
    } else {
      this.messages = [];
      // Add system message
      const settings = getAgentSettings();
      this.messages.push({
        id: crypto.randomUUID(),
        role: 'system',
        content: settings.systemPrompt,
        timestamp: Date.now()
      });
    }

    this.renderMessages();
  }

  private saveConversationToHistory(): void {
    if (!this.currentPluginId) return;

    saveConversationHistory({
      pluginId: this.currentPluginId,
      messages: this.messages,
      lastUpdated: Date.now()
    });
  }

  private async sendMessage(): Promise<void> {
    if (this.isProcessing) return;

    const prompt = this.inputTextarea.value.trim();
    if (!prompt) return;

    const context = this.getEditorContext();
    if (!context.plugin || !context.pluginId) {
      this.showError('No plugin loaded');
      return;
    }

    // Add user message
    const userMessage: Message = {
      id: crypto.randomUUID(),
      role: 'user',
      content: prompt,
      timestamp: Date.now()
    };
    this.messages.push(userMessage);
    this.renderMessages();
    this.saveConversationToHistory();

    // Clear input
    this.inputTextarea.value = '';

    // Add loading message
    const loadingMessage: Message = {
      id: 'loading-' + Date.now(),
      role: 'assistant',
      content: '',
      timestamp: Date.now(),
      isLoading: true
    };
    this.messages.push(loadingMessage);
    this.renderMessages();

    // Set processing state
    this.isProcessing = true;
    this.sendButton.disabled = true;
    this.sendButton.textContent = 'Processing...';

    try {
      // Build request - always include all context
      const settings = getAgentSettings();
      const request: AgentRequest = {
        prompt,
        context: {
          currentFile: context.currentFilePath || undefined,
          currentFileContent: context.currentFilePath && context.plugin.files[context.currentFilePath]
            ? context.plugin.files[context.currentFilePath].content
            : undefined,
          pluginFiles: Object.fromEntries(
            Object.entries(context.plugin.files).map(([path, file]) => [path, file.content])
          ),
          selectedText: this.getSelectedText(context.editor),
          cursorPosition: this.getCursorPosition(context.editor),
          pluginApiDocs: await this.getPluginApiDocs()
        },
        conversationHistory: this.messages.filter(m => m.role !== 'user' || m.id !== userMessage.id)
      };

      // Call AI provider
      const provider = settings.defaultProvider;
      const response = provider === 'openai'
        ? await callOpenAI(request, settings.openaiApiKey || '', settings.defaultOpenAIModel)
        : await callAnthropic(request, settings.anthropicApiKey || '', settings.defaultAnthropicModel);

      // Remove loading message
      this.messages = this.messages.filter(m => !m.isLoading);

      if (response.error) {
        this.showError(response.error);
        return;
      }

      // Add assistant message with file operations metadata
      const assistantMessage: Message = {
        id: crypto.randomUUID(),
        role: 'assistant',
        content: response.message,
        timestamp: Date.now(),
        fileOperations: response.fileOperations
      };
      this.messages.push(assistantMessage);
      this.renderMessages();
      this.saveConversationToHistory();

      // Execute file operations if any
      if (response.fileOperations && response.fileOperations.length > 0) {
        const fileOpsContext: AgentFileOperationsContext = {
          plugin: context.plugin,
          pluginId: context.pluginId,
          editorModels: context.editorModels,
          modifiedFiles: context.modifiedFiles,
          currentFilePath: context.currentFilePath,
          updateStatus: context.updateStatus,
          renderFileTree: context.renderFileTree,
          switchToFile: context.switchToFile,
          updateEditorModel: (path: string, content: string) => {
            const model = context.editorModels.get(path);
            if (model) {
              model.setValue(content);
            }
          }
        };

        const result = executeFileOperations(response.fileOperations, fileOpsContext);
        if (!result.success && result.errors.length > 0) {
          this.showError(`File operations failed:\n${result.errors.join('\n')}`);
        }
      }

    } catch (error) {
      this.showError(error instanceof Error ? error.message : 'Unknown error occurred');
    } finally {
      this.isProcessing = false;
      this.sendButton.disabled = false;
      this.sendButton.textContent = 'Send';
    }
  }

  private getSelectedText(editor: monaco.editor.IStandaloneCodeEditor | null): string | undefined {
    if (!editor) return undefined;
    const selection = editor.getSelection();
    if (!selection) return undefined;
    const model = editor.getModel();
    if (!model) return undefined;
    return model.getValueInRange(selection);
  }

  private getCursorPosition(editor: monaco.editor.IStandaloneCodeEditor | null): { line: number; column: number } | undefined {
    if (!editor) return undefined;
    const position = editor.getPosition();
    if (!position) return undefined;
    return { line: position.lineNumber, column: position.column };
  }

  private async getPluginApiDocs(): Promise<string> {
    // Return the actual PluginApi type definitions
    return pluginApiTypes;
  }

  private showError(message: string): void {
    const errorMessage: Message = {
      id: crypto.randomUUID(),
      role: 'assistant',
      content: `Error: ${message}`,
      timestamp: Date.now()
    };
    this.messages.push(errorMessage);
    this.renderMessages();
  }

  private renderMessages(): void {
    this.messagesContainer.innerHTML = '';

    for (const message of this.messages) {
      if (message.role === 'system') continue; // Don't show system messages

      const messageEl = document.createElement('div');
      messageEl.className = `agent-message agent-message-${message.role}`;

      // Show loading animation
      if (message.isLoading) {
        const loadingEl = document.createElement('div');
        loadingEl.className = 'agent-message-loading';
        loadingEl.innerHTML = '<span class="dot"></span><span class="dot"></span><span class="dot"></span>';
        messageEl.appendChild(loadingEl);
        this.messagesContainer.appendChild(messageEl);
        continue;
      }

      const contentEl = document.createElement('div');
      contentEl.className = 'agent-message-content';

      // Simple markdown-like formatting
      const formattedContent = this.formatMessageContent(message.content);
      contentEl.innerHTML = formattedContent;

      messageEl.appendChild(contentEl);

      // Add file operations display if present
      if (message.fileOperations && message.fileOperations.length > 0) {
        const fileOpsEl = this.renderFileOperations(message.fileOperations);
        messageEl.appendChild(fileOpsEl);
      }

      this.messagesContainer.appendChild(messageEl);
    }

    // Scroll to bottom after rendering
    // Use requestAnimationFrame to ensure the DOM has been updated
    requestAnimationFrame(() => {
      this.scrollToBottom();
    });
  }

  private scrollToBottom(): void {
    this.messagesContainer.scrollTop = this.messagesContainer.scrollHeight;
  }

  private renderFileOperations(operations: FileOperation[]): HTMLElement {
    const container = document.createElement('div');
    container.className = 'agent-file-operations';

    for (const op of operations) {
      const opEl = document.createElement('div');
      opEl.className = `agent-file-op agent-file-op-${op.type}`;

      const iconSpan = document.createElement('span');
      iconSpan.className = 'agent-file-op-icon';

      if (op.type === 'create') {
        iconSpan.textContent = '+';
        iconSpan.style.color = '#4ade80'; // green
      } else if (op.type === 'modify') {
        iconSpan.textContent = '~';
        iconSpan.style.color = '#60a5fa'; // blue
      } else if (op.type === 'delete') {
        iconSpan.textContent = '-';
        iconSpan.style.color = '#f87171'; // red
      } else if (op.type === 'createDir') {
        iconSpan.textContent = '📁+';
        iconSpan.style.color = '#4ade80'; // green
      } else if (op.type === 'deleteDir') {
        iconSpan.textContent = '📁-';
        iconSpan.style.color = '#f87171'; // red
      }

      const pathSpan = document.createElement('span');
      pathSpan.className = 'agent-file-op-path';
      pathSpan.textContent = op.path;

      // Add tooltip with content on hover
      if (op.content && (op.type === 'create' || op.type === 'modify')) {
        pathSpan.title = op.content;
        pathSpan.style.cursor = 'help';
      }

      opEl.appendChild(iconSpan);
      opEl.appendChild(pathSpan);

      container.appendChild(opEl);
    }

    return container;
  }


  private formatMessageContent(content: string): string {
    // Escape HTML
    let formatted = content
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');

    // Format code blocks
    formatted = formatted.replace(/```(\w+)?\n([\s\S]*?)```/g, (_, _lang, code) => {
      return `<pre><code>${code.trim()}</code></pre>`;
    });

    // Format inline code
    formatted = formatted.replace(/`([^`]+)`/g, '<code>$1</code>');

    // Format bold
    formatted = formatted.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');

    // Format line breaks
    formatted = formatted.replace(/\n/g, '<br>');

    return formatted;
  }

  private clearConversation(): void {
    if (!confirm('Clear conversation history?')) return;

    if (this.currentPluginId) {
      clearConversationHistory(this.currentPluginId);
    }

    // Re-add system message
    const settings = getAgentSettings();
    this.messages = [{
      id: crypto.randomUUID(),
      role: 'system',
      content: settings.systemPrompt,
      timestamp: Date.now()
    }];

    this.renderMessages();
    this.saveConversationToHistory();
  }

  private openSettings(): void {
    this.loadSettings();
    this.settingsModal.style.display = 'flex';
  }

  private closeSettings(): void {
    this.settingsModal.style.display = 'none';
  }

  private loadSettings(): void {
    const settings = getAgentSettings();

    (document.getElementById('agent-provider') as HTMLSelectElement).value = settings.defaultProvider;

    const openaiKeyInput = document.getElementById('agent-openai-key') as HTMLInputElement;
    const anthropicKeyInput = document.getElementById('agent-anthropic-key') as HTMLInputElement;

    openaiKeyInput.value = settings.openaiApiKey || '';
    anthropicKeyInput.value = settings.anthropicApiKey || '';

    // Show fetch buttons if keys are present
    const openaiFetchBtn = document.getElementById('agent-openai-fetch-models')!;
    const anthropicFetchBtn = document.getElementById('agent-anthropic-fetch-models')!;
    openaiFetchBtn.style.display = settings.openaiApiKey ? 'block' : 'none';
    anthropicFetchBtn.style.display = settings.anthropicApiKey ? 'block' : 'none';

    // Show model containers and set saved models if available
    if (settings.defaultOpenAIModel) {
      const openaiModelContainer = document.getElementById('agent-openai-model-container')!;
      openaiModelContainer.style.display = 'block';
      const openaiModelSelect = document.getElementById('agent-openai-model') as HTMLSelectElement;
      openaiModelSelect.innerHTML = `<option value="${settings.defaultOpenAIModel}">${settings.defaultOpenAIModel}</option>`;
      openaiModelSelect.value = settings.defaultOpenAIModel;
    }

    if (settings.defaultAnthropicModel) {
      const anthropicModelContainer = document.getElementById('agent-anthropic-model-container')!;
      anthropicModelContainer.style.display = 'block';
      const anthropicModelSelect = document.getElementById('agent-anthropic-model') as HTMLSelectElement;
      anthropicModelSelect.innerHTML = `<option value="${settings.defaultAnthropicModel}">${settings.defaultAnthropicModel}</option>`;
      anthropicModelSelect.value = settings.defaultAnthropicModel;
    }
  }

  private saveSettings(): void {
    const settings = {
      defaultProvider: (document.getElementById('agent-provider') as HTMLSelectElement).value as AIProvider,
      openaiApiKey: (document.getElementById('agent-openai-key') as HTMLInputElement).value,
      defaultOpenAIModel: (document.getElementById('agent-openai-model') as HTMLSelectElement).value,
      anthropicApiKey: (document.getElementById('agent-anthropic-key') as HTMLInputElement).value,
      defaultAnthropicModel: (document.getElementById('agent-anthropic-model') as HTMLSelectElement).value
    };

    saveAgentSettings(settings);
    this.closeSettings();

    const context = this.getEditorContext();
    context.updateStatus('Agent settings saved', 'success');
  }

  private async fetchOpenAIModels(): Promise<void> {
    const apiKey = (document.getElementById('agent-openai-key') as HTMLInputElement).value.trim();
    if (!apiKey) {
      alert('Please enter your OpenAI API key first');
      return;
    }

    const fetchBtn = document.getElementById('agent-openai-fetch-models') as HTMLButtonElement;
    fetchBtn.disabled = true;
    fetchBtn.textContent = 'Fetching...';

    try {
      const response = await fetch('https://api.openai.com/v1/models', {
        headers: {
          'Authorization': `Bearer ${apiKey}`
        }
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch models: ${response.statusText}`);
      }

      const data = await response.json();
      const gptModels = data.data
        .filter((model: any) => model.id.startsWith('gpt-'))
        .map((model: any) => model.id)
        .sort();

      if (gptModels.length === 0) {
        throw new Error('No GPT models found');
      }

      // Populate dropdown
      const modelSelect = document.getElementById('agent-openai-model') as HTMLSelectElement;
      modelSelect.innerHTML = gptModels
        .map((model: string) => `<option value="${model}">${model}</option>`)
        .join('');

      // Select gpt-4-turbo if available, otherwise first model
      const defaultModel = gptModels.find((m: string) => m === 'gpt-4-turbo') || gptModels[0];
      modelSelect.value = defaultModel;

      // Show model container
      const modelContainer = document.getElementById('agent-openai-model-container')!;
      modelContainer.style.display = 'block';

      const context = this.getEditorContext();
      context.updateStatus(`Found ${gptModels.length} OpenAI models`, 'success');
    } catch (error) {
      alert(`Failed to fetch OpenAI models: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      fetchBtn.disabled = false;
      fetchBtn.textContent = 'Fetch Models';
    }
  }

  private async fetchAnthropicModels(): Promise<void> {
    const apiKey = (document.getElementById('agent-anthropic-key') as HTMLInputElement).value.trim();
    if (!apiKey) {
      alert('Please enter your Anthropic API key first');
      return;
    }

    const fetchBtn = document.getElementById('agent-anthropic-fetch-models') as HTMLButtonElement;
    fetchBtn.disabled = true;
    fetchBtn.textContent = 'Fetching...';

    try {
      // Anthropic doesn't have a public models endpoint, so we'll verify the key works
      // by making a minimal API call
      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01'
        },
        body: JSON.stringify({
          model: 'claude-3-haiku-20240307',
          max_tokens: 1,
          messages: [{ role: 'user', content: 'test' }]
        })
      });

      if (!response.ok) {
        throw new Error(`Invalid API key: ${response.statusText}`);
      }

      // Use known Claude 3 models
      const claudeModels = [
        'claude-3-5-sonnet-20241022',
        'claude-3-5-sonnet-20240620',
        'claude-3-opus-20240229',
        'claude-3-sonnet-20240229',
        'claude-3-haiku-20240307'
      ];

      // Populate dropdown
      const modelSelect = document.getElementById('agent-anthropic-model') as HTMLSelectElement;
      modelSelect.innerHTML = claudeModels
        .map((model: string) => `<option value="${model}">${model}</option>`)
        .join('');

      // Select claude-3-5-sonnet as default
      modelSelect.value = 'claude-3-5-sonnet-20241022';

      // Show model container
      const modelContainer = document.getElementById('agent-anthropic-model-container')!;
      modelContainer.style.display = 'block';

      const context = this.getEditorContext();
      context.updateStatus(`Anthropic API key verified`, 'success');
    } catch (error) {
      alert(`Failed to verify Anthropic API key: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      fetchBtn.disabled = false;
      fetchBtn.textContent = 'Fetch Models';
    }
  }

  private async showPreview(): Promise<void> {
    const prompt = this.inputTextarea.value.trim();
    if (!prompt) {
      alert('Please enter a prompt first');
      return;
    }

    const context = this.getEditorContext();
    if (!context.plugin || !context.pluginId) {
      alert('No plugin loaded');
      return;
    }

    const settings = getAgentSettings();

    // Build context info
    const currentFileContent = context.currentFilePath && context.plugin.files[context.currentFilePath]
      ? context.plugin.files[context.currentFilePath].content
      : undefined;

    const pluginFiles = Object.fromEntries(
      Object.entries(context.plugin.files).map(([path, file]) => [path, file.content])
    );

    const selectedText = this.getSelectedText(context.editor);
    const cursorPosition = this.getCursorPosition(context.editor);
    const pluginApiDocs = await this.getPluginApiDocs();

    // Build context preview
    let contextPreview = '';

    if (context.currentFilePath) {
      contextPreview += `Current File: ${context.currentFilePath}\n`;
      contextPreview += `File Content (${currentFileContent?.length || 0} chars):\n${currentFileContent ? currentFileContent.substring(0, 500) + (currentFileContent.length > 500 ? '...' : '') : 'N/A'}\n\n`;
    }

    if (selectedText) {
      contextPreview += `Selected Text (${selectedText.length} chars):\n${selectedText.substring(0, 200) + (selectedText.length > 200 ? '...' : '')}\n\n`;
    }

    if (cursorPosition) {
      contextPreview += `Cursor Position: Line ${cursorPosition.line}, Column ${cursorPosition.column}\n\n`;
    }

    contextPreview += `Plugin Files (${Object.keys(pluginFiles).length} files):\n`;
    let totalPluginSize = 0;
    for (const [path, content] of Object.entries(pluginFiles)) {
      totalPluginSize += content.length;
      contextPreview += `  - ${path} (${content.length} chars)\n`;
    }
    contextPreview += `Total Plugin Content: ${totalPluginSize} chars\n\n`;

    contextPreview += `PluginApi Documentation: ${pluginApiDocs.length} chars\n`;

    // Build history preview
    const historyMessages = this.messages.filter(m => m.role !== 'user' || m.content !== prompt);
    let historyPreview = '';
    let totalHistorySize = 0;
    for (const msg of historyMessages) {
      totalHistorySize += msg.content.length;
      historyPreview += `[${msg.role}] ${msg.content.substring(0, 100)}${msg.content.length > 100 ? '...' : ''}\n\n`;
    }

    // Calculate total size
    const totalChars = settings.systemPrompt.length + prompt.length +
                      totalPluginSize + pluginApiDocs.length +
                      totalHistorySize +
                      (currentFileContent?.length || 0) +
                      (selectedText?.length || 0);
    const estimatedTokens = Math.ceil(totalChars / 4);

    // Update preview modal
    document.getElementById('preview-total-chars')!.textContent = totalChars.toLocaleString();
    document.getElementById('preview-estimated-tokens')!.textContent = estimatedTokens.toLocaleString();
    document.getElementById('preview-system-prompt')!.textContent = settings.systemPrompt;
    document.getElementById('preview-user-prompt')!.textContent = prompt;
    document.getElementById('preview-context')!.textContent = contextPreview;
    document.getElementById('preview-history-count')!.textContent = historyMessages.length.toString();
    document.getElementById('preview-history')!.textContent = historyPreview || 'No conversation history';

    this.previewModal.style.display = 'flex';
  }

  private closePreview(): void {
    this.previewModal.style.display = 'none';
  }

  private async updateModelInfo(): Promise<void> {
    const settings = getAgentSettings();
    const context = this.getEditorContext();

    // Get selected model
    const model = settings.defaultProvider === 'openai'
      ? settings.defaultOpenAIModel
      : settings.defaultAnthropicModel;

    // Calculate token estimate
    const prompt = this.inputTextarea.value.trim();
    if (!context.plugin || !prompt) {
      document.getElementById('agent-info')!.style.display = 'none';
      return;
    }

    const currentFileContent = context.currentFilePath && context.plugin.files[context.currentFilePath]
      ? context.plugin.files[context.currentFilePath].content
      : '';

    const pluginFilesSize = Object.values(context.plugin.files)
      .reduce((sum, file) => sum + file.content.length, 0);

    const selectedText = this.getSelectedText(context.editor) || '';
    const pluginApiDocs = await this.getPluginApiDocs();
    const historySize = this.messages.reduce((sum, msg) => sum + msg.content.length, 0);

    const totalChars = settings.systemPrompt.length + prompt.length +
                      pluginFilesSize + pluginApiDocs.length +
                      historySize + currentFileContent.length + selectedText.length;

    const estimatedTokens = Math.ceil(totalChars / 4);

    // Update display
    const modelInfo = document.getElementById('agent-model-info')!;
    const tokenInfo = document.getElementById('agent-token-info')!;

    modelInfo.textContent = `Model: ${model || 'Not selected'}`;
    tokenInfo.textContent = `~${estimatedTokens.toLocaleString()} tokens`;

    document.getElementById('agent-info')!.style.display = 'block';
  }

  public onPluginChanged(pluginId: string | null): void {
    if (pluginId !== this.currentPluginId) {
      this.currentPluginId = pluginId;
      this.loadConversationHistory();
    }
  }
}
