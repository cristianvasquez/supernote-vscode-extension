import * as vscode from 'vscode';
import * as path from 'path';
import { SupernoteEditorProvider } from './supernoteEditorProvider';

export function activate(context: vscode.ExtensionContext) {
    console.log('Supernote extension is now active!');

    // Register the custom editor provider
    const provider = new SupernoteEditorProvider(context);
    context.subscriptions.push(
        vscode.window.registerCustomEditorProvider(
            'supernote.viewer', 
            provider,
            {
                webviewOptions: {
                    retainContextWhenHidden: true
                },
                supportsMultipleEditorsPerDocument: false
            }
        )
    );

    // Register command to open files with Supernote viewer
    context.subscriptions.push(
        vscode.commands.registerCommand('supernote.openFile', (uri: vscode.Uri) => {
            vscode.commands.executeCommand('vscode.openWith', uri, 'supernote.viewer');
        })
    );
}

export function deactivate() {
    console.log('Supernote extension deactivated');
}