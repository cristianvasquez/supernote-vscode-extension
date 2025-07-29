import {
  initCardViewer,
  updateCardImage,
  initializeCardViewer,
} from "./card-viewer.js";

export class SupernoteViewer {
  constructor(options = {}) {
    this.onProgress = options.onProgress || (() => {});
    this.onPageComplete = options.onPageComplete || (() => {});

    this.totalPages = 0;
    this.completedPages = 0;
    this.pages = new Map(); // pageNumber -> { id, width, height, base64Data }
    this.isInitialized = false;

    // Initialize the card viewer system
    this.initializeViewer();
  }

  initializeViewer() {
    if (!this.isInitialized) {
      initializeCardViewer();
      this.isInitialized = true;
    }

    this.showEmptyGrid();
  }

  showEmptyGrid() {
    initCardViewer([]);
  }

  /**
   * Initialize the viewer with the total number of pages
   * @param {number} totalPages - Total number of pages in the document
   */
  initializePages(totalPages) {
    this.totalPages = totalPages;
    this.completedPages = 0;
    this.pages.clear();

    const transparentPixel =
      "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=";

    const pageCards = Array.from({ length: totalPages }, (_, i) => ({
      id: `page-${i + 1}`,
      w: 1404,
      h: 1872,
      lowResSrc: transparentPixel,
      highResSrc: "",
    }));

    initCardViewer(pageCards);
  }

  /**
   * Add a processed page image to the viewer
   * @param {number} pageNumber - Page number (1-indexed)
   * @param {string} base64Data - Base64 encoded PNG image data
   * @param {number} width - Image width in pixels
   * @param {number} height - Image height in pixels
   */
  addPageImage(pageNumber, base64Data, width, height) {
    if (pageNumber < 1 || pageNumber > this.totalPages) {
      console.error(
        `Invalid page number: ${pageNumber}. Must be between 1 and ${this.totalPages}`
      );
      return;
    }

    const pageId = `page-${pageNumber}`;
    const highResSrc = `data:image/png;base64,${base64Data}`;

    this.pages.set(pageNumber, {
      id: pageId,
      width,
      height,
      base64Data,
      highResSrc,
    });

    updateCardImage(pageId, highResSrc, width, height);

    this.completedPages++;
    this.onProgress(this.completedPages, this.totalPages);
    this.onPageComplete(pageNumber, highResSrc, width, height);
  }

  /**
   * Reset the viewer to initial state
   */
  reset() {
    this.totalPages = 0;
    this.completedPages = 0;
    this.pages.clear();
    this.showEmptyGrid();
  }

  /**
   * Get page data for a specific page
   * @param {number} pageNumber - Page number (1-indexed)
   * @returns {Object|null} Page data or null if not found
   */
  getPageData(pageNumber) {
    return this.pages.get(pageNumber) || null;
  }

  /**
   * Get all loaded pages
   * @returns {Array} Array of page data objects
   */
  getAllPages() {
    return Array.from(this.pages.values());
  }

  /**
   * Check if all pages have been loaded
   * @returns {boolean} True if all pages are complete
   */
  isComplete() {
    return this.completedPages === this.totalPages;
  }

  /**
   * Get loading progress
   * @returns {Object} Progress object with completed and total counts
   */
  getProgress() {
    return {
      completed: this.completedPages,
      total: this.totalPages,
      percentage:
        this.totalPages > 0 ? (this.completedPages / this.totalPages) * 100 : 0,
    };
  }

  /**
   * Navigate to a specific page
   * @param {number} pageNumber - Page number (0-indexed for internal use)
   */
  navigateToPage(pageNumber) {
    const pageId = `page-${pageNumber + 1}`;
    window.location.hash = pageId;

    // Force multiple render cycles to ensure proper positioning
    // This helps when navigating directly to a page via protocol
    window.dispatchEvent(new PopStateEvent("popstate"));

    // Schedule additional renders to ensure animations complete
    requestAnimationFrame(() => {
      window.dispatchEvent(new Event("resize"));
      requestAnimationFrame(() => {
        window.dispatchEvent(new Event("resize"));
      });
    });

    console.log(`Navigated to page ${pageNumber + 1} (ID: ${pageId})`);
  }
}
