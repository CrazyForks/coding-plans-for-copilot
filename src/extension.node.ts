import * as vscode from 'vscode';
import { getRecentCommitMessages } from './commitMessageHistory.node';
import { registerRecentCommitMessagesProvider } from './commitMessageGenerator';
import { activate as activateCore, deactivate as deactivateCore } from './extension';

export async function activate(context: vscode.ExtensionContext): Promise<void> {
  registerRecentCommitMessagesProvider(getRecentCommitMessages);
  await activateCore(context);
}

export function deactivate(): void {
  deactivateCore();
  registerRecentCommitMessagesProvider(undefined);
}