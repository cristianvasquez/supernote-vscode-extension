import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { SupernoteX } from 'supernote-typescript';

export class SupernoteEditorProvider implements vscode.CustomReadonlyEditorProvider {
    
    constructor(private readonly context: vscode.ExtensionContext) {}

    async openCustomDocument(
        uri: vscode.Uri,
        openContext: vscode.CustomDocumentOpenContext,
        token: vscode.CancellationToken
    ): Promise<vscode.CustomDocument> {
        return { uri, dispose: () => {} };
    }

    async resolveCustomEditor(
        document: vscode.CustomDocument,
        webviewPanel: vscode.WebviewPanel,
        token: vscode.CancellationToken
    ): Promise<void> {
        
        // Configure webview
        webviewPanel.webview.options = {
            enableScripts: true,
            localResourceRoots: [
                vscode.Uri.joinPath(this.context.extensionUri, 'webview')
            ]
        };

        // Set initial HTML content
        webviewPanel.webview.html = await this.getWebviewContent(webviewPanel.webview);

        // Wait for webview to be ready before processing
        let webviewReady = false;
        let processingStarted = false;

        // Handle messages from webview
        webviewPanel.webview.onDidReceiveMessage(
            message => {
                console.log('Received message from webview:', message);
                switch (message.command) {
                    case 'ready':
                        console.log('Webview is ready');
                        webviewReady = true;
                        
                        // Send filename
                        const filename = path.basename(document.uri.fsPath);
                        webviewPanel.webview.postMessage({
                            command: 'setFilename',
                            filename: filename
                        });

                        // Start processing if not already started
                        if (!processingStarted) {
                            processingStarted = true;
                            this.processSupernoteFile(document.uri, webviewPanel.webview);
                        }
                        break;
                }
            },
            undefined,
            this.context.subscriptions
        );

        // Fallback: start processing after a short delay if webview doesn't send ready
        setTimeout(() => {
            if (!processingStarted) {
                console.log('Starting processing via fallback');
                processingStarted = true;
                
                // Send filename
                const filename = path.basename(document.uri.fsPath);
                webviewPanel.webview.postMessage({
                    command: 'setFilename',
                    filename: filename
                });

                this.processSupernoteFile(document.uri, webviewPanel.webview);
            }
        }, 1000);
    }

    private async processSupernoteFile(fileUri: vscode.Uri, webview: vscode.Webview) {
        try {
            console.log('Starting to process Supernote file:', fileUri.fsPath);
            
            webview.postMessage({
                command: 'status',
                text: 'Loading Supernote file...'
            });

            // Read the .note file
            console.log('Reading file data...');
            const fileData = await vscode.workspace.fs.readFile(fileUri);
            console.log('File data size:', fileData.length, 'bytes');
            
            console.log('Creating SupernoteX instance...');
            const note = new SupernoteX(fileData);
            const totalPages = note.pages.length;
            console.log('Total pages found:', totalPages);

            webview.postMessage({
                command: 'status',
                text: `Processing ${totalPages} pages...`
            });

            // Process pages and send them to webview
            for (let i = 0; i < totalPages; i++) {
                try {
                    console.log(`Processing page ${i + 1}/${totalPages}...`);
                    const pageBuffer = await (note.pages[i] as any).toImage();
                    console.log(`Page ${i + 1} buffer size:`, pageBuffer.length, 'bytes');
                    
                    const base64Image = Buffer.from(pageBuffer).toString('base64');
                    console.log(`Page ${i + 1} base64 length:`, base64Image.length);
                    
                    const pageMessage = {
                        command: 'addPage',
                        pageNumber: i + 1,
                        imageData: `data:image/png;base64,${base64Image}`,
                        totalPages: totalPages
                    };
                    
                    console.log(`Sending page ${i + 1} to webview...`);
                    webview.postMessage(pageMessage);

                    webview.postMessage({
                        command: 'status',
                        text: `Processed ${i + 1}/${totalPages} pages`
                    });

                    // Small delay to prevent overwhelming the webview
                    if (i % 3 === 0) {
                        await new Promise(resolve => setTimeout(resolve, 10));
                    }

                } catch (pageError) {
                    console.error(`Error processing page ${i + 1}:`, pageError);
                    webview.postMessage({
                        command: 'pageError',
                        pageNumber: i + 1,
                        error: pageError instanceof Error ? pageError.message : String(pageError)
                    });
                }
            }

            webview.postMessage({
                command: 'status',
                text: `Completed: ${totalPages} pages loaded`
            });

        } catch (error) {
            console.error('Failed to process Supernote file:', error);
            webview.postMessage({
                command: 'error',
                text: `Failed to process Supernote file: ${error instanceof Error ? error.message : String(error)}`
            });
        }
    }

    private async getWebviewContent(webview: vscode.Webview): Promise<string> {
        const htmlPath = vscode.Uri.joinPath(this.context.extensionUri, 'webview', 'viewer.html');
        const htmlContent = await vscode.workspace.fs.readFile(htmlPath);
        return Buffer.from(htmlContent).toString('utf8');
    }
}