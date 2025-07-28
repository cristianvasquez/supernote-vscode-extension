import * as vscode from "vscode";
import * as fs from "fs";
import {SupernoteX, toImage} from "supernote-typescript";
import * as path from "path";
import * as os from "os";
import {WorkerPool} from "./workerPool";

export class SupernoteEditorProvider implements vscode.CustomReadonlyEditorProvider {
    private static currentPageInfo: { currentPage: number; filePath: string } | null = null;
    private workerPool: WorkerPool;

    constructor(private readonly context: vscode.ExtensionContext) {
        this.workerPool = new WorkerPool(4, context);
    }

    static getCurrentPageInfo(): { currentPage: number; filePath: string } | null {
        return SupernoteEditorProvider.currentPageInfo;
    }

    static setCurrentPageInfo(currentPage: number, filePath: string): void {
        SupernoteEditorProvider.currentPageInfo = { currentPage, filePath };
    }

    async openCustomDocument(
        uri: vscode.Uri,
        openContext: vscode.CustomDocumentOpenContext,
        token: vscode.CancellationToken
    ): Promise<vscode.CustomDocument> {
        return {
            uri, dispose: () => {
            }
        };
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
                vscode.Uri.joinPath(this.context.extensionUri, "webview"),
            ],
        };

        // Set initial page info
        SupernoteEditorProvider.setCurrentPageInfo(0, document.uri.fsPath);

        // Clean up when panel is disposed
        webviewPanel.onDidDispose(() => {
            SupernoteEditorProvider.currentPageInfo = null;
        });

        // Set initial HTML content
        webviewPanel.webview.html = await this.getWebviewContent(
            webviewPanel.webview
        );

        // Handle messages from webview
        webviewPanel.webview.onDidReceiveMessage(
            (message) => {
                console.log("Received message from webview:", message);
                switch (message.type) {
                    case "webview-ready":
                        console.log("Webview is ready");
                        this.processSupernoteFile(document.uri, webviewPanel.webview);
                        this.checkPageNavigation(webviewPanel.webview);
                        break;

                    case "page-changed":
                        // Update current page info
                        SupernoteEditorProvider.setCurrentPageInfo(
                            message.pageNumber, 
                            document.uri.fsPath
                        );
                        console.log(`Updated current page to: ${message.pageNumber + 1}`);
                        break;

                    case "progress":
                        console.log(
                            `Progress: ${message.completed}/${message.total} (${message.percentage?.toFixed(1)}%)`
                        );
                        break;

                    case "page-complete":
                        console.log(
                            `Page ${message.pageNumber} rendered: ${message.width}x${message.height}`
                        );
                        break;
                }
            },
            undefined,
            this.context.subscriptions
        );
    }

    private async processSupernoteFile(
        fileUri: vscode.Uri,
        webview: vscode.Webview
    ) {
        const fileData = await vscode.workspace.fs.readFile(fileUri);
        const note = new SupernoteX(fileData);
        const totalPages = note.pages.length;

        webview.postMessage({
            type: "start-processing",
            totalPages,
        });

        let completed = 0;
        const processingPromises: Promise<void>[] = [];

        // Process all pages using the worker pool
        for (let pageIndex = 0; pageIndex < totalPages; pageIndex++) {
            const promise = this.workerPool.processPage(Buffer.from(fileData), pageIndex)
                .then((msg) => {
                    if (msg.status === "success") {
                        const base64 = Buffer.from(msg.buffer!).toString("base64");
                        webview.postMessage({
                            type: "add-page",
                            pageNumber: msg.pageIndex + 1,
                            base64Data: base64,
                            width: msg.width || 1404,
                            height: msg.height || 1872,
                        });
                    } else {
                        console.error(`Error on page ${msg.pageIndex + 1}:`, msg.error);
                    }
                    
                    completed++;
                    webview.postMessage({
                        type: "progress",
                        completed,
                        total: totalPages,
                        percentage: (completed / totalPages) * 100
                    });
                })
                .catch((error) => {
                    console.error(`Failed to process page ${pageIndex + 1}:`, error);
                    completed++;
                });

            processingPromises.push(promise);
        }

        // Wait for all pages to be processed
        await Promise.all(processingPromises);
        
        console.log("All pages processed.");
        webview.postMessage({type: "processing-complete"});
        
        // Log worker pool stats
        const stats = this.workerPool.getStats();
        console.log("Worker pool stats:", stats);
    }

    private async checkPageNavigation(webview: vscode.Webview): Promise<void> {
        try {
            const tempFile = path.join(os.tmpdir(), `supernote-page-${os.userInfo().username}`);
            if (fs.existsSync(tempFile)) {
                const pageNumber = parseInt(fs.readFileSync(tempFile, 'utf8').trim());
                if (!isNaN(pageNumber) && pageNumber > 0) {
                    // Navigate directly to the page
                    webview.postMessage({
                        type: 'navigate-to-page',
                        pageNumber: pageNumber - 1 // Convert to 0-based index
                    });
                    console.log(`Navigating to page ${pageNumber}`);
                }
                // Clean up temp file
                fs.unlinkSync(tempFile);
            }
        } catch (error) {
            console.log('Could not check page navigation:', error);
        }
    }

    private async getWebviewContent(webview: vscode.Webview): Promise<string> {
        // Get proper webview URIs for resources
        const webviewUri = vscode.Uri.joinPath(
            this.context.extensionUri,
            "webview"
        );
        const baseUri = webview.asWebviewUri(webviewUri);

        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Supernote Viewer</title>
    <link rel="stylesheet" href="${baseUri}/style.css"/>
</head>
<body>
    <script type="module" src="${baseUri}/vscode-webview.js"></script>
</body>
</html>`;
    }

    async dispose(): Promise<void> {
        await this.workerPool.shutdown();
    }
}
