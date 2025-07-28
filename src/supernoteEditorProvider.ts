import * as vscode from "vscode";
import * as fs from "fs";
import { SupernoteX, toImage } from "supernote-typescript";
import { Worker } from "worker_threads";
import * as path from "path";

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
        vscode.Uri.joinPath(this.context.extensionUri, "webview"),
      ],
    };

    // Set initial HTML content
    webviewPanel.webview.html = await this.getWebviewContent(
      webviewPanel.webview
    );

    // Wait for webview to be ready before processing
    let webviewReady = false;
    let processingStarted = false;

    // Handle messages from webview
    webviewPanel.webview.onDidReceiveMessage(
      (message) => {
        console.log("Received message from webview:", message);
        switch (message.type) {
          case "webview-ready":
            console.log("Webview is ready");
            webviewReady = true;

            // Start processing if not already started
            if (!processingStarted) {
              processingStarted = true;
              this.processSupernoteFile(document.uri, webviewPanel.webview);
            }
            break;

          case "ready-for-pages":
            console.log("Webview is ready to receive pages");
            break;

          case "progress":
            console.log(
              `Progress: ${message.completed}/${
                message.total
              } (${message.percentage?.toFixed(1)}%)`
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

    // Fallback: start processing after a short delay if webview doesn't send ready
    setTimeout(() => {
      if (!processingStarted) {
        console.log("Starting processing via fallback");
        processingStarted = true;

        // Send filename
        const filename = path.basename(document.uri.fsPath);
        webviewPanel.webview.postMessage({
          command: "setFilename",
          filename: filename,
        });

        this.processSupernoteFile(document.uri, webviewPanel.webview);
      }
    }, 1000);
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

    const queue = Array.from({ length: totalPages }, (_, i) => i);
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

      worker.postMessage({ noteBuffer: fileData, pageIndex });

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
          webview.postMessage({ type: "processing-complete" });
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
          webview.postMessage({ type: "processing-complete" });
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
