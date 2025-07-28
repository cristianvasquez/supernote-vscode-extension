// Web Worker for image processing (simplified for VS Code webview)
self.onmessage = async function(e) {
  const { pageIndex, imageData } = e.data
  try {
    // In VS Code extension, we receive already processed imageData
    // So we just pass it through with the pageIndex
    postMessage({
      pageIndex,
      imageData,
      status: 'success'
    })
  } catch (error) {
    postMessage({
      pageIndex,
      error: error.message,
      status: 'error'
    })
  }
}