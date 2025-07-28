import * as vscode from 'vscode';
import * as path from 'path';
import {SupernoteEditorProvider} from './supernoteEditorProvider';

let provider: SupernoteEditorProvider;

export function activate(context: vscode.ExtensionContext) {
    console.log('Supernote extension is now active!');

    // Register the custom editor provider
    provider = new SupernoteEditorProvider(context);
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

    // Register command to copy page URL
    context.subscriptions.push(
        vscode.commands.registerCommand('supernote.copyPageUrl', async () => {
            const pageInfo = SupernoteEditorProvider.getCurrentPageInfo();
            if (!pageInfo) {
                vscode.window.showWarningMessage('No active Supernote file found');
                return;
            }

            const {currentPage, filePath} = pageInfo;
            const encodedPath = encodeURI(filePath); // URL encode the file path to handle spaces
            const supernoteUrl = `supernote://${encodedPath}?page=${currentPage + 1}`; // Convert to 1-based page number

            try {
                await vscode.env.clipboard.writeText(supernoteUrl);
                vscode.window.showInformationMessage(`Copied URL to page ${currentPage + 1}: ${supernoteUrl}`);
            } catch (error) {
                vscode.window.showErrorMessage(`Failed to copy URL: ${error}`);
            }
        })
    );

    // Register command to get current page info
    context.subscriptions.push(
        vscode.commands.registerCommand('supernote.getCurrentPage', () => {
            const pageInfo = SupernoteEditorProvider.getCurrentPageInfo();
            if (!pageInfo) {
                vscode.window.showWarningMessage('No active Supernote file found');
                return;
            }

            const {currentPage, filePath} = pageInfo;
            vscode.window.showInformationMessage(
                `Current page: ${currentPage + 1} of file: ${path.basename(filePath)}`
            );
        })
    );
}

export function deactivate() {
    console.log('Supernote extension deactivated');
    if (provider) {
        provider.dispose();
    }
}
