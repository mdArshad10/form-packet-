import { readFile, writeFile, mkdir } from "node:fs/promises"
import path from "node:path"

import { chromium } from "playwright"

const root = process.cwd()
const pass =
  process.argv.find((arg) => arg.startsWith("--pass="))?.split("=")[1] ?? "1"
const mode =
  process.argv.find((arg) => arg.startsWith("--mode="))?.split("=")[1] ??
  "desktop"
const origin = "http://formpack.local"
const evidenceDir = path.join(
  root,
  "audits",
  "formpack-v0",
  "evidence",
  `pass-${pass}`,
)
const dataPath = path.join(
  root,
  "audits",
  "formpack-v0",
  "data",
  `pass-${pass}-${mode}.json`,
)
const axePath = path.join(root, "node_modules", "axe-core", "axe.min.js")

const routes = [
  "/",
  "/prepare",
  "/prepare/requirements",
  "/prepare/files",
  "/prepare/file/photo",
  "/prepare/check",
  "/prepare/download",
  "/fix",
  "/fix/requirements",
  "/fix/file",
  "/fix/result",
  "/quick-tools",
  "/quick-tools/image-size",
  "/photo-compressor",
  "/quick-tools/image-dimensions",
  "/quick-tools/signature",
  "/quick-tools/pdf-size",
  "/privacy",
  "/limitations",
]

const viewports = [
  {
    name: "desktop",
    width: 1440,
    height: 900,
    isMobile: false,
    hasTouch: false,
  },
  { name: "mobile", width: 375, height: 812, isMobile: true, hasTouch: true },
]
const stressWidths = [1920, 1440, 1280, 1024, 768, 375]

const mime = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".map": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".woff2": "font/woff2",
}

const slug = (route) =>
  route === "/" ? "home" : route.slice(1).replaceAll("/", "-")
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

async function serveBuild(page) {
  await page.route(`${origin}/**`, async (route) => {
    const url = new URL(route.request().url())
    const candidate = url.pathname.startsWith("/assets/")
      ? path.join(root, "dist", url.pathname)
      : path.join(root, "dist", "index.html")

    try {
      const body = await readFile(candidate)
      await route.fulfill({
        status: 200,
        body,
        contentType:
          mime[path.extname(candidate)] ?? "application/octet-stream",
      })
    } catch {
      await route.fulfill({
        status: 404,
        body: "Not found",
        contentType: "text/plain",
      })
    }
  })
}

async function installPerformanceObservers(page) {
  await page.addInitScript(() => {
    window.__formpackAuditVitals = { cls: 0, lcp: 0, inp: 0 }
    try {
      new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          if (!entry.hadRecentInput)
            window.__formpackAuditVitals.cls += entry.value
        }
      }).observe({ type: "layout-shift", buffered: true })
      new PerformanceObserver((list) => {
        const entries = list.getEntries()
        const last = entries.at(-1)
        if (last) window.__formpackAuditVitals.lcp = last.startTime
      }).observe({ type: "largest-contentful-paint", buffered: true })
      new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          window.__formpackAuditVitals.inp = Math.max(
            window.__formpackAuditVitals.inp,
            entry.duration ?? 0,
          )
        }
      }).observe({ type: "event", buffered: true, durationThreshold: 16 })
    } catch {
      // Unsupported observer types are recorded as zero rather than breaking the audit.
    }
  })
}

async function inspectPage(page) {
  return page.evaluate(() => {
    const visible = (element) => {
      const style = getComputedStyle(element)
      const rect = element.getBoundingClientRect()
      return (
        style.visibility !== "hidden" &&
        style.display !== "none" &&
        style.opacity !== "0" &&
        style.pointerEvents !== "none" &&
        rect.width > 0 &&
        rect.height > 0
      )
    }
    const selectorFor = (element) => {
      if (element.id) return `#${element.id}`
      const classes = [...element.classList].slice(0, 2).join(".")
      return `${element.tagName.toLowerCase()}${classes ? `.${classes}` : ""}`
    }
    const interactive = [
      ...document.querySelectorAll(
        "a, button, input, select, textarea, [role='button']",
      ),
    ]
      .filter(visible)
      .map((element) => {
        const rect = element.getBoundingClientRect()
        return {
          selector: selectorFor(element),
          name:
            element.getAttribute("aria-label") ||
            element.textContent?.trim().replace(/\s+/g, " ").slice(0, 100) ||
            element.getAttribute("name") ||
            element.getAttribute("type") ||
            "",
          width: Math.round(rect.width * 10) / 10,
          height: Math.round(rect.height * 10) / 10,
          disabled: element.matches(":disabled, [aria-disabled='true']"),
        }
      })
    const tinyTargets = interactive.filter(
      (item) => !item.disabled && (item.width < 44 || item.height < 44),
    )
    const viewportWidth = window.innerWidth
    const overflowElements = [...document.querySelectorAll("body *")]
      .filter(visible)
      .filter((element) => {
        if (element.closest(".step-nav, .slot-sidebar")) return false
        const rect = element.getBoundingClientRect()
        return rect.right > viewportWidth + 2 || rect.left < -2
      })
      .slice(0, 25)
      .map((element) => {
        const rect = element.getBoundingClientRect()
        return {
          selector: selectorFor(element),
          left: Math.round(rect.left),
          right: Math.round(rect.right),
        }
      })
    const headings = [
      ...document.querySelectorAll("h1, h2, h3, h4, h5, h6"),
    ].map((heading) => ({
      level: Number(heading.tagName.slice(1)),
      text: heading.textContent?.trim().replace(/\s+/g, " ").slice(0, 120),
    }))
    const headingSkips = headings.filter(
      (heading, index) =>
        index > 0 && heading.level > headings[index - 1].level + 1,
    )
    const ids = [...document.querySelectorAll("[id]")].map(
      (element) => element.id,
    )
    const duplicateIds = ids.filter((id, index) => ids.indexOf(id) !== index)
    return {
      title: document.querySelector("h1")?.textContent?.trim() ?? "",
      pathname: location.pathname,
      bodyOverflow: document.documentElement.scrollWidth > viewportWidth + 2,
      documentWidth: document.documentElement.scrollWidth,
      viewportWidth,
      interactive,
      tinyTargets,
      overflowElements,
      headings,
      headingSkips,
      duplicateIds: [...new Set(duplicateIds)],
    }
  })
}

async function runAxe(page) {
  await page.addScriptTag({ path: axePath })
  return page.evaluate(async () => {
    const result = await window.axe.run(document, {
      runOnly: {
        type: "tag",
        values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"],
      },
    })
    return result.violations.map((violation) => ({
      id: violation.id,
      impact: violation.impact,
      description: violation.description,
      nodes: violation.nodes.map((node) => ({
        target: node.target,
        summary: node.failureSummary,
      })),
    }))
  })
}

async function clickAndReturn(page, locator, originalPath) {
  if (!(await locator.count()))
    return { performed: false, detail: "No applicable primary action" }
  const first = locator.first()
  if (!(await first.isVisible()) || !(await first.isEnabled())) {
    return {
      performed: false,
      detail: "Primary action is unavailable or disabled",
    }
  }
  const name =
    (await first.getAttribute("aria-label")) ??
    (await first.textContent())?.trim().replace(/\s+/g, " ").slice(0, 90) ??
    "control"
  await first.click()
  await delay(60)
  if (new URL(page.url()).pathname !== originalPath) {
    await page.goBack()
    await page.waitForLoadState("domcontentloaded")
    await delay(40)
  }
  return { performed: true, detail: name }
}

async function performRouteAction(page, route) {
  if (route === "/prepare") {
    await page
      .locator("label.selection-row", {
        has: page.getByText("Visa or passport", { exact: true }),
      })
      .click()
    return { performed: true, detail: "Selected Visa or passport category" }
  }
  if (route === "/prepare/requirements") {
    const field = page.getByLabel("Required filename")
    await field.fill("résumé (final)(2).jpg")
    await field.press("Tab")
    return {
      performed: true,
      detail: "Typed and blurred a real-flavour filename",
    }
  }
  if (route === "/prepare/files") {
    const input = page.locator("input[type='file']").first()
    await input.setInputFiles({
      name: "résumé (final)(2).png",
      mimeType: "image/png",
      buffer: Buffer.from(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
        "base64",
      ),
    })
    return {
      performed: true,
      detail: "Attached a PNG with spaces, parentheses, and a diacritic",
    }
  }
  if (
    route.startsWith("/fix") ||
    route.startsWith("/quick-tools") ||
    route === "/prepare/file/photo" ||
    route === "/prepare/check"
  ) {
    return clickAndReturn(page, page.locator("main a"), route)
  }
  if (route === "/prepare/download") {
    return {
      performed: false,
      detail: "Only primary control is intentionally disabled in v0",
    }
  }
  if (route === "/privacy" || route === "/limitations") {
    return clickAndReturn(page, page.locator("header a").first(), route)
  }
  return clickAndReturn(page, page.locator("main a").first(), route)
}

async function collectViewport(page, viewport) {
  await page.setViewportSize({ width: viewport.width, height: viewport.height })
  const consoleEntries = []
  const networkEntries = []
  let activeRoute = "/"
  page.on("console", (message) => {
    if (message.type() === "warning" || message.type() === "error") {
      consoleEntries.push({
        route: activeRoute,
        type: message.type(),
        text: message.text(),
      })
    }
  })
  page.on("pageerror", (error) =>
    consoleEntries.push({
      route: activeRoute,
      type: "error",
      text: error.message,
    }),
  )
  page.on("response", (response) => {
    if (response.status() >= 400)
      networkEntries.push({
        route: activeRoute,
        status: response.status(),
        url: response.url(),
      })
  })
  const results = []
  for (const route of routes) {
    activeRoute = route
    process.stdout.write(`[pass ${pass}] ${viewport.name} ${route}\n`)
    const startedAt = new Date().toISOString()
    await page.goto(`${origin}${route}`, { waitUntil: "domcontentloaded" })
    await delay(80)
    const beforePath = path.join(
      evidenceDir,
      `${slug(route)}-${viewport.name}-before.png`,
    )
    await page.screenshot({ path: beforePath, fullPage: true })
    const before = await inspectPage(page)
    const axe = await runAxe(page)
    const action = await performRouteAction(page, route)
    await delay(40)

    let detail = {
      available: false,
      detail: "No route-specific detail surface",
    }
    if (viewport.name === "mobile") {
      const menu = page.getByRole("button", { name: /navigation/i })
      if (await menu.count()) {
        await menu.click()
        detail = { available: true, detail: "Opened mobile navigation" }
      }
    } else {
      await page.evaluate(() =>
        window.scrollTo(0, document.documentElement.scrollHeight),
      )
    }
    const afterPath = path.join(
      evidenceDir,
      `${slug(route)}-${viewport.name}-after.png`,
    )
    await page.screenshot({ path: afterPath, fullPage: true })
    const after = await inspectPage(page)
    if (viewport.name === "mobile" && detail.available) {
      await page.getByRole("button", { name: /navigation/i }).click()
    }

    results.push({
      route,
      viewport: viewport.name,
      startedAt,
      finishedAt: new Date().toISOString(),
      screenshots: [
        path.relative(root, beforePath),
        path.relative(root, afterPath),
      ],
      action,
      detail,
      typedInput: route === "/prepare/requirements",
      consoleRead: true,
      networkProbe: true,
      before,
      after,
      axe,
      console: consoleEntries.filter((entry) => entry.route === route),
      network: networkEntries.filter((entry) => entry.route === route),
    })
  }

  return results
}

async function collectStressMatrix(page) {
  const matrix = []
  for (const route of routes) {
    for (const width of stressWidths) {
      await page.setViewportSize({ width, height: width <= 768 ? 812 : 900 })
      await page.goto(`${origin}${route}`, { waitUntil: "domcontentloaded" })
      await delay(10)
      const state = await inspectPage(page)
      matrix.push({
        route,
        width,
        bodyOverflow: state.bodyOverflow,
        overflowElements: state.overflowElements,
        tinyTargets: state.tinyTargets,
      })
    }
  }
  return matrix
}

async function collectWorkflow(page) {
  await page.setViewportSize({ width: 375, height: 812 })
  const consoleEntries = []
  page.on("console", (message) => {
    if (["warning", "error"].includes(message.type()))
      consoleEntries.push({ type: message.type(), text: message.text() })
  })
  page.on("pageerror", (error) =>
    consoleEntries.push({ type: "error", text: error.message }),
  )
  const steps = []
  const record = async (name, expected, observed) => {
    steps.push({
      at: new Date().toISOString(),
      name,
      expected,
      observed,
      pass: expected === observed,
    })
    await delay(60)
  }

  await page.goto(`${origin}/`, { waitUntil: "domcontentloaded" })
  await delay(120)
  await page.screenshot({
    path: path.join(evidenceDir, "workflow-home-mobile.png"),
    fullPage: true,
  })
  await page
    .locator("main")
    .getByRole("link", { name: "Prepare application files" })
    .first()
    .click()
  await record("Home primary CTA", "/prepare", new URL(page.url()).pathname)
  await page
    .locator("label.selection-row", {
      has: page.getByText("Visa or passport", { exact: true }),
    })
    .click()
  await record(
    "Category choice",
    true,
    await page.getByLabel("Visa or passport").isChecked(),
  )
  await page
    .getByRole("link", { name: /Photo, signature, and certificate/ })
    .click()
  await record(
    "Starter pattern",
    "/prepare/requirements",
    new URL(page.url()).pathname,
  )

  const maxSize = page.getByLabel("Maximum file size")
  await maxSize.fill("321")
  await page
    .getByLabel("Dimensions, ratio, or page limit")
    .fill("600 x 800 px portrait")
  await page.getByLabel("Required filename").fill("résumé (final)(2).jpg")
  await page.getByLabel("Required filename").press("Tab")
  await record(
    "Requirement entry",
    "résumé (final)(2).jpg",
    await page.getByLabel("Required filename").inputValue(),
  )
  await page.screenshot({
    path: path.join(evidenceDir, "workflow-requirements-entered.png"),
    fullPage: true,
  })

  await page.reload({ waitUntil: "domcontentloaded" })
  await delay(80)
  const afterReload = await page.getByLabel("Maximum file size").inputValue()
  await record("Requirement survives refresh", "321", afterReload)

  await page.getByLabel("Maximum file size").fill("0")
  await record(
    "Invalid requirement blocks progression",
    true,
    (await page
      .locator(".action-link", { hasText: "Continue to files" })
      .getAttribute("aria-disabled")) === "true",
  )
  await page.getByLabel("Maximum file size").fill("321")

  await page.getByRole("link", { name: "Continue to files" }).click()
  const inputs = page.locator("input[type='file']")
  const png = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
    "base64",
  )
  await inputs.nth(0).setInputFiles({
    name: "résumé (final)(2).png",
    mimeType: "image/png",
    buffer: png,
  })
  await record(
    "Wrong image format rejected",
    "Not ready",
    (
      await page
        .locator(".upload-row")
        .nth(0)
        .locator(".status-label")
        .textContent()
    )?.trim(),
  )
  await inputs.nth(1).setInputFiles({
    name: "signature.jpg",
    mimeType: "image/jpeg",
    buffer: Buffer.from([0xff, 0xd8, 0xff, 0xd9]),
  })
  await inputs.nth(2).setInputFiles({
    name: "certificate.pdf",
    mimeType: "application/pdf",
    buffer: Buffer.from("%PDF-1.4\n%%EOF"),
  })
  await page.screenshot({
    path: path.join(evidenceDir, "workflow-files-attached.png"),
    fullPage: true,
  })

  await inputs.nth(0).setInputFiles({
    name: "empty-photo.jpg",
    mimeType: "image/jpeg",
    buffer: Buffer.alloc(0),
  })
  await record(
    "Zero-byte image rejected",
    "Not ready",
    (
      await page
        .locator(".upload-row")
        .nth(0)
        .locator(".status-label")
        .textContent()
    )?.trim(),
  )

  await inputs.nth(0).setInputFiles({
    name: "oversized-photo.jpg",
    mimeType: "image/jpeg",
    buffer: Buffer.alloc(330 * 1024, 1),
  })
  await page
    .locator(".upload-row")
    .nth(0)
    .getByRole("link", { name: /Inspect/ })
    .click()
  const confirm = page.getByRole("button", { name: "Confirm visual review" })
  await record(
    "Oversized file cannot be visually confirmed as ready",
    true,
    await confirm.isDisabled(),
  )
  await page.screenshot({
    path: path.join(evidenceDir, "workflow-oversized-inspector.png"),
    fullPage: true,
  })
  if (await confirm.isEnabled()) {
    await confirm.click()
    await record(
      "Visual review cannot override mechanical failure",
      "Not ready",
      (
        await page.locator(".page-heading-aside .status-label").textContent()
      )?.trim(),
    )
  }

  await page.goto(`${origin}/`, { waitUntil: "domcontentloaded" })
  const menu = page.getByRole("button", { name: "Open navigation" })
  await menu.click()
  await page.keyboard.press("Escape")
  const menuButton = page.locator(".menu-button")
  await record(
    "Escape closes mobile navigation",
    false,
    (await menuButton.getAttribute("aria-expanded")) === "true",
  )
  await page.screenshot({
    path: path.join(evidenceDir, "workflow-mobile-menu-escape.png"),
    fullPage: true,
  })

  await page.goto(`${origin}/`, { waitUntil: "domcontentloaded" })
  await page.keyboard.press("Tab")
  const firstFocus = await page.evaluate(
    () => document.activeElement?.className ?? "",
  )
  await page.keyboard.press("Enter")
  await record(
    "Skip link reaches main content",
    "main-content",
    await page.evaluate(
      () => document.activeElement?.id || location.hash.slice(1),
    ),
  )

  await page.evaluate(() => {
    sessionStorage.setItem(
      "formpack-pack-v0",
      JSON.stringify({
        category: "government",
        requirements: { photo: { format: "JPG" } },
      }),
    )
  })
  await page.reload({ waitUntil: "domcontentloaded" })
  await record(
    "Stale tab state falls back safely",
    "Make every file fit the form.",
    await page.locator("h1").textContent(),
  )

  await page.emulateMedia({ reducedMotion: "reduce" })
  const reducedMotion = await page.evaluate(() => ({
    scrollBehavior: getComputedStyle(document.documentElement).scrollBehavior,
    actionTransition: getComputedStyle(document.querySelector(".action-link"))
      .transitionProperty,
  }))
  await page.emulateMedia({ forcedColors: "active" })
  const forcedColors = await page.evaluate(() => ({
    matches: matchMedia("(forced-colors: active)").matches,
    focusOutlineColor: getComputedStyle(document.querySelector(".action-link"))
      .outlineColor,
  }))
  await page.emulateMedia({
    media: "screen",
    reducedMotion: "no-preference",
    forcedColors: "none",
  })

  const navigation = await page.evaluate(() => {
    const entry = performance.getEntriesByType("navigation")[0]
    return entry
      ? { dcl: entry.domContentLoadedEventEnd, load: entry.loadEventEnd }
      : null
  })
  await delay(120)
  const vitals = await page.evaluate(() => window.__formpackAuditVitals)
  return {
    steps,
    firstFocus,
    console: consoleEntries,
    reducedMotion,
    forcedColors,
    performance: { ...vitals, navigation },
  }
}

await mkdir(evidenceDir, { recursive: true })
const startedAt = new Date().toISOString()
const browser = await chromium.launch({
  headless: true,
  args: ["--single-process", "--disable-gpu"],
})

try {
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 1,
    locale: "en-IN",
  })
  const page = await context.newPage()
  await serveBuild(page)
  await installPerformanceObservers(page)
  let result
  if (mode === "desktop" || mode === "mobile") {
    const viewport = viewports.find((item) => item.name === mode)
    result = {
      pass,
      mode,
      startedAt,
      routes,
      viewport,
      surfaces: await collectViewport(page, viewport),
    }
  } else if (mode === "stress") {
    process.stdout.write(`[pass ${pass}] responsive stress matrix\n`)
    result = {
      pass,
      mode,
      startedAt,
      routes,
      stress: await collectStressMatrix(page),
    }
  } else if (mode === "workflow") {
    process.stdout.write(`[pass ${pass}] mobile primary workflow\n`)
    result = {
      pass,
      mode,
      startedAt,
      routes,
      workflow: await collectWorkflow(page),
    }
  } else {
    throw new Error(`Unknown audit mode: ${mode}`)
  }
  result.finishedAt = new Date().toISOString()
  await writeFile(dataPath, `${JSON.stringify(result, null, 2)}\n`)
  process.stdout.write(
    `[pass ${pass}] wrote ${path.relative(root, dataPath)}\n`,
  )
} finally {
  await browser.close()
}
