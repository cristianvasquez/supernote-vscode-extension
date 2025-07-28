import * as vscode from 'vscode';
import {SupernoteEditorProvider} from './supernoteEditorProvider';

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
}

export function deactivate() {
    console.log('Supernote extension deactivated');
}
