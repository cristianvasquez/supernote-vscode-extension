// VSCode Extension Webview Example
// This shows how a VSCode extension would use the SupernoteViewer component

// In your webview HTML:
/*
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Supernote Viewer</title>
    <link rel="stylesheet" href="./src/style.css"/>
</head>
<body>
    <script type="module" src="./vscode-webview-example.js"></script>
</body>
</html>
*/

import { SupernoteViewer } from "./SupernoteViewer.js";

// Simple page tracking
let currentPage = 0;

// Debug function to log page changes
function logPageChange(newPage, source) {
  console.log(`Page changed to ${newPage + 1} (source: ${source})`);
  vscode.postMessage({
    type: "page-changed",
    pageNumber: newPage,
  });
}

// Initialize the viewer without upload card for VSCode extension
const viewer = new SupernoteViewer({
  showUploadCard: false, // VSCode extension handles file selection
  onProgress: (completed, total) => {
    // Send progress updates to VSCode extension
    vscode.postMessage({
      type: "progress",
      completed,
      total,
      percentage: (completed / total) * 100,
    });
    console.log(`Progress: ${completed}/${total} pages`);
  },
  onPageComplete: (pageNumber, src, width, height) => {
    // Notify VSCode extension when a page is complete
    vscode.postMessage({
      type: "page-complete",
      pageNumber,
      width,
      height,
    });
    console.log(`Page ${pageNumber} loaded: ${width}x${height}`);
  },
});

// VSCode webview API (provided by VSCode)
const vscode = acquireVsCodeApi();

// Listen for messages from the VSCode extension
window.addEventListener("message", (event) => {
  const message = event.data;

  switch (message.type) {
    case "start-processing":
      // VSCode extension tells us to start processing a file
      const { totalPages } = message;
      console.log(`Starting to process ${totalPages} pages`);
      viewer.initializePages(totalPages);
      break;

    case "add-page":
      // VSCode extension sends us a processed page
      const { pageNumber, base64Data, width, height } = message;
      viewer.addPageImage(pageNumber, base64Data, width, height);
      break;

    case "navigate-to-page":
      // Navigate to a specific page
      const { pageNumber: targetPage } = message;
      console.log(`Navigating to page ${targetPage + 1}`);
      currentPage = targetPage;
      viewer.navigateToPage(targetPage);
      logPageChange(currentPage, 'navigate');
      break;

    case "reset":
      // Reset the viewer
      currentPage = 0;
      viewer.reset();
      break;

    default:
      console.warn("Unknown message type:", message.type);
  }
});

// Track page changes by monitoring the card viewer
function trackPageChanges() {
  // Listen for clicks on page cards
  document.addEventListener('click', (event) => {
    const card = event.target.closest('.box');
    if (card) {
      const pageId = card.getAttribute('data-page-id');
      if (pageId) {
        const match = pageId.match(/page-(\d+)/);
        if (match) {
          const newPage = parseInt(match[1]) - 1; // Convert to 0-indexed
          if (newPage !== currentPage) {
            currentPage = newPage;
            logPageChange(currentPage, 'click');
          }
        }
      }
    }
  });

  // Also listen for hash changes as backup
  function handleHashChange() {
    const match = window.location.hash.match(/#page-(\d+)/);
    if (match) {
      const newPage = parseInt(match[1]) - 1; // Convert to 0-indexed
      if (newPage !== currentPage) {
        currentPage = newPage;
        logPageChange(currentPage, 'hash');
      }
    }
  }

  // Listen for hash changes
  window.addEventListener("hashchange", handleHashChange);
  window.addEventListener("popstate", handleHashChange);

  // Check initial hash
  if (window.location.hash) {
    handleHashChange();
  }

  // Monitor URL changes more frequently to catch all navigation
  let lastHash = window.location.hash;
  setInterval(() => {
    if (window.location.hash !== lastHash) {
      lastHash = window.location.hash;
      handleHashChange();
    }
  }, 100);
}

// Initialize page change tracking
trackPageChanges();

// Notify VSCode extension that webview is ready
vscode.postMessage({
  type: "webview-ready",
});

console.log("VSCode Supernote Webview initialized");
console.log("Viewer object:", viewer);
