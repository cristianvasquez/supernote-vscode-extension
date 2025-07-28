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

import { SupernoteViewer } from './SupernoteViewer.js'

// Simple page tracking
let currentPage = 0

// Initialize the viewer without upload card for VSCode extension
const viewer = new SupernoteViewer({
  showUploadCard: false, // VSCode extension handles file selection
  onProgress: (completed, total) => {
    // Send progress updates to VSCode extension
    vscode.postMessage({
      type: 'progress',
      completed,
      total,
      percentage: (completed / total) * 100,
    })
    console.log(`Progress: ${completed}/${total} pages`)
  },
  onPageComplete: (pageNumber, src, width, height) => {
    // Notify VSCode extension when a page is complete
    vscode.postMessage({
      type: 'page-complete',
      pageNumber,
      width,
      height,
    })
    console.log(`Page ${pageNumber} loaded: ${width}x${height}`)
  },
})

// VSCode webview API (provided by VSCode)
const vscode = acquireVsCodeApi()

// Listen for messages from the VSCode extension
window.addEventListener('message', (event) => {
  const message = event.data

  switch (message.type) {
    case 'start-processing':
      // VSCode extension tells us to start processing a file
      const { totalPages } = message
      console.log(`Starting to process ${totalPages} pages`)
      viewer.initializePages(totalPages)

      // Notify extension we're ready
      vscode.postMessage({
        type: 'ready-for-pages',
      })
      break

    case 'add-page':
      // VSCode extension sends us a processed page
      const { pageNumber, base64Data, width, height } = message
      viewer.addPageImage(pageNumber, base64Data, width, height)
      break

    case 'navigate-to-page':
      // Navigate to a specific page
      const { pageNumber: targetPage } = message
      console.log(`Navigating to page ${targetPage + 1}`)
      currentPage = targetPage
      viewer.navigateToPage(targetPage)
      break

    case 'reset':
      // Reset the viewer
      currentPage = 0
      viewer.reset()
      break

    default:
      console.warn('Unknown message type:', message.type)
  }
})

// Track page changes by monitoring hash changes
function trackPageChanges () {
  let lastHash = window.location.hash

  function handleHashChange () {
    const currentHash = window.location.hash

    if (currentHash !== lastHash) {
      lastHash = currentHash

      // Extract page number from hash (format: #page-1, #page-2, etc.)
      const match = currentHash.match(/#page-(\d+)/)
      if (match) {
        currentPage = parseInt(match[1]) - 1 // Convert to 0-indexed
        console.log(`Page changed to: ${currentPage + 1}`)

        // Tell extension about page change
        vscode.postMessage({
          type: 'page-changed',
          pageNumber: currentPage,
        })
      }
    }
  }

  // Listen for hash changes (page navigation)
  window.addEventListener('hashchange', handleHashChange)
  window.addEventListener('popstate', handleHashChange)

  // Check initial hash
  if (window.location.hash) {
    handleHashChange()
  }
}

// Initialize page change tracking
trackPageChanges()

// Notify VSCode extension that webview is ready
vscode.postMessage({
  type: 'webview-ready',
})

console.log('VSCode Supernote Webview initialized')
console.log('Viewer object:', viewer)
