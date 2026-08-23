# OpenPlanter Web Deep Upgrade Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the OpenPlanter Vercel/browser build reliably web-enabled without separate Exa/Firecrawl keys, add configurable OpenRouter subagents, eliminate browser token/event spam, and make sessions/settings/research fully usable on iPhone-sized screens.

**Architecture:** Keep the existing local-first browser store and terminal-style UI. Add a typed browser-preferences module, an OpenRouter server-tool request builder, one mutable browser run-status component, a portrait-first mobile dock/thread sheet, and a tabbed Control Center. OpenRouter server tools provide built-in search/fetch and subagents; optional Exa/Firecrawl remain enhancement paths only.

**Tech Stack:** TypeScript 5.6, Vite 6, Vitest 4, happy-dom, Playwright, browser `localStorage`, OpenRouter Chat Completions server tools, vanilla DOM/CSS.

**Spec:** `docs/superpowers/specs/2026-08-23-openplanter-web-deep-upgrade-design.md`

## Global Constraints

- Preserve the existing OpenPlanter terminal/research visual identity.
- Basic OpenRouter web search/fetch must not require user Exa or Firecrawl credentials.
- Never reintroduce `plugins: [{ id: "web" }]`.
- Never force ZDR or OpenRouter `data_collection` policy.
- Mobile controls must be usable in portrait down to 320px and respect iOS safe-area insets.
- Existing browser sessions/history/credentials must survive migration.
- Browser event fixes must not break Tauri event delivery.
- Every task follows red → green → regression verification and ends with a commit.

---

## File Map

**Create**
- `openplanter-desktop/frontend/src/api/webPreferences.ts`
- `openplanter-desktop/frontend/src/api/webPreferences.test.ts`
- `openplanter-desktop/frontend/src/api/openrouterTools.ts`
- `openplanter-desktop/frontend/src/api/openrouterTools.test.ts`
- `openplanter-desktop/frontend/src/components/MobileDock.ts`
- `openplanter-desktop/frontend/src/components/MobileDock.test.ts`
- `openplanter-desktop/frontend/src/components/WebSettings.test.ts`
- `openplanter-desktop/frontend/e2e/mobile.spec.ts`

**Modify**
- `openplanter-desktop/frontend/src/api/web.ts`
- `openplanter-desktop/frontend/src/api/web.openrouter.test.ts`
- `openplanter-desktop/frontend/src/main.ts`
- `openplanter-desktop/frontend/src/components/ChatPane.ts`
- `openplanter-desktop/frontend/src/components/ChatPane.test.ts`
- `openplanter-desktop/frontend/src/components/App.ts`
- `openplanter-desktop/frontend/src/components/App.test.ts`
- `openplanter-desktop/frontend/src/components/WebSettings.ts`
- `openplanter-desktop/frontend/src/styles/main.css`
- `openplanter-desktop/frontend/src/styles/theme.css`

---

### Task 1: Stop browser event recursion

**Files:** `src/main.ts`, `src/api/events.test.ts`, `src/components/ChatPane.test.ts`

**Produces:** one browser `agent-step` / `agent-delta` event is consumed once; only Tauri events are bridged back into DOM events.

- [ ] **Step 1: Write failing regression tests**

```ts
it("consumes one browser-native agent-step once", async () => {
  let seen = 0;
  window.addEventListener("agent-step", () => seen++);
  await onAgentStep(() => {});
  window.dispatchEvent(new CustomEvent("agent-step", {
    detail: {
      type: "step", depth: 0, step: 1, tool_name: null,
      tokens: { input_tokens: 10, output_tokens: 2 },
      elapsed_ms: 1, is_final: false
    }
  }));
  expect(seen).toBe(1);
});
```

Add the equivalent assertion for `agent-delta`.

- [ ] **Step 2: Run focused tests and verify RED**

```bash
cd openplanter-desktop/frontend
npm test -- src/api/events.test.ts src/components/ChatPane.test.ts
```

- [ ] **Step 3: Gate DOM forwarding on Tauri only**

```ts
await onAgentStep((event) => {
  appState.update((s) => ({
    ...s,
    inputTokens: s.inputTokens + event.tokens.input_tokens,
    outputTokens: s.outputTokens + event.tokens.output_tokens,
    currentStep: event.step,
    currentDepth: event.depth,
  }));
  if (isTauri()) {
    window.dispatchEvent(new CustomEvent("agent-step", { detail: event }));
  }
});
```

For `onAgentDelta`, dispatch a DOM `agent-delta` only in Tauri mode because browser mode already receives that event from `webSolve()`.

- [ ] **Step 4: Run focused tests and verify GREEN**

```bash
npm test -- src/api/events.test.ts src/components/ChatPane.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add src/main.ts src/api/events.test.ts src/components/ChatPane.test.ts
git commit -m "fix: stop browser agent event recursion"
```

---

### Task 2: Add typed browser preferences and migration

**Files:** create `src/api/webPreferences.ts`, `src/api/webPreferences.test.ts`; modify `src/api/web.ts`

**Produces these exact interfaces:**

```ts
export type WebSearchMode = "auto" | "always" | "off";
export type ReasoningEffort = "off" | "low" | "medium" | "high";
export type WebSearchEngine = "auto" | "native" | "exa" | "parallel";
export type WebFetchEngine = "openrouter" | "auto" | "native" | "exa" | "parallel";
export type DelegationMode = "auto" | "research-only";
export type ThemeName = "dark" | "light" | "high-contrast";
export type AccentName = "blue" | "cyan" | "green" | "violet" | "amber";
export type Density = "compact" | "comfortable";
export type MessageWidth = "full" | "readable";

export interface SubagentProfile {
  id: string;
  name: string;
  enabled: boolean;
  model: string;
  instructions: string;
  reasoningEffort: ReasoningEffort;
  temperature: number;
  maxOutputTokens: number;
  webSearch: boolean;
  webFetch: boolean;
}

export interface WebPreferences {
  webSearchMode: WebSearchMode;
  webFetchEnabled: boolean;
  webSearchEngine: WebSearchEngine;
  webFetchEngine: WebFetchEngine;
  maxSearchResults: number;
  maxFetchTokens: number;
  allowedDomains: string[];
  blockedDomains: string[];
  citationsRequired: boolean;
  subagentsEnabled: boolean;
  maxDelegations: number;
  delegationMode: DelegationMode;
  subagents: SubagentProfile[];
  temperature: number;
  maxOutputTokens: number;
  allowProviderFallbacks: boolean;
  showRunDiagnostics: boolean;
  compactRunSummary: boolean;
  autoScroll: boolean;
  theme: ThemeName;
  accent: AccentName;
  fontScale: number;
  density: Density;
  messageWidth: MessageWidth;
  compactToolbar: boolean;
  reducedMotion: boolean;
}
```

- [ ] **Step 1: Write failing migration and clamping tests**

```ts
it("migrates old v2 storage to preferences without deleting user data", () => {
  localStorage.setItem("openplanter:web:v2", JSON.stringify({
    config: { provider: "openrouter", model: "model/x" },
    sessions: [{ id: "s1", created_at: "2026-08-23T00:00:00Z", turn_count: 1, last_objective: "x" }],
    history: { s1: [] },
    credentials: { openrouter: "secret" },
    documents: []
  }));
  const p = getWebPreferences();
  expect(p.webSearchMode).toBe("auto");
  expect(p.maxSearchResults).toBe(8);
});

it("clamps unsafe numeric values", () => {
  const p = normalizePreferences({ maxSearchResults: 999, fontScale: 4 });
  expect(p.maxSearchResults).toBe(20);
  expect(p.fontScale).toBe(1.2);
});
```

- [ ] **Step 2: Verify RED**

```bash
npm test -- src/api/webPreferences.test.ts
```

- [ ] **Step 3: Implement defaults and normalization**

```ts
const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, Number.isFinite(value) ? value : min));
```

Use exact defaults from the design spec. Default worker IDs are stable strings: `research-scout` and `verifier`.

- [ ] **Step 4: Extend `WebStore` and read/save migration**

```ts
type WebStore = {
  config: ConfigView;
  sessions: SessionInfo[];
  history: Record<string, ReplayEntry[]>;
  credentials: Record<string, string>;
  documents: DocumentRecord[];
  preferences: WebPreferences;
};
```

`read()` must call `normalizePreferences(parsed.preferences)` and preserve existing non-preference fields.

- [ ] **Step 5: Verify GREEN**

```bash
npm test -- src/api/webPreferences.test.ts src/api/web.openrouter.test.ts
```

- [ ] **Step 6: Commit**

```bash
git add src/api/webPreferences.ts src/api/webPreferences.test.ts src/api/web.ts
git commit -m "feat: add browser preference migration"
```

---

### Task 3: Add keyless OpenRouter web search/fetch tools

**Files:** create `src/api/openrouterTools.ts`, `src/api/openrouterTools.test.ts`; modify `src/api/web.ts`, `src/api/web.openrouter.test.ts`

**Produces:**

```ts
export type ChatMessage = { role: string; content: string };
export type OpenRouterTool = Record<string, unknown>;
export function buildWebTools(p: WebPreferences): OpenRouterTool[];
export function buildWebSystemMessage(p: WebPreferences): string;
export function buildOpenRouterTools(p: WebPreferences): OpenRouterTool[];
export function buildWebChatBody(
  provider: string,
  model: string,
  messages: ChatMessage[],
  preferences?: WebPreferences
): Record<string, unknown>;
```

- [ ] **Step 1: Write failing request-shape tests**

```ts
it("adds built-in search and fetch in auto mode", () => {
  const p = normalizePreferences({ webSearchMode: "auto", webFetchEnabled: true });
  const body = buildWebChatBody("openrouter", "openai/gpt-5.5", [
    { role: "user", content: "latest news" }
  ], p);
  expect(body.tools).toEqual(expect.arrayContaining([
    expect.objectContaining({ type: "openrouter:web_search" }),
    expect.objectContaining({ type: "openrouter:web_fetch" })
  ]));
  expect(body.plugins).toBeUndefined();
});

it("omits web tools in off mode", () => {
  const p = normalizePreferences({ webSearchMode: "off" });
  const body = buildWebChatBody("openrouter", "openai/gpt-5.5", [], p);
  const tools = (body.tools as unknown[] | undefined) ?? [];
  expect(tools).not.toEqual(expect.arrayContaining([
    expect.objectContaining({ type: "openrouter:web_search" })
  ]));
});
```

- [ ] **Step 2: Verify RED**

```bash
npm test -- src/api/openrouterTools.test.ts src/api/web.openrouter.test.ts
```

- [ ] **Step 3: Implement current OpenRouter server-tool shapes**

```ts
const searchTool: OpenRouterTool = {
  type: "openrouter:web_search",
  parameters: {
    engine: p.webSearchEngine,
    max_results: p.maxSearchResults,
    max_total_results: Math.min(50, p.maxSearchResults * 3),
    ...(p.allowedDomains.length ? { allowed_domains: p.allowedDomains } : {}),
    ...(p.blockedDomains.length ? { excluded_domains: p.blockedDomains } : {}),
  },
};

const fetchTool: OpenRouterTool = {
  type: "openrouter:web_fetch",
  parameters: {
    engine: p.webFetchEngine,
    max_content_tokens: p.maxFetchTokens,
    ...(p.allowedDomains.length ? { allowed_domains: p.allowedDomains } : {}),
    ...(p.blockedDomains.length ? { blocked_domains: p.blockedDomains } : {}),
  },
};
```

- [ ] **Step 4: Implement deterministic search policy text**

`auto` policy:

```text
Web tools are available. You MUST search before answering claims whose correctness depends on current or changing information, including latest/current/today/news/prices/availability/recent releases/verification. Use web_fetch when search snippets are insufficient. Cite URLs for retrieved claims.
```

`always` policy:

```text
You MUST perform at least one web search before answering any substantive user request. Use web_fetch when search snippets are insufficient. Cite URLs for retrieved claims.
```

- [ ] **Step 5: Wire into `webSolve()`**

Use `getWebPreferences()`. For OpenRouter, prepend the system search policy when mode is not `off`, call `buildWebChatBody`, and keep `webResearch()` as optional extra context only when user Exa/Firecrawl credentials are present.

- [ ] **Step 6: Verify focused tests and build**

```bash
npm test -- src/api/openrouterTools.test.ts src/api/web.openrouter.test.ts
npm run build
```

- [ ] **Step 7: Commit**

```bash
git add src/api/openrouterTools.ts src/api/openrouterTools.test.ts src/api/web.ts src/api/web.openrouter.test.ts
git commit -m "feat: add built-in OpenRouter web tools"
```

---

### Task 4: Add configurable OpenRouter subagents

**Files:** `src/api/openrouterTools.ts`, `src/api/openrouterTools.test.ts`, `src/api/webPreferences.ts`

**Produces:** `buildSubagentTools(p: WebPreferences, parentModel: string): OpenRouterTool[]`

- [ ] **Step 1: Write failing serialization test**

```ts
it("serializes enabled worker profiles as OpenRouter subagent tools", () => {
  const p = normalizePreferences({
    subagentsEnabled: true,
    subagents: [{
      id: "scout",
      name: "Scout",
      enabled: true,
      model: "z-ai/glm-5.2",
      instructions: "Research independently.",
      reasoningEffort: "medium",
      temperature: 0.2,
      maxOutputTokens: 5000,
      webSearch: true,
      webFetch: true
    }]
  });
  const tools = buildSubagentTools(p, "openai/gpt-5.5");
  expect(tools[0]).toEqual(expect.objectContaining({
    type: "openrouter:subagent",
    parameters: expect.objectContaining({
      model: "z-ai/glm-5.2",
      instructions: expect.stringContaining("Research independently"),
      tools: expect.arrayContaining([
        expect.objectContaining({ type: "openrouter:web_search" }),
        expect.objectContaining({ type: "openrouter:web_fetch" })
      ])
    })
  }));
});
```

- [ ] **Step 2: Verify RED**

```bash
npm test -- src/api/openrouterTools.test.ts
```

- [ ] **Step 3: Implement worker mapping**

Each enabled profile emits one `openrouter:subagent` tool. Blank worker model uses `parentModel`. Worker instructions end with:

```text
Return a concise evidence-backed result to the parent model. Do not attempt recursive delegation.
```

Workers only receive web tools when their profile toggles allow them.

- [ ] **Step 4: Add parent delegation policy**

When subagents are enabled, system text tells the parent model to delegate independent research/verification work when useful, and not to exceed `maxDelegations`.

- [ ] **Step 5: Verify GREEN**

```bash
npm test -- src/api/openrouterTools.test.ts src/api/webPreferences.test.ts
```

- [ ] **Step 6: Commit**

```bash
git add src/api/openrouterTools.ts src/api/openrouterTools.test.ts src/api/webPreferences.ts
git commit -m "feat: add configurable OpenRouter subagents"
```

---

### Task 5: Collapse browser token spam into one mutable run row

**Files:** `src/components/ChatPane.ts`, `src/components/ChatPane.test.ts`, `src/styles/main.css`

**Produces:** one `.run-status` while running and at most one `.run-summary` after completion.

- [ ] **Step 1: Write failing DOM test**

```ts
for (let i = 1; i <= 20; i++) {
  window.dispatchEvent(new CustomEvent("agent-step", {
    detail: {
      step: i, depth: 0, tool_name: null,
      tokens: { input_tokens: i * 10, output_tokens: i * 5 },
      elapsed_ms: i * 10, is_final: false
    }
  }));
}
expect(pane.querySelectorAll(".run-status")).toHaveLength(1);
expect(pane.querySelectorAll(".message.step-summary").length).toBeLessThanOrEqual(1);
```

- [ ] **Step 2: Verify RED**

```bash
npm test -- src/components/ChatPane.test.ts
```

- [ ] **Step 3: Update status in place in browser mode**

```ts
function updateRunStatus(event: StepEvent) {
  const el = ensureRunStatus();
  const inK = (event.tokens.input_tokens / 1000).toFixed(1);
  const outK = (event.tokens.output_tokens / 1000).toFixed(1);
  el.textContent = `Step ${event.step} · ${inK}k in / ${outK}k out`;
}
```

Do not append a permanent `step-summary` for each browser event. Tauri may keep its richer historical summaries.

- [ ] **Step 4: Add one completion summary**

When `compactRunSummary` is true, append one `.run-summary` per completed user request with final token totals and elapsed time, then destroy `.run-status`.

- [ ] **Step 5: Verify GREEN**

```bash
npm test -- src/components/ChatPane.test.ts
```

- [ ] **Step 6: Commit**

```bash
git add src/components/ChatPane.ts src/components/ChatPane.test.ts src/styles/main.css
git commit -m "fix: collapse browser run diagnostics"
```

---

### Task 6: Add portrait-first mobile dock and thread sheet

**Files:** create `src/components/MobileDock.ts`, `src/components/MobileDock.test.ts`; modify `src/components/App.ts`, `src/components/App.test.ts`, `src/styles/main.css`

**Produces:** portrait-visible New, Threads, Research, Settings, More controls with shared session behavior.

```ts
export interface MobileDockActions {
  newSession(): Promise<void> | void;
  loadSessions(container: HTMLElement): Promise<void>;
  switchSession(id: string): Promise<void> | void;
  openResearch(): void;
  openSettings(): void;
  openDashboard(): void;
}

export function createMobileDock(actions: MobileDockActions): HTMLElement;
```

- [ ] **Step 1: Write failing mobile controls test**

```ts
it("renders New and Threads actions for portrait mobile", () => {
  const root = document.createElement("div");
  createApp(root);
  const dock = root.querySelector(".mobile-dock");
  expect(dock).not.toBeNull();
  expect(dock!.querySelector('[data-action="new-session"]')).not.toBeNull();
  expect(dock!.querySelector('[data-action="threads"]')).not.toBeNull();
});
```

Add a click test that Threads creates `.mobile-sheet` containing `.mobile-new-session` and `.mobile-session-list`.

- [ ] **Step 2: Verify RED**

```bash
npm test -- src/components/MobileDock.test.ts src/components/App.test.ts
```

- [ ] **Step 3: Implement dock and reusable session actions**

Use existing `openSession`, `listSessions`, `deleteSession`, `getSessionHistory`; do not fork session state logic.

- [ ] **Step 4: Implement mobile sheet structure**

```html
<div class="mobile-sheet-backdrop">
  <section class="mobile-sheet" role="dialog" aria-label="Threads">
    <header><strong>Threads</strong><button aria-label="Close threads">Close</button></header>
    <button class="mobile-new-session">+ New Session</button>
    <div class="mobile-session-list"></div>
  </section>
</div>
```

- [ ] **Step 5: Add safe-area and width CSS**

```css
html, body { width: 100%; max-width: 100%; overflow-x: hidden; }
.mobile-dock button { min-height: 44px; min-width: 44px; }
.mobile-dock { padding-bottom: max(6px, env(safe-area-inset-bottom)); }
.mobile-sheet { width: 100%; max-width: 100vw; overflow-x: hidden; }
```

- [ ] **Step 6: Verify GREEN**

```bash
npm test -- src/components/MobileDock.test.ts src/components/App.test.ts
```

- [ ] **Step 7: Commit**

```bash
git add src/components/MobileDock.ts src/components/MobileDock.test.ts src/components/App.ts src/components/App.test.ts src/styles/main.css
git commit -m "feat: add portrait mobile session dock"
```

---

### Task 7: Expand Control Center into six tabs

**Files:** `src/components/WebSettings.ts`, create `src/components/WebSettings.test.ts`, modify `src/styles/main.css`

**Produces tabs:** Model, Web, Subagents, Behavior, Appearance, Keys & Limits.

- [ ] **Step 1: Write failing tab/persistence test**

```ts
expect([...panel.querySelectorAll(".settings-tab")].map((x) => x.textContent)).toEqual([
  "Model", "Web", "Subagents", "Behavior", "Appearance", "Keys & Limits"
]);
```

Change web search mode to `always`, save, then assert `getWebPreferences().webSearchMode === "always"`.

- [ ] **Step 2: Verify RED**

```bash
npm test -- src/components/WebSettings.test.ts
```

- [ ] **Step 3: Implement tab shell**

```ts
type SettingsTab = "model" | "web" | "subagents" | "behavior" | "appearance" | "keys";

function createField(labelText: string, control: HTMLElement, hint = ""): HTMLLabelElement {
  const label = document.createElement("label");
  label.textContent = labelText;
  label.appendChild(control);
  if (hint) {
    const small = document.createElement("small");
    small.textContent = hint;
    label.appendChild(small);
  }
  return label;
}
```

- [ ] **Step 4: Implement Model/Web/Behavior controls**

Retain live model catalog/favorites. Add web mode/engine/result/fetch/domain/citations controls; reasoning, temperature, max output, fallback, auto-scroll, diagnostics, compact summary controls.

Parse domain lists with:

```ts
const parseDomains = (value: string) =>
  [...new Set(value.split(/[\n,]+/).map((x) => x.trim().toLowerCase()).filter(Boolean))];
```

- [ ] **Step 5: Implement Subagents editor**

Each card has enabled, name, model, instructions, reasoning effort, temperature, max output tokens, web search, web fetch, remove. `Add subagent` creates a UUID profile and persists it on Save.

- [ ] **Step 6: Implement Appearance and Keys & Limits**

Appearance exposes theme, accent, font scale, density, message width, compact toolbar, reduced motion. Keys & Limits retains provider key, Exa, Firecrawl, spend limit, download current chat. Include visible text: `OpenRouter web search works without Exa or Firecrawl keys; these keys are optional enhancements.`

- [ ] **Step 7: Make Control Center a mobile sheet at <=760px**

Header, tab strip, and Save footer stay visible while panel body scrolls. Use `100dvh` with safe-area padding.

- [ ] **Step 8: Verify GREEN and build**

```bash
npm test -- src/components/WebSettings.test.ts src/api/webPreferences.test.ts
npm run build
```

- [ ] **Step 9: Commit**

```bash
git add src/components/WebSettings.ts src/components/WebSettings.test.ts src/styles/main.css
git commit -m "feat: expand browser control center"
```

---

### Task 8: Apply appearance customization

**Files:** `src/api/webPreferences.ts`, `src/api/webPreferences.test.ts`, `src/main.ts`, `src/styles/theme.css`, `src/styles/main.css`

**Produces:** `applyWebAppearance(preferences?: WebPreferences): void`

- [ ] **Step 1: Write failing appearance test**

```ts
it("applies appearance to document root", () => {
  applyWebAppearance(normalizePreferences({ accent: "violet", density: "compact", fontScale: 1.1 }));
  expect(document.documentElement.dataset.accent).toBe("violet");
  expect(document.documentElement.dataset.density).toBe("compact");
  expect(document.documentElement.style.getPropertyValue("--font-scale")).toBe("1.1");
});
```

- [ ] **Step 2: Verify RED**

```bash
npm test -- src/api/webPreferences.test.ts
```

- [ ] **Step 3: Implement root attributes and variables**

```css
html[data-accent="violet"] { --accent: #a78bfa; --accent-hover: #c4b5fd; }
html[data-accent="cyan"] { --accent: #22d3ee; --accent-hover: #67e8f9; }
html[data-accent="green"] { --accent: #4ade80; --accent-hover: #86efac; }
html[data-accent="amber"] { --accent: #fbbf24; --accent-hover: #fcd34d; }
html[data-density="compact"] { --control-height: 36px; --ui-gap: 5px; }
html[data-message-width="readable"] .chat-messages > * { max-width: 900px; margin-inline: auto; }
html[data-reduced-motion="true"] * { animation-duration: 0.001ms !important; transition-duration: 0.001ms !important; }
```

Set `--font-scale` and multiply the root font size from the existing 14px baseline.

- [ ] **Step 4: Initialize appearance before app render**

Browser init calls `applyWebAppearance(getWebPreferences())` before `createApp(app)`.

- [ ] **Step 5: Verify GREEN and build**

```bash
npm test -- src/api/webPreferences.test.ts
npm run build
```

- [ ] **Step 6: Commit**

```bash
git add src/api/webPreferences.ts src/api/webPreferences.test.ts src/main.ts src/styles/theme.css src/styles/main.css
git commit -m "feat: add OpenPlanter appearance controls"
```

---

### Task 9: Improve OpenRouter web/subagent errors

**Files:** `src/api/web.ts`, `src/api/web.openrouter.test.ts`

- [ ] **Step 1: Write failing translations**

```ts
it("explains unsupported tool calling without asking for Exa", () => {
  const msg = formatProviderError("openrouter", "model/x", 400,
    JSON.stringify({ error: { message: "Model does not support tool calling" } }));
  expect(msg).toContain("tool-capable OpenRouter model");
  expect(msg).not.toContain("Exa API key");
});
```

Also cover insufficient credits, rate limit, unavailable subagent worker, web engine blocked by privacy policy.

- [ ] **Step 2: Verify RED**

```bash
npm test -- src/api/web.openrouter.test.ts
```

- [ ] **Step 3: Implement translations**

Recognized errors return short actionable text. Unknown errors keep `${status}: ${message.slice(0, 500)}`.

- [ ] **Step 4: Verify GREEN**

```bash
npm test -- src/api/web.openrouter.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add src/api/web.ts src/api/web.openrouter.test.ts
git commit -m "fix: clarify browser web tool failures"
```

---

### Task 10: Full regression and mobile browser verification

**Files:** create `e2e/mobile.spec.ts`

- [ ] **Step 1: Run full unit suite**

```bash
npm test
```

Expected: zero failures.

- [ ] **Step 2: Run production build**

```bash
npm run build
```

Expected: exit code 0.

- [ ] **Step 3: Add mobile viewport smoke tests**

```ts
for (const viewport of [
  { width: 320, height: 720 },
  { width: 390, height: 844 },
  { width: 430, height: 932 },
]) {
  test(`mobile shell ${viewport.width}px`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.goto("/");
    await expect(page.locator(".mobile-dock")).toBeVisible();
    await expect(page.locator('[data-action="threads"]')).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  });
}
```

- [ ] **Step 4: Run Playwright**

```bash
npm run test:e2e
```

If browser binaries are not installed in the runtime, capture that exact failure and do not report Playwright as passing.

- [ ] **Step 5: Inspect diff against the live-oriented branch**

```bash
git diff v0/openplanter-36c03735...HEAD --stat
git diff v0/openplanter-36c03735...HEAD -- openplanter-desktop/frontend/src
```

Confirm Backup, Research, Dashboard, Graph, model search/favorites, Exa, and Firecrawl code paths remain present.

- [ ] **Step 6: Commit E2E coverage**

```bash
git add e2e/mobile.spec.ts
git commit -m "test: cover OpenPlanter mobile web shell"
```

---

### Task 11: Propagate verified implementation to `v0` and `main`

**Files:** branch refs; `src/main.ts` only if `main` needs conflict resolution.

- [ ] **Step 1: Compare verified branch to `v0/openplanter-36c03735`**

Use GitHub compare. If `v0` is an ancestor of the verified commit, update `v0/openplanter-36c03735` by non-forced fast-forward.

- [ ] **Step 2: Compare verified branch to `main`**

Do not force-reset `main`. Port the verified browser changes while preserving unrelated `main` commits. Resolve the known event-forwarding divergence in favor of the tested browser/Tauri gate.

- [ ] **Step 3: Verify expected source state on both refs**

Fetch from each ref: `web.ts`, `openrouterTools.ts`, `webPreferences.ts`, `main.ts`, `ChatPane.ts`, `WebSettings.ts`, `MobileDock.ts`, `main.css`, `theme.css`. Confirm the same request/event/mobile behaviors exist.

- [ ] **Step 4: Inspect Vercel production if connected project is visible**

Use the Vercel connector project/deployment/build-log tools. If `openplanter.vercel.app` is still absent from the connected Vercel team, report only that access limitation and do not claim deployment verification.

- [ ] **Step 5: Create a PR checkpoint when direct `main` propagation is unsafe**

PR body must include: root causes fixed, new built-in web tools, subagent capability, mobile dock/settings upgrade, `npm test` result, `npm run build` result, Playwright result or exact runtime limitation.

---

## Final Verification Checklist

- [ ] One browser `agent-step` event is processed once.
- [ ] One request creates no token/status flood.
- [ ] `webSearchMode=auto` adds `openrouter:web_search` and `openrouter:web_fetch` without external keys.
- [ ] `webSearchMode=off` omits both tools.
- [ ] Legacy `plugins.web` never appears in request bodies.
- [ ] Enabled worker profiles serialize into `openrouter:subagent` tools with their configured model/instructions/web tools.
- [ ] Old browser storage migrates without session/history/credential loss.
- [ ] Portrait mobile shell exposes visible New and Threads controls at 320/390/430px widths.
- [ ] Control Center exposes Model, Web, Subagents, Behavior, Appearance, Keys & Limits.
- [ ] Exa/Firecrawl remain optional enhancements.
- [ ] Appearance controls preserve the terminal/research structure.
- [ ] `npm test` passes.
- [ ] `npm run build` passes.
- [ ] Playwright mobile smoke checks pass when browser runtime is available.
- [ ] Verified changes reach `v0/openplanter-36c03735` and `main` without discarding unrelated work.
- [ ] Production Vercel state is only claimed when independently visible through the connected Vercel project.