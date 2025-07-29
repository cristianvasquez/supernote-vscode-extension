'use strict'

// ===================================
// Configuration Constants
// ===================================
const CONFIG = {
  debug: false,
  animation: {
    msPerStep: 1,
    spring: {
      stiffness: 450,
      damping: 45
    }
  },
  card: {
    width: 1404,    // Fixed width for all cards
    height: 1872,   // Fixed height for all cards
    aspectRatio: 1404 / 1872
  },
  layout: {
    boxesGapX: 24,
    boxesGapY: 24,
    boxes1DGapX: 52,
    boxes1DGapY: 28,
    windowPaddingTop: 40,
    gapTopPeek: 40,
    hitArea1DSizeX: 100,
    hoverMagnetFactor: 40,
    browserUIMaxSizeTop: 100,
    browserUIMaxSizeBottom: 150,
    boxMinSizeX: 220,
    maxColumns: 7,
    minBrightness: 0.2, // Minimum brightness to keep pages visible
    scaleFactor2D: 1,   // Scale for cards in grid mode
    scaleFactor1DFocused: 1,      // Scale for focused card in 1D mode
    scaleFactor1DUnfocused: 0.7   // Scale for unfocused cards in 1D mode
  }
}

// ===================================
// Global State Management
// ===================================
class ViewerState {
  constructor() {
    this.reset()
  }

  reset() {
    this.scheduledRender = false
    this.isSafari = false
    this.windowSize = { x: 0, y: 0 }
    this.scrollY = 0
    this.pointer = { x: -Infinity, y: -Infinity }
    this.events = { keydown: null, click: null, mousemove: null }
    this.animatedUntilTime = null
    this.reducedMotion = null
    this.anchor = 0
    this.data = []
    this.dummyPlaceholder = null
    this.currentFocusedIndex = null
  }
}

const state = new ViewerState()

// ===================================
// Spring Physics System
// ===================================
class SpringPhysics {
  static create(pos, v = 0, k = CONFIG.animation.spring.stiffness, b = CONFIG.animation.spring.damping) {
    return { pos, dest: pos, v, k, b }
  }

  static step(spring) {
    const t = CONFIG.animation.msPerStep / 1000
    const { pos, dest, v, k, b } = spring
    const Fspring = -k * (pos - dest)
    const Fdamper = -b * v
    const a = Fspring + Fdamper
    spring.v += a * t
    spring.pos += spring.v * t
  }

  static goToEnd(spring) {
    spring.pos = spring.dest
    spring.v = 0
  }

  static forEach(data, fn) {
    for (const d of data) {
      fn(d.x)
      fn(d.y)
      fn(d.scale)
      fn(d.fxFactor)
    }
  }
}

// ===================================
// Layout Calculations (Simplified for uniform cards)
// ===================================
class LayoutCalculator {
  static calculateColumns(containerWidth) {
    const { boxMinSizeX, maxColumns, boxesGapX } = CONFIG.layout
    const cols = Math.max(
      1,
      Math.min(
        maxColumns,
        Math.floor((containerWidth - boxesGapX) / (boxMinSizeX + boxesGapX))
      )
    )
    const boxMaxSizeX = (containerWidth - boxesGapX - cols * boxesGapX) / cols
    return { cols, boxMaxSizeX }
  }

  static getCardSize2D(boxMaxSizeX) {
    // Calculate size maintaining aspect ratio within the max box size
    const { width, height, aspectRatio } = CONFIG.card
    const { scaleFactor2D } = CONFIG.layout

    let cardWidth = Math.min(width, boxMaxSizeX)
    let cardHeight = cardWidth / aspectRatio

    // If height is too large, constrain by height instead
    const maxHeight = boxMaxSizeX * 1.3 // Allow slightly taller cards
    if (cardHeight > maxHeight) {
      cardHeight = maxHeight
      cardWidth = cardHeight * aspectRatio
    }

    return {
      width: cardWidth * scaleFactor2D,
      height: cardHeight * scaleFactor2D
    }
  }

  static calculate2DLayout(dataLength, windowWidth) {
    const { cols, boxMaxSizeX } = this.calculateColumns(windowWidth)
    const cardSize = this.getCardSize2D(boxMaxSizeX)
    const { windowPaddingTop, boxesGapY } = CONFIG.layout

    const rowsTop = [windowPaddingTop]
    const rowCount = Math.ceil(dataLength / cols)

    // All rows have the same height since all cards are the same size
    for (let row = 1; row <= rowCount; row++) {
      rowsTop.push(rowsTop[row - 1] + cardSize.height + boxesGapY)
    }

    return {
      cols,
      boxMaxSizeX,
      cardSize,
      rowsTop,
      rowHeight: cardSize.height
    }
  }
}

// ===================================
// Hit Testing
// ===================================
class HitTester {
  static test2DMode(data, pointerX, pointerY) {
    for (let i = 0; i < data.length; i++) {
      const { x, y } = data[i]
      const cardSize = data[i].displaySize
      if (
        x.dest <= pointerX &&
        pointerX < x.dest + cardSize.width &&
        y.dest <= pointerY &&
        pointerY < y.dest + cardSize.height
      ) {
        return i
      }
    }
    return null
  }

  static test1DMode(data, focused, windowSizeX, pointerX) {
    const { hitArea1DSizeX } = CONFIG.layout
    if (focused > 0 && pointerX <= hitArea1DSizeX) return focused - 1
    if (focused < data.length - 1 && pointerX >= windowSizeX - hitArea1DSizeX)
      return focused + 1
    return null
  }
}

// ===================================
// Navigation Handler
// ===================================
class NavigationHandler {
  static handleKeyboardNavigation(inputCode, focused, currentFocusedIndex, cols, dataLength) {
    if (inputCode === 'Escape') {
      if (focused !== null) {
        state.currentFocusedIndex = focused
      }
      return null
    }

    if (inputCode === 'Space') return focused

    if (
      ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(inputCode) &&
      focused == null
    ) {
      return currentFocusedIndex !== null ? currentFocusedIndex : 0
    }

    if (inputCode === 'ArrowLeft') return Math.max(0, focused - 1)
    if (inputCode === 'ArrowRight') return Math.min(dataLength - 1, focused + 1)
    if (inputCode === 'ArrowUp') return Math.max(0, focused - cols)
    if (inputCode === 'ArrowDown') return Math.min(dataLength - 1, focused + cols)

    return focused
  }

  static updateBrowserHistory(focused, data) {
    const hash = focused == null ? '' : '#' + data[focused].id
    window.history.pushState(
      null,
      '',
      `${window.location.pathname}${window.location.search}${hash}`
    )
  }
}

// ===================================
// Position Calculator (Simplified for uniform cards)
// ===================================
class PositionCalculator {
  static calculate2DPositions(data, layout, pointerX, pointerY) {
    const { cols, boxMaxSizeX, cardSize } = layout
    const { boxesGapX, hoverMagnetFactor } = CONFIG.layout

    for (let i = 0; i < data.length; i++) {
      const d = data[i]
      const col = i % cols
      const row = Math.floor(i / cols)

      // Center cards in their grid cells
      const cellX = boxesGapX + (boxMaxSizeX + boxesGapX) * col
      const cellCenterX = cellX + (boxMaxSizeX - cardSize.width) / 2

      d.x.dest = cellCenterX
      d.y.dest = layout.rowsTop[row]
      d.scale.dest = 1
      d.fxFactor.dest = 1
      d.displaySize = cardSize
    }

    // Apply hover effect
    const hit = HitTester.test2DMode(data, pointerX, pointerY)
    if (hit != null) {
      const d = data[hit]
      d.x.dest += (pointerX - (d.x.dest + cardSize.width / 2)) / hoverMagnetFactor
      d.y.dest += (pointerY - (d.y.dest + cardSize.height / 2)) / hoverMagnetFactor
      d.scale.dest = 1.02
    }

    return hit != null ? 'zoom-in' : 'auto'
  }

  static calculate1DPositions(data, focused, windowSize, inputCode) {
    const { windowPaddingTop, boxes1DGapY, boxes1DGapX, hitArea1DSizeX, scaleFactor1DFocused, scaleFactor1DUnfocused } = CONFIG.layout
    const { aspectRatio } = CONFIG.card

    // Calculate card sizes for 1D mode
    const maxCardHeight = windowSize.y - windowPaddingTop - boxes1DGapY
    const maxCardWidth = windowSize.x - boxes1DGapX * 2 - hitArea1DSizeX * 2

    let focusedCardWidth = maxCardHeight * aspectRatio
    let focusedCardHeight = maxCardHeight

    // Constrain by width if needed
    if (focusedCardWidth > maxCardWidth) {
      focusedCardWidth = maxCardWidth
      focusedCardHeight = focusedCardWidth / aspectRatio
    }

    // Apply scale factors
    focusedCardWidth *= scaleFactor1DFocused
    focusedCardHeight *= scaleFactor1DFocused

    const unfocusedCardWidth = focusedCardWidth * (scaleFactor1DUnfocused / scaleFactor1DFocused)
    const unfocusedCardHeight = focusedCardHeight * (scaleFactor1DUnfocused / scaleFactor1DFocused)

    // Calculate starting position for previous pages
    let currentLeft = hitArea1DSizeX + boxes1DGapX
    for (let i = focused - 1; i >= 0; i--) {
      currentLeft -= unfocusedCardWidth + boxes1DGapX
    }

    // Apply edge and vertical boosts for navigation feel
    const edgeBoost = this.calculateEdgeBoost(inputCode, focused, data.length)
    const verticalBoost = this.calculateVerticalBoost(inputCode)

    // Position all pages
    for (let i = 0; i < data.length; i++) {
      const d = data[i]
      const isFocused = i === focused
      const cardWidth = isFocused ? focusedCardWidth : unfocusedCardWidth
      const cardHeight = isFocused ? focusedCardHeight : unfocusedCardHeight

      d.displaySize = { width: cardWidth, height: cardHeight }
      d.y.dest = Math.max(windowPaddingTop, (windowSize.y - cardHeight) / 2) + state.scrollY
      d.x.dest = isFocused ? (windowSize.x - cardWidth) / 2 : currentLeft
      d.x.v += edgeBoost / (isFocused ? 1 : 4)
      d.y.v += verticalBoost / (isFocused ? 1 : 4)
      d.scale.dest = 1
      d.fxFactor.dest = isFocused ? 1 : 0.2

      currentLeft = isFocused ? windowSize.x - hitArea1DSizeX : currentLeft + cardWidth + boxes1DGapX
    }
  }

  static calculateEdgeBoost(inputCode, focused, dataLength) {
    if (inputCode === 'ArrowLeft' && focused === 0) return 2000
    if (inputCode === 'ArrowRight' && focused === dataLength - 1) return -2000
    return 0
  }

  static calculateVerticalBoost(inputCode) {
    if (inputCode === 'ArrowUp') return -1500
    if (inputCode === 'ArrowDown') return 1500
    return 0
  }
}

// ===================================
// DOM Renderer (Simplified for uniform cards)
// ===================================
class DOMRenderer {
  static updateElements(data, focused, scrollY, windowSize) {
    const { browserUIMaxSizeTop, browserUIMaxSizeBottom, minBrightness } = CONFIG.layout

    for (let i = 0; i < data.length; i++) {
      const d = data[i]
      const { node } = d
      const img = node.children[0]

      // Always render adjacent pages when in focused mode
      const isAdjacentToFocused = focused != null &&
        (i === focused - 1 || i === focused || i === focused + 1)

      const inView = isAdjacentToFocused || this.isInViewport(d, scrollY, windowSize, browserUIMaxSizeTop, browserUIMaxSizeBottom)

      if (inView) {
        this.applyStyles(node, d, i, focused, minBrightness, data.length)
        img.style.display = 'block'

        if (node.parentNode == null) {
          document.body.appendChild(node)
        }
      } else if (node.parentNode != null) {
        document.body.removeChild(node)
      }
    }
  }

  static isInViewport(d, scrollY, windowSize, topMargin, bottomMargin) {
    const cardSize = d.displaySize || { width: CONFIG.card.width, height: CONFIG.card.height }
    return (
      d.y.pos - scrollY <= windowSize.y + bottomMargin &&
      d.y.pos + cardSize.height - scrollY >= -topMargin &&
      d.x.pos <= windowSize.x &&
      d.x.pos + cardSize.width >= 0
    )
  }

  static applyStyles(node, d, index, focused, minBrightness, totalItems) {
    const cardSize = d.displaySize || { width: CONFIG.card.width, height: CONFIG.card.height }
    node.style.width = `${cardSize.width}px`
    node.style.height = `${cardSize.height}px`
    node.style.transform = `translate3d(${d.x.pos}px,${d.y.pos}px,0) scale(${d.scale.pos})`

    // Ensure minimum brightness to prevent "erased" pages
    const brightness = Math.max(minBrightness, d.fxFactor.pos)

    if (focused != null && (index === focused - 1 || index === focused || index === focused + 1)) {
      const blur = Math.max(0, 6 - brightness * 6)
      node.style.filter = `brightness(${brightness * 100}%) blur(${blur}px)`
    } else {
      node.style.filter = `brightness(${brightness * 100}%)`
    }

    node.style.zIndex = index === focused ? totalItems + 999 : index + 1
  }

  static updateDocumentStyles(focused, rowsTop) {
    document.body.style.cursor = state.events.mousemove ? 'auto' : document.body.style.cursor
    document.body.style.overflowY = focused == null ? 'auto' : 'hidden'
    if (state.dummyPlaceholder && rowsTop) {
      state.dummyPlaceholder.style.height = `${rowsTop.at(-1)}px`
    }
  }
}

// ===================================
// Main Render Engine
// ===================================
class RenderEngine {
  static render(now) {
    if (state.data.length === 0) return false

    // Process events
    const inputCode = state.events.keydown?.code ?? null
    this.updatePointer()

    // Get current state
    const newWindowSize = {
      x: document.documentElement.clientWidth,
      y: document.documentElement.clientHeight
    }
    const animationDisabled = state.reducedMotion.matches
    const currentScrollY = state.isSafari ? document.body.scrollTop : window.scrollY
    const currentScrollX = state.isSafari ? document.body.scrollLeft : window.scrollX
    const hashImgId = window.location.hash.slice(1)

    // Determine focused item
    let focused = hashImgId ? state.data.findIndex((d) => d.id === hashImgId) : null
    if (focused === -1) focused = null

    const pointerXLocal = state.pointer.x + currentScrollX
    const pointerYLocal = state.pointer.y + currentScrollY

    // Calculate layout
    const layout = LayoutCalculator.calculate2DLayout(state.data.length, newWindowSize.x)

    // Handle navigation
    let newFocused = NavigationHandler.handleKeyboardNavigation(
      inputCode,
      focused,
      state.currentFocusedIndex,
      layout.cols,
      state.data.length
    )

    // Handle clicks
    if (state.events.click) {
      newFocused = this.handleClick(focused, pointerXLocal, pointerYLocal, newFocused, newWindowSize.x)
    }

    // Update positions and get cursor
    let cursor = 'auto'
    let newAnchor = state.anchor
    let adjustedScrollTop = currentScrollY

    if (newFocused == null) {
      // 2D Grid Mode
      adjustedScrollTop = this.handle2DMode(
        focused,
        layout,
        pointerXLocal,
        pointerYLocal,
        currentScrollY,
        newWindowSize,
        newAnchor
      )
      cursor = PositionCalculator.calculate2DPositions(state.data, layout, pointerXLocal, pointerYLocal)
    } else {
      // 1D Focused Mode
      cursor = this.handle1DMode(newFocused, newWindowSize, pointerXLocal, pointerYLocal, inputCode)
    }

    // Update scroll positions
    this.updateScrollPositions(adjustedScrollTop, currentScrollY)

    // Animate
    const stillAnimating = this.animate(now, animationDisabled)

    // Update DOM
    DOMRenderer.updateElements(state.data, newFocused, adjustedScrollTop, newWindowSize)
    DOMRenderer.updateDocumentStyles(newFocused, layout.rowsTop)

    // Update cursor
    document.body.style.cursor = cursor

    // Update state
    this.updateState(adjustedScrollTop, newFocused, focused, newAnchor, newWindowSize)

    return stillAnimating
  }

  static updatePointer() {
    if (state.events.click) {
      state.pointer.x = state.events.click.clientX
      state.pointer.y = state.events.click.clientY
    }
    if (state.events.mousemove) {
      state.pointer.x = state.events.mousemove.clientX
      state.pointer.y = state.events.mousemove.clientY
    }
  }

  static handleClick(focused, pointerX, pointerY, newFocused, windowSizeX) {
    const { target } = state.events.click

    if (focused == null) {
      const hitIndex = HitTester.test2DMode(state.data, pointerX, pointerY)
      return hitIndex ?? newFocused
    }

    return HitTester.test1DMode(state.data, focused, windowSizeX, pointerX) ?? newFocused
  }

  static handle2DMode(focused, layout, pointerX, pointerY, currentScrollY, windowSize, currentAnchor) {
    const { rowsTop, cardSize } = layout
    let adjustedScrollTop = currentScrollY

    if (focused != null) {
      const row = Math.floor(focused / layout.cols)
      const focusedTop = rowsTop[row]
      const focusedBottom = focusedTop + cardSize.height
      if (focusedTop <= currentScrollY || focusedBottom >= currentScrollY + windowSize.y) {
        adjustedScrollTop = focusedTop - CONFIG.layout.boxesGapY - CONFIG.layout.gapTopPeek
      }
    }

    // Update anchor if window resized or scrolled significantly
    const anchorY = state.data[state.anchor].y.dest - CONFIG.layout.gapTopPeek
    if (windowSize.x !== state.windowSize.x) {
      adjustedScrollTop = Math.max(0, anchorY)
    }

    if (adjustedScrollTop !== state.scrollY && Math.abs(anchorY - adjustedScrollTop) > windowSize.y / 10) {
      for (let newAnchor = 0; newAnchor < state.data.length; newAnchor += layout.cols) {
        const d = state.data[newAnchor]
        if (d.y.dest + cardSize.height - adjustedScrollTop > windowSize.y / 5) {
          state.anchor = newAnchor
          break
        }
      }
    }

    return adjustedScrollTop
  }

  static handle1DMode(focused, windowSize, pointerX, pointerY, inputCode) {
    PositionCalculator.calculate1DPositions(state.data, focused, windowSize, inputCode)

    // Apply hover effect
    const hit = HitTester.test1DMode(state.data, focused, windowSize.x, pointerX)
    if (hit != null) {
      const d = state.data[hit]
      const cardSize = d.displaySize
      d.x.dest += (pointerX - (d.x.dest + cardSize.width / 2)) / CONFIG.layout.hoverMagnetFactor
      d.y.dest += (pointerY - (d.y.dest + cardSize.height / 2)) / CONFIG.layout.hoverMagnetFactor
      d.scale.dest = 1.02
      d.fxFactor.dest = 0.5
      return 'zoom-in'
    }

    return 'zoom-out'
  }

  static updateScrollPositions(adjustedScrollTop, currentScrollY) {
    for (const d of state.data) {
      d.y.pos += adjustedScrollTop - currentScrollY
    }
  }

  static animate(now, animationDisabled) {
    let newAnimatedUntilTime = state.animatedUntilTime ?? now
    const steps = Math.floor((now - newAnimatedUntilTime) / CONFIG.animation.msPerStep)
    newAnimatedUntilTime += steps * CONFIG.animation.msPerStep
    let stillAnimating = false

    if (animationDisabled) {
      SpringPhysics.forEach(state.data, SpringPhysics.goToEnd)
    } else {
      SpringPhysics.forEach(state.data, (spring) => {
        for (let i = 0; i < steps; i++) SpringPhysics.step(spring)
        if (Math.abs(spring.v) < 0.01 && Math.abs(spring.dest - spring.pos) < 0.01) {
          SpringPhysics.goToEnd(spring)
        } else {
          stillAnimating = true
        }
      })
    }

    state.animatedUntilTime = stillAnimating ? newAnimatedUntilTime : null
    return stillAnimating
  }

  static updateState(adjustedScrollTop, newFocused, focused, newAnchor, newWindowSize) {
    if (adjustedScrollTop !== state.scrollY) {
      (state.isSafari ? document.body : window).scrollTo({ top: adjustedScrollTop })
    }

    if (newFocused !== focused) {
      NavigationHandler.updateBrowserHistory(newFocused, state.data)
    }

    state.events.keydown = state.events.click = state.events.mousemove = null
    state.anchor = newAnchor
    state.windowSize = newWindowSize
    state.scrollY = adjustedScrollTop
  }
}

// ===================================
// Initialization (Simplified for uniform cards)
// ===================================
class CardViewerInitializer {
  static createCardData(item, index) {
    const currentWindowSizeX = state.windowSize.x || document.documentElement.clientWidth
    const { cols, boxMaxSizeX } = LayoutCalculator.calculateColumns(currentWindowSizeX)
    const cardSize = LayoutCalculator.getCardSize2D(boxMaxSizeX)

    const node = document.createElement('div')
    node.className = 'box'
    node.setAttribute('data-page-id', item.id)
    node.style.backgroundImage = `url(${item.lowResSrc})`

    const img = document.createElement('img')
    node.appendChild(img)

    const col = index % cols
    const row = Math.floor(index / cols)
    const cellX = CONFIG.layout.boxesGapX + (boxMaxSizeX + CONFIG.layout.boxesGapX) * col
    const cellCenterX = cellX + (boxMaxSizeX - cardSize.width) / 2
    const initialY = CONFIG.layout.windowPaddingTop + row * (cardSize.height + CONFIG.layout.boxesGapY)

    return {
      id: item.id,
      x: SpringPhysics.create(cellCenterX),
      y: SpringPhysics.create(initialY),
      scale: SpringPhysics.create(1),
      fxFactor: SpringPhysics.create(1),
      node,
      highResSrc: item.highResSrc,
      displaySize: cardSize
    }
  }

  static setupEventListeners() {
    window.addEventListener('resize', scheduleRender)
    window.addEventListener('scroll', scheduleRender, true)
    window.addEventListener('popstate', scheduleRender)

    window.addEventListener('keydown', (e) => {
      if (e.code === 'Space') {
        e.preventDefault()
      }
      state.events.keydown = e
      scheduleRender()
    })

    window.addEventListener('click', (e) => {
      state.events.click = e
      scheduleRender()
    })

    window.addEventListener('mousemove', (e) => {
      state.events.mousemove = e
      scheduleRender()
    })
  }

  static detectEnvironment() {
    state.isSafari = navigator.userAgent.includes('Safari') && !navigator.userAgent.includes('Chrome')

    if (state.isSafari) {
      document.body.style.contain = 'layout'
      document.body.style.width = '100vw'
      document.body.style.height = '100vh'
    }

    state.reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)')
    state.windowSize = {
      x: document.documentElement.clientWidth,
      y: document.documentElement.clientHeight
    }
    state.scrollY = state.isSafari ? document.body.scrollTop : window.scrollY
  }

  static createPlaceholder() {
    state.dummyPlaceholder = document.createElement('div')
    state.dummyPlaceholder.style.position = 'absolute'
    state.dummyPlaceholder.style.width = '1px'
    document.body.append(state.dummyPlaceholder)
  }

  static setupDebugMode() {
    if (CONFIG.debug) {
      document.documentElement.style.background = 'repeating-linear-gradient(#e66465 0px, #9198e5 300px)'
      document.documentElement.style.height = '100%'
    }
  }
}

// ===================================
// Utility Functions
// ===================================
function scheduleRender() {
  if (!state.scheduledRender) {
    state.scheduledRender = true
    requestAnimationFrame(function (now) {
      state.scheduledRender = false
      if (RenderEngine.render(now)) scheduleRender()
    })
  }
}

// ===================================
// Public API (Simplified for uniform cards)
// ===================================
export function initCardViewer(initialData) {
  // Clear existing data and DOM nodes
  state.data.forEach((d) => {
    if (d.node && d.node.parentNode) {
      document.body.removeChild(d.node)
    }
  })

  // Create new card data
  state.data = initialData.map((item, index) =>
    CardViewerInitializer.createCardData(item, index)
  )

  // Force initial positions to be set immediately
  SpringPhysics.forEach(state.data, SpringPhysics.goToEnd)

  scheduleRender()
}

export function updateCardImage(id, highResSrc) {
  const card = state.data.find((d) => d.id === id)
  if (!card) return

  card.node.children[0].src = highResSrc
  card.highResSrc = highResSrc

  scheduleRender()
}

export function initializeCardViewer() {
  CardViewerInitializer.detectEnvironment()
  CardViewerInitializer.createPlaceholder()
  CardViewerInitializer.setupDebugMode()
  CardViewerInitializer.setupEventListeners()

  // Reset state
  state.pointer = { x: -Infinity, y: -Infinity }
  state.events = { keydown: null, click: null, mousemove: null }

  scheduleRender()
}
