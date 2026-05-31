/**
 * Coding Agent Panel
 * Main UI controller for the AI coding assistant
 */

import * as monaco from 'monaco-editor';
import type { EditorPluginData } from '@client/utils/pluginEditorStorage.ts';
import type { Message, AgentRequest, AIProvider, FileOperation, AgentProgress, AttachedFile } from './types/codingAgent';
import { getAgentSettings, saveAgentSettings, getConversationHistory, saveConversationHistory, clearConversationHistory } from './agentStorage';
import { callOpenAI } from './aiProviders/openai';
import { callAnthropic } from './aiProviders/anthropic';
import { callGemini } from './aiProviders/gemini';
import { executeFileOperations, type AgentFileOperationsContext } from './agentFileOperations';
import { getPluginCompilationErrors } from './agentDiagnostics';
import type { StatusType } from './types';

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

  private attachButton: HTMLButtonElement;
  private fileInput: HTMLInputElement;
  private attachmentsContainer: HTMLElement;
  private attachedFiles: AttachedFile[] = [];

  /** The last turn's input, kept so a failed request can be retried. */
  private lastTurn: { prompt: string; attachedFiles: AttachedFile[]; userMessageId: string } | null = null;

  /** Reject attachments larger than this to avoid blowing the model context. */
  private static readonly MAX_ATTACHMENT_BYTES = 2 * 1024 * 1024;

  /** Per-provider model lists are fetched lazily on first dropdown open, then cached for the session. */
  private modelsLoaded: Record<AIProvider, boolean> = { openai: false, anthropic: false, gemini: false };
  /** Guards against firing overlapping fetches while one is already in flight. */
  private modelsLoading: Record<AIProvider, boolean> = { openai: false, anthropic: false, gemini: false };

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
    this.attachButton = document.getElementById('agent-attach-btn') as HTMLButtonElement;
    this.fileInput = document.getElementById('agent-file-input') as HTMLInputElement;
    this.attachmentsContainer = document.getElementById('agent-attachments')!;

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

    // Attach files
    this.attachButton.addEventListener('click', () => this.fileInput.click());
    this.fileInput.addEventListener('change', () => this.handleFileSelection());

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

    // When an API key changes, reveal its model dropdown and invalidate any cached
    // model list so the next dropdown open re-fetches with the new key.
    const wireKeyInput = (provider: AIProvider, keyId: string, containerId: string) => {
      const keyInput = document.getElementById(keyId) as HTMLInputElement;
      keyInput.addEventListener('input', () => {
        this.modelsLoaded[provider] = false;
        document.getElementById(containerId)!.style.display = keyInput.value.trim() ? 'block' : 'none';
      });
    };
    wireKeyInput('openai', 'agent-openai-key', 'agent-openai-model-container');
    wireKeyInput('anthropic', 'agent-anthropic-key', 'agent-anthropic-model-container');
    wireKeyInput('gemini', 'agent-gemini-key', 'agent-gemini-model-container');

    // Fetch the model list lazily the first time each dropdown is opened, instead of
    // making the user click a separate "Fetch Models" button. Cached for the session.
    const wireModelSelect = (selectId: string, fetchFn: () => void) => {
      const select = document.getElementById(selectId) as HTMLSelectElement;
      select.addEventListener('mousedown', fetchFn);
      select.addEventListener('focus', fetchFn);
    };
    wireModelSelect('agent-openai-model', () => this.fetchOpenAIModels());
    wireModelSelect('agent-anthropic-model', () => this.fetchAnthropicModels());
    wireModelSelect('agent-gemini-model', () => this.fetchGeminiModels());
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
    this.updateCurrentModelBadge();
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

    // Snapshot and clear attachments for this turn
    const attachedFiles = this.attachedFiles;
    this.attachedFiles = [];
    this.renderAttachments();

    // Add user message, noting any attachments so the conversation reflects them
    const attachmentNote = attachedFiles.length > 0
      ? `\n\n_Attached: ${attachedFiles.map(f => f.name).join(', ')}_`
      : '';
    const userMessage: Message = {
      id: crypto.randomUUID(),
      role: 'user',
      content: prompt + attachmentNote,
      timestamp: Date.now()
    };
    this.messages.push(userMessage);
    this.renderMessages();
    this.saveConversationToHistory();

    // Clear input
    this.inputTextarea.value = '';

    await this.processTurn(prompt, attachedFiles, userMessage.id);
  }

  /** Retry the most recent failed turn with the same prompt and attachments. */
  private async retryLastTurn(): Promise<void> {
    if (this.isProcessing || !this.lastTurn) return;

    // Drop the error message(s) so they don't linger in the conversation/history.
    this.messages = this.messages.filter(m => !m.isError);
    this.renderMessages();

    const { prompt, attachedFiles, userMessageId } = this.lastTurn;
    await this.processTurn(prompt, attachedFiles, userMessageId);
  }

  /**
   * Runs one agent turn (provider call + response handling) for an already-pushed
   * user message. Extracted so it can be re-run by retryLastTurn after a failure.
   */
  private async processTurn(prompt: string, attachedFiles: AttachedFile[], userMessageId: string): Promise<void> {
    const context = this.getEditorContext();
    if (!context.plugin || !context.pluginId) {
      this.showError('No plugin loaded');
      return;
    }

    // Remember this turn so it can be retried if the request fails.
    this.lastTurn = { prompt, attachedFiles, userMessageId };

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
          attachedFiles: attachedFiles.length > 0 ? attachedFiles : undefined
          // Note: pluginApiDocs removed - AI uses get_api_docs tool instead
        },
        conversationHistory: this.messages.filter(m => m.role !== 'user' || m.id !== userMessageId)
      };

      // Progress callback to update loading message and show partial responses
      const onProgress = (progress: AgentProgress) => {
        // Handle step_complete - show partial response immediately
        if (progress.type === 'step_complete' && progress.partialResponse) {
          // Remove loading message temporarily
          this.messages = this.messages.filter(m => !m.isLoading);

          // Add the partial response as a message
          if (progress.partialResponse.message) {
            const partialMessage: Message = {
              id: crypto.randomUUID(),
              role: 'assistant',
              content: progress.partialResponse.message,
              timestamp: Date.now(),
              fileOperations: progress.partialResponse.fileOperations
            };
            this.messages.push(partialMessage);
          }

          // Execute file operations immediately if any
          if (progress.partialResponse.fileOperations && progress.partialResponse.fileOperations.length > 0) {
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
            executeFileOperations(progress.partialResponse.fileOperations, fileOpsContext);
          }

          // Add loading message back for next step
          this.messages.push({
            id: crypto.randomUUID(),
            role: 'assistant',
            content: 'Processing...',
            timestamp: Date.now(),
            isLoading: true
          });

          this.renderMessages();
          this.saveConversationToHistory();
          return;
        }

        // Update loading message for other progress types
        const loadingMsg = this.messages.find(m => m.isLoading);
        if (loadingMsg) {
          loadingMsg.content = `Processing... ${progress.message}`;
          this.renderMessages();
        }
      };

      // Lets the AI check its work against the editor's TypeScript diagnostics
      const pluginId = context.pluginId;
      const getCompilationErrors = () => getPluginCompilationErrors(pluginId);

      // Call AI provider
      const provider = settings.defaultProvider;
      let response;
      if (provider === 'openai') {
        response = await callOpenAI(request, settings.openaiApiKey || '', settings.defaultOpenAIModel, onProgress, getCompilationErrors);
      } else if (provider === 'anthropic') {
        response = await callAnthropic(request, settings.anthropicApiKey || '', settings.defaultAnthropicModel, onProgress, getCompilationErrors);
      } else {
        response = await callGemini(request, settings.geminiApiKey || '', settings.defaultGeminiModel, onProgress, getCompilationErrors);
      }

      // Remove loading message
      this.messages = this.messages.filter(m => !m.isLoading);

      if (response.error) {
        this.showError(response.error, true);
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
      this.showError(error instanceof Error ? error.message : 'Unknown error occurred', true);
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

  private async handleFileSelection(): Promise<void> {
    const files = this.fileInput.files;
    if (!files || files.length === 0) return;

    for (const file of Array.from(files)) {
      if (file.size > CodingAgentPanel.MAX_ATTACHMENT_BYTES) {
        const limitMb = Math.round(CodingAgentPanel.MAX_ATTACHMENT_BYTES / (1024 * 1024));
        alert(`"${file.name}" is too large to attach (max ${limitMb} MB).`);
        continue;
      }

      // Skip duplicates by name
      if (this.attachedFiles.some(f => f.name === file.name)) continue;

      try {
        const content = await file.text();
        this.attachedFiles.push({ name: file.name, content });
      } catch (_e) {
        alert(`Failed to read "${file.name}". It may not be a text file.`);
      }
    }

    // Reset input so selecting the same file again re-triggers change
    this.fileInput.value = '';

    this.renderAttachments();
    this.updateModelInfo();
  }

  private removeAttachment(name: string): void {
    this.attachedFiles = this.attachedFiles.filter(f => f.name !== name);
    this.renderAttachments();
    this.updateModelInfo();
  }

  private renderAttachments(): void {
    this.attachmentsContainer.innerHTML = '';

    for (const file of this.attachedFiles) {
      const chip = document.createElement('div');
      chip.className = 'agent-attachment';

      const nameSpan = document.createElement('span');
      nameSpan.className = 'agent-attachment-name';
      nameSpan.textContent = file.name;
      nameSpan.title = file.name;

      const sizeSpan = document.createElement('span');
      sizeSpan.className = 'agent-attachment-size';
      sizeSpan.textContent = `${file.content.length.toLocaleString()} chars`;

      const removeBtn = document.createElement('button');
      removeBtn.className = 'agent-attachment-remove';
      removeBtn.textContent = '×';
      removeBtn.title = 'Remove attachment';
      removeBtn.addEventListener('click', () => this.removeAttachment(file.name));

      chip.appendChild(nameSpan);
      chip.appendChild(sizeSpan);
      chip.appendChild(removeBtn);
      this.attachmentsContainer.appendChild(chip);
    }
  }

  private showError(message: string, retryable = false): void {
    const errorMessage: Message = {
      id: crypto.randomUUID(),
      role: 'assistant',
      content: `Error: ${message}`,
      timestamp: Date.now(),
      isError: retryable
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

      // Offer a retry on the most recent retryable error
      if (message.isError && message === this.messages[this.messages.length - 1] && this.lastTurn) {
        const retryBtn = document.createElement('button');
        retryBtn.className = 'agent-retry-btn';
        retryBtn.textContent = '↻ Retry';
        retryBtn.disabled = this.isProcessing;
        retryBtn.addEventListener('click', () => this.retryLastTurn());
        messageEl.appendChild(retryBtn);
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

    // Format code blocks - skip empty ones
    formatted = formatted.replace(/```(\w+)?\n([\s\S]*?)```/g, (_match, _lang, code) => {
      const trimmedCode = code.trim();
      if (!trimmedCode) {
        return ''; // Skip empty code blocks
      }
      return `<pre><code>${trimmedCode}</code></pre>`;
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
    const geminiKeyInput = document.getElementById('agent-gemini-key') as HTMLInputElement;

    openaiKeyInput.value = settings.openaiApiKey || '';
    anthropicKeyInput.value = settings.anthropicApiKey || '';
    geminiKeyInput.value = settings.geminiApiKey || '';

    // Show each model dropdown whenever its key is present. The full model list is
    // fetched lazily on first open; until then the dropdown shows the saved model.
    const seedModelSelect = (keyPresent: boolean, containerId: string, selectId: string, savedModel: string) => {
      document.getElementById(containerId)!.style.display = keyPresent ? 'block' : 'none';
      if (savedModel) {
        const select = document.getElementById(selectId) as HTMLSelectElement;
        select.innerHTML = `<option value="${savedModel}">${savedModel}</option>`;
        select.value = savedModel;
      }
    };
    seedModelSelect(!!settings.openaiApiKey, 'agent-openai-model-container', 'agent-openai-model', settings.defaultOpenAIModel);
    seedModelSelect(!!settings.anthropicApiKey, 'agent-anthropic-model-container', 'agent-anthropic-model', settings.defaultAnthropicModel);
    seedModelSelect(!!settings.geminiApiKey, 'agent-gemini-model-container', 'agent-gemini-model', settings.defaultGeminiModel);
  }

  private saveSettings(): void {
    const settings = {
      defaultProvider: (document.getElementById('agent-provider') as HTMLSelectElement).value as AIProvider,
      openaiApiKey: (document.getElementById('agent-openai-key') as HTMLInputElement).value,
      defaultOpenAIModel: (document.getElementById('agent-openai-model') as HTMLSelectElement).value,
      anthropicApiKey: (document.getElementById('agent-anthropic-key') as HTMLInputElement).value,
      defaultAnthropicModel: (document.getElementById('agent-anthropic-model') as HTMLSelectElement).value,
      geminiApiKey: (document.getElementById('agent-gemini-key') as HTMLInputElement).value,
      defaultGeminiModel: (document.getElementById('agent-gemini-model') as HTMLSelectElement).value
    };

    saveAgentSettings(settings);
    this.closeSettings();
    this.updateCurrentModelBadge();
    this.updateModelInfo();

    const context = this.getEditorContext();
    context.updateStatus('Agent settings saved', 'success');
  }

  private async fetchOpenAIModels(): Promise<void> {
    // Fetch once per session; skip if already loaded, in flight, or no key yet.
    if (this.modelsLoaded.openai || this.modelsLoading.openai) return;
    const apiKey = (document.getElementById('agent-openai-key') as HTMLInputElement).value.trim();
    if (!apiKey) return;

    const modelSelect = document.getElementById('agent-openai-model') as HTMLSelectElement;
    const previous = modelSelect.value;
    this.modelsLoading.openai = true;

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
      modelSelect.innerHTML = gptModels
        .map((model: string) => `<option value="${model}">${model}</option>`)
        .join('');

      // Keep the saved selection if it's still offered, else prefer gpt-4-turbo
      modelSelect.value = gptModels.includes(previous)
        ? previous
        : (gptModels.find((m: string) => m === 'gpt-4-turbo') || gptModels[0]);

      this.modelsLoaded.openai = true;
      const context = this.getEditorContext();
      context.updateStatus(`Found ${gptModels.length} OpenAI models`, 'success');
    } catch (error) {
      const context = this.getEditorContext();
      context.updateStatus(`Failed to fetch OpenAI models: ${error instanceof Error ? error.message : 'Unknown error'}`, 'error');
    } finally {
      this.modelsLoading.openai = false;
    }
  }

  private async fetchAnthropicModels(): Promise<void> {
    // Fetch once per session; skip if already loaded, in flight, or no key yet.
    if (this.modelsLoaded.anthropic || this.modelsLoading.anthropic) return;
    const apiKey = (document.getElementById('agent-anthropic-key') as HTMLInputElement).value.trim();
    if (!apiKey) return;

    const modelSelect = document.getElementById('agent-anthropic-model') as HTMLSelectElement;
    const previous = modelSelect.value;
    this.modelsLoading.anthropic = true;

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
      modelSelect.innerHTML = claudeModels
        .map((model: string) => `<option value="${model}">${model}</option>`)
        .join('');

      // Keep the saved selection if it's still offered, else default to claude-3-5-sonnet
      modelSelect.value = claudeModels.includes(previous) ? previous : 'claude-3-5-sonnet-20241022';

      this.modelsLoaded.anthropic = true;
      const context = this.getEditorContext();
      context.updateStatus(`Anthropic API key verified`, 'success');
    } catch (error) {
      const context = this.getEditorContext();
      context.updateStatus(`Failed to verify Anthropic API key: ${error instanceof Error ? error.message : 'Unknown error'}`, 'error');
    } finally {
      this.modelsLoading.anthropic = false;
    }
  }

  private async fetchGeminiModels(): Promise<void> {
    // Fetch once per session; skip if already loaded, in flight, or no key yet.
    if (this.modelsLoaded.gemini || this.modelsLoading.gemini) return;
    const apiKey = (document.getElementById('agent-gemini-key') as HTMLInputElement).value.trim();
    if (!apiKey) return;

    const modelSelect = document.getElementById('agent-gemini-model') as HTMLSelectElement;
    const previous = modelSelect.value;
    this.modelsLoading.gemini = true;

    try {
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(apiKey)}`
      );

      if (!response.ok) {
        throw new Error(`Failed to fetch models: ${response.statusText}`);
      }

      const data = await response.json();
      const geminiModels = (data.models || [])
        // Only models that support text generation
        .filter((model: any) => (model.supportedGenerationMethods || []).includes('generateContent'))
        // Strip the "models/" prefix
        .map((model: any) => (model.name || '').replace(/^models\//, ''))
        .filter((id: string) => id.startsWith('gemini-'))
        .sort();

      if (geminiModels.length === 0) {
        throw new Error('No Gemini models found');
      }

      // Populate dropdown
      modelSelect.innerHTML = geminiModels
        .map((model: string) => `<option value="${model}">${model}</option>`)
        .join('');

      // Keep the saved selection if it's still offered, else prefer a flash model (free-tier friendly)
      modelSelect.value = geminiModels.includes(previous)
        ? previous
        : (geminiModels.find((m: string) => m === 'gemini-2.0-flash')
          || geminiModels.find((m: string) => m.includes('flash'))
          || geminiModels[0]);

      this.modelsLoaded.gemini = true;
      const context = this.getEditorContext();
      context.updateStatus(`Found ${geminiModels.length} Gemini models`, 'success');
    } catch (error) {
      const context = this.getEditorContext();
      context.updateStatus(`Failed to fetch Gemini models: ${error instanceof Error ? error.message : 'Unknown error'}`, 'error');
    } finally {
      this.modelsLoading.gemini = false;
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
    const pluginFiles = Object.fromEntries(
      Object.entries(context.plugin.files).map(([path, file]) => [path, file.content])
    );

    const selectedText = this.getSelectedText(context.editor);
    const cursorPosition = this.getCursorPosition(context.editor);

    // Build context preview
    let contextPreview = '';

    if (context.currentFilePath) {
      contextPreview += `Current File: ${context.currentFilePath} (content available on-demand via get_file tool)\n\n`;
    }

    if (selectedText) {
      contextPreview += `Selected Text (${selectedText.length} chars):\n${selectedText.substring(0, 200) + (selectedText.length > 200 ? '...' : '')}\n\n`;
    }

    if (cursorPosition) {
      contextPreview += `Cursor Position: Line ${cursorPosition.line}, Column ${cursorPosition.column}\n\n`;
    }

    contextPreview += `Plugin Files (${Object.keys(pluginFiles).length} files) - listing only, content on-demand via get_file tool:\n`;
    let pluginListingSize = 0;
    for (const [path, content] of Object.entries(pluginFiles)) {
      const line = `  - ${path} (${content.length} chars)\n`;
      pluginListingSize += line.length;
      contextPreview += line;
    }
    contextPreview += `Listing size: ${pluginListingSize} chars (file contents fetched on-demand)\n\n`;

    contextPreview += `PluginApi Documentation: On-demand via get_api_docs tool\n`;

    let attachmentsSize = 0;
    if (this.attachedFiles.length > 0) {
      contextPreview += `\nAttached Files (${this.attachedFiles.length}) - inlined into the prompt:\n`;
      for (const file of this.attachedFiles) {
        attachmentsSize += file.content.length;
        contextPreview += `  - ${file.name} (${file.content.length} chars)\n`;
      }
    }

    // Build history preview
    const historyMessages = this.messages.filter(m => m.role !== 'user' || m.content !== prompt);
    let historyPreview = '';
    let totalHistorySize = 0;
    for (const msg of historyMessages) {
      totalHistorySize += msg.content.length;
      historyPreview += `[${msg.role}] ${msg.content.substring(0, 100)}${msg.content.length > 100 ? '...' : ''}\n\n`;
    }

    // Calculate total size (file contents and docs are on-demand, not included upfront)
    const totalChars = settings.systemPrompt.length + prompt.length +
                      pluginListingSize +
                      totalHistorySize +
                      (selectedText?.length || 0) +
                      attachmentsSize;
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

  /** Render the active provider + model in the panel header so it's always visible. */
  private updateCurrentModelBadge(): void {
    const settings = getAgentSettings();

    const providerLabels: Record<AIProvider, string> = {
      openai: 'OpenAI',
      anthropic: 'Anthropic',
      gemini: 'Gemini'
    };

    const model = settings.defaultProvider === 'openai'
      ? settings.defaultOpenAIModel
      : settings.defaultProvider === 'anthropic'
        ? settings.defaultAnthropicModel
        : settings.defaultGeminiModel;

    const badge = document.getElementById('agent-current-model');
    if (!badge) return;

    const providerLabel = providerLabels[settings.defaultProvider];
    badge.textContent = model ? `${providerLabel} · ${model}` : `${providerLabel} · no model selected`;
    badge.title = `Active provider and model (change in Settings)\nProvider: ${providerLabel}\nModel: ${model || 'not selected'}`;
  }

  private async updateModelInfo(): Promise<void> {
    const settings = getAgentSettings();
    const context = this.getEditorContext();

    // Get selected model
    const model = settings.defaultProvider === 'openai'
      ? settings.defaultOpenAIModel
      : settings.defaultProvider === 'anthropic'
        ? settings.defaultAnthropicModel
        : settings.defaultGeminiModel;

    // Calculate token estimate
    const prompt = this.inputTextarea.value.trim();
    if (!context.plugin || !prompt) {
      document.getElementById('agent-info')!.style.display = 'none';
      return;
    }

    // File listing size (just names + sizes, not full content)
    const pluginListingSize = Object.entries(context.plugin.files)
      .reduce((sum, [path, file]) => sum + `  - ${path} (${file.content.length} chars)\n`.length, 0);

    const selectedText = this.getSelectedText(context.editor) || '';
    const historySize = this.messages.reduce((sum, msg) => sum + msg.content.length, 0);
    const attachmentsSize = this.attachedFiles.reduce((sum, f) => sum + f.content.length, 0);

    // File contents and docs are on-demand via tools, not included upfront.
    // Attached files, however, are inlined into the prompt.
    const totalChars = settings.systemPrompt.length + prompt.length +
                      pluginListingSize +
                      historySize + selectedText.length + attachmentsSize;

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
