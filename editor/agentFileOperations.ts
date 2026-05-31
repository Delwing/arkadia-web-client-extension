/**
 * Agent File Operations
 * Handles file operations requested by the AI agent
 */

import * as monaco from 'monaco-editor';
import type { EditorPluginData, PluginFile } from '@client/utils/pluginEditorStorage.ts';
import { getLanguageFromPath } from '@client/utils/pluginEditorStorage.ts';
import type { FileOperation } from './types/codingAgent';
import type { StatusType } from './types';

export interface AgentFileOperationsContext {
  plugin: EditorPluginData;
  pluginId: string;
  editorModels: Map<string, monaco.editor.ITextModel>;
  modifiedFiles: Set<string>;
  currentFilePath: string | null;
  updateStatus: (message: string, type: StatusType) => void;
  renderFileTree: () => void;
  switchToFile: (path: string) => void;
  updateEditorModel: (path: string, content: string) => void;
}

export function executeFileOperations(
  operations: FileOperation[],
  context: AgentFileOperationsContext
): { success: boolean; errors: string[] } {
  const errors: string[] = [];

  for (const operation of operations) {
    try {
      switch (operation.type) {
        case 'create':
          if (!createFile(operation, context)) {
            errors.push(`Failed to create file: ${operation.path}`);
          }
          break;
        case 'modify':
          if (!modifyFile(operation, context)) {
            errors.push(`Failed to modify file: ${operation.path}`);
          }
          break;
        case 'delete':
          if (!deleteFile(operation, context)) {
            errors.push(`Failed to delete file: ${operation.path}`);
          }
          break;
        case 'createDir':
          if (!createDirectory(operation.path, context)) {
            errors.push(`Failed to create directory: ${operation.path}`);
          }
          break;
        case 'deleteDir':
          if (!deleteDirectory(operation.path, context)) {
            errors.push(`Failed to delete directory: ${operation.path}`);
          }
          break;
        default:
          errors.push(`Unknown operation type: ${(operation as any).type}`);
      }
    } catch (error) {
      errors.push(`Error executing ${operation.type} on ${operation.path}: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  if (errors.length === 0) {
    context.updateStatus(`Successfully executed ${operations.length} file operation(s)`, 'success');
  } else {
    context.updateStatus(`Completed with ${errors.length} error(s)`, 'error');
  }

  return {
    success: errors.length === 0,
    errors
  };
}

function createFile(operation: FileOperation, context: AgentFileOperationsContext): boolean {
  const { path, content = '', language } = operation;
  const { plugin, editorModels } = context;

  // Check if file already exists
  if (plugin.files[path]) {
    context.updateStatus(`File already exists: ${path}`, 'error');
    return false;
  }

  // Determine language from path if not specified
  const fileLanguage = language || getLanguageFromPath(path);

  // Create the file
  const newFile: PluginFile = {
    path,
    content,
    language: fileLanguage
  };

  plugin.files[path] = newFile;
  context.modifiedFiles.add(path);

  // Create any necessary folders
  const folderPath = path.substring(0, path.lastIndexOf('/'));
  if (folderPath && !plugin.folders?.includes(folderPath)) {
    if (!plugin.folders) {
      plugin.folders = [];
    }
    const folders = folderPath.split('/');
    let currentPath = '';
    for (const folder of folders) {
      currentPath = currentPath ? `${currentPath}/${folder}` : folder;
      if (!plugin.folders.includes(currentPath)) {
        plugin.folders.push(currentPath);
      }
    }
  }

  // Create Monaco model
  const uri = monaco.Uri.parse(`file:///${context.pluginId}/${path}`);
  const model = monaco.editor.createModel(content, fileLanguage, uri);
  editorModels.set(path, model);

  // Update virtual file system for TypeScript
  if (fileLanguage === 'typescript' || fileLanguage === 'javascript') {
    monaco.typescript.typescriptDefaults.addExtraLib(content, uri.toString());
    monaco.typescript.javascriptDefaults.addExtraLib(content, uri.toString());
  }

  context.renderFileTree();
  context.switchToFile(path);
  context.updateStatus(`Created file: ${path}`, 'success');

  return true;
}

function modifyFile(operation: FileOperation, context: AgentFileOperationsContext): boolean {
  const { path, content = '' } = operation;
  const { plugin } = context;

  // If the file doesn't exist yet, treat "modify" as "create". Models sometimes
  // label a brand-new path as "modify" (e.g. when moving a file to a new folder),
  // and silently failing would drop the file. Creating it is the intended outcome.
  if (!plugin.files[path]) {
    return createFile(operation, context);
  }

  // Update file content
  plugin.files[path].content = content;
  context.modifiedFiles.add(path);

  // Update Monaco model
  context.updateEditorModel(path, content);

  // Update virtual file system for TypeScript
  const language = plugin.files[path].language;
  if (language === 'typescript' || language === 'javascript') {
    const uri = monaco.Uri.parse(`file:///${context.pluginId}/${path}`);
    monaco.typescript.typescriptDefaults.addExtraLib(content, uri.toString());
    monaco.typescript.javascriptDefaults.addExtraLib(content, uri.toString());
  }

  context.updateStatus(`Modified file: ${path}`, 'success');

  return true;
}

function deleteFile(operation: FileOperation, context: AgentFileOperationsContext): boolean {
  const { path } = operation;
  const { plugin, editorModels } = context;

  // Check if file exists
  if (!plugin.files[path]) {
    context.updateStatus(`File not found: ${path}`, 'error');
    return false;
  }

  // Don't allow deleting the last file
  const fileCount = Object.keys(plugin.files).length;
  if (fileCount <= 1) {
    context.updateStatus('Cannot delete the last file', 'error');
    return false;
  }

  // Delete file
  delete plugin.files[path];
  context.modifiedFiles.delete(path);

  // Dispose Monaco model
  const model = editorModels.get(path);
  if (model) {
    model.dispose();
    editorModels.delete(path);
  }

  // Clear from virtual file system
  const uri = monaco.Uri.parse(`file:///${context.pluginId}/${path}`);
  monaco.typescript.typescriptDefaults.addExtraLib('', uri.toString());
  monaco.typescript.javascriptDefaults.addExtraLib('', uri.toString());

  // Switch to another file if this was the current file
  if (context.currentFilePath === path) {
    const remainingFiles = Object.keys(plugin.files);
    if (remainingFiles.length > 0) {
      context.switchToFile(remainingFiles[0]);
      if (!plugin.entryPoint || plugin.entryPoint === path) {
        plugin.entryPoint = remainingFiles[0];
      }
    }
  }

  context.renderFileTree();
  context.updateStatus(`Deleted file: ${path}`, 'success');

  return true;
}

export function createDirectory(dirPath: string, context: AgentFileOperationsContext): boolean {
  const { plugin } = context;

  if (!plugin.folders) {
    plugin.folders = [];
  }

  // Check if folder already exists
  if (plugin.folders.includes(dirPath)) {
    context.updateStatus(`Directory already exists: ${dirPath}`, 'error');
    return false;
  }

  // Create parent folders if necessary
  const folders = dirPath.split('/');
  let currentPath = '';
  for (const folder of folders) {
    currentPath = currentPath ? `${currentPath}/${folder}` : folder;
    if (!plugin.folders.includes(currentPath)) {
      plugin.folders.push(currentPath);
    }
  }

  context.renderFileTree();
  context.updateStatus(`Created directory: ${dirPath}`, 'success');

  return true;
}

export function deleteDirectory(dirPath: string, context: AgentFileOperationsContext): boolean {
  const { plugin, editorModels } = context;

  // Find all files in this folder
  const filesInFolder = Object.keys(plugin.files).filter(filePath =>
    filePath.startsWith(dirPath + '/')
  );

  // Check if deleting would leave us with no files
  const remainingFiles = Object.keys(plugin.files).length - filesInFolder.length;
  if (remainingFiles < 1) {
    context.updateStatus('Cannot delete directory: plugin must have at least one file', 'error');
    return false;
  }

  // Delete all files in the folder
  for (const filePath of filesInFolder) {
    delete plugin.files[filePath];

    // Dispose model
    const model = editorModels.get(filePath);
    if (model) {
      model.dispose();
      editorModels.delete(filePath);
    }

    // Remove from modified files set
    context.modifiedFiles.delete(filePath);

    // Clear from virtual file system
    const uri = monaco.Uri.parse(`file:///${context.pluginId}/${filePath}`);
    monaco.typescript.typescriptDefaults.addExtraLib('', uri.toString());
    monaco.typescript.javascriptDefaults.addExtraLib('', uri.toString());
  }

  // Remove folder from folders array
  if (plugin.folders) {
    plugin.folders = plugin.folders.filter(folder =>
      folder !== dirPath && !folder.startsWith(dirPath + '/')
    );
  }

  // Switch to another file if current file was deleted
  if (context.currentFilePath && filesInFolder.includes(context.currentFilePath)) {
    const remainingFilesList = Object.keys(plugin.files);
    if (remainingFilesList.length > 0) {
      context.switchToFile(remainingFilesList[0]);
      if (!plugin.entryPoint || filesInFolder.includes(plugin.entryPoint)) {
        plugin.entryPoint = remainingFilesList[0];
      }
    }
  }

  context.renderFileTree();
  context.updateStatus(`Deleted directory: ${dirPath} (${filesInFolder.length} files)`, 'success');

  return true;
}
