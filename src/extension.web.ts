import * as vscode from 'vscode';
import { activate as activateCore, deactivate as deactivateCore } from './extension';

export async function activate(context: vscode.ExtensionContext): Promise<void> {
  await activateCore(context);
}

export function deactivate(): void {
  deactivateCore();
}