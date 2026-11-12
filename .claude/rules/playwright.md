# Playwright Rules

- All Playwright MCP output — screenshots, PDFs, traces, downloads — must be written to `.playwright-mcp/`. Never write to the repo root, `packages/`, or any other project directory.
- When taking screenshots (`browser_take_screenshot` or similar), always pass an explicit filename under `.playwright-mcp/` (e.g. `.playwright-mcp/studio-media-drawer.png`).
- `.playwright-mcp/` is gitignored — its contents are session artifacts, never committed.
