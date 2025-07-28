import * as vscode from "vscode";
import * as fs from "fs";
import {SupernoteX, toImage} from "supernote-typescript";
import {Worker} from "worker_threads";
import * as path from "path";
import * as os from "os";

export class SupernoteEditorProvider implements vscode.CustomReadonlyEditorProvider {
    private static currentPageInfo: { currentPage: number; filePath: string } | null = null;

    constructor(private readonly context: vscode.ExtensionContext) {
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
        const maxWorkers = 4;
        const fileData = await vscode.workspace.fs.readFile(fileUri);
        const note = new SupernoteX(fileData);
        const totalPages = note.pages.length;

        webview.postMessage({
            type: "start-processing",
            totalPages,
        });

        const queue = Array.from({length: totalPages}, (_, i) => i);
        let completed = 0;
        let activeWorkers = 0;

        const workerPath = vscode.Uri.joinPath(
            this.context.extensionUri,
            "out",
            "page-worker.js"
        ).fsPath;

        const startWorker = () => {
            if (queue.length === 0 || activeWorkers >= maxWorkers) return;

            const pageIndex = queue.shift()!;
            activeWorkers++;
            const worker = new Worker(workerPath);

            worker.postMessage({noteBuffer: fileData, pageIndex});

            worker.on("message", (msg) => {
                if (msg.status === "success") {
                    const base64 = Buffer.from(msg.buffer).toString("base64");
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
            });

            worker.on("exit", () => {
                completed++;
                activeWorkers--;
                if (completed >= totalPages) {
                    console.log("All pages processed.");
                    webview.postMessage({type: "processing-complete"});
                } else {
                    startWorker(); // Start a new worker if there are more pages
                }
            });

            worker.on("error", (err) => {
                console.error(`Worker failed on page ${pageIndex + 1}:`, err);
                completed++;
                activeWorkers--;
                if (completed >= totalPages) {
                    console.log("All pages processed (with errors).");
                    webview.postMessage({type: "processing-complete"});
                } else {
                    startWorker(); // Start a new worker to continue processing
                }
            });
        };

        // Start up to `maxWorkers` initially
        for (let i = 0; i < Math.min(maxWorkers, totalPages); i++) {
            startWorker();
        }
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
}
