# OpenPlanter Web Deep Upgrade Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the OpenPlanter Vercel/browser build reliably web-enabled without separate Exa/Firecrawl keys, add configurable OpenRouter subagents, eliminate browser token/event spam, and make sessions/settings/research fully usable on iPhone-sized screens.

**Architecture:** Keep the existing local-first browser store and terminal-style UI. Add a typed browser-preferences layer, a focused OpenRouter server-tool request builder, one mutable browser run-status component, a mobile session/action drawer, and a tabbed Control Center. OpenRouter server tools provide built-in search/fetch and subagents; optional Exa/Firecrawl remain enhancement paths only.

**Tech Stack:** TypeScript 5.6, Vite 6, Vitest 4, happy-dom, Playwright, browser `localStorage`, OpenRouter Chat Completions server tools, existing vanilla DOM UI/CSS.

**Spec:** `docs/superpowers/specs/2026-08-23-openplanter-web-deep-upgrade-design.md`

## Global Constraints

- Preserve the existing OpenPlanter terminal/research visual identity; do not replace it with a generic chat UI.
- Basic OpenRouter web search/fetch must not require user Exa or Firecrawl credentials.
- Never reintroduce the legacy `plugins: [{ id: "web" }]` request path.
- Never force ZDR or OpenRouter `data_collection` policy from OpenPlanter.
- Mobile controls must be usable in portrait at widths down to 320px and respect iOS safe-area insets.
- Existing browser sessions/history/credentials must survive the preferences migration.
- Do not change Tauri event behavior except where required to stop browser-only feedback loops.
- Each task follows red → green → regression verification and ends with a commit.

---

## File Structure

### New files

- `openplanter-desktop/frontend/src/api/webPreferences.ts` — browser preference types, defaults, migration, validation, persistence, appearance application.
- `openplanter-desktop/frontend/src/api/openrouterTools.ts` — OpenRouter web/subagent tool definitions, system-policy text, request-body construction helpers.
- `openplanter-desktop/frontend/src/api/webPreferences.test.ts` — migration/default/clamping tests.
- `openplanter-desktop/frontend/src/api/openrouterTools.test.ts` — web tools, subagent tools, and request-shape tests.
- `openplanter-desktop/frontend/src/components/MobileDock.ts` — portrait-first navigation and session drawer entry points.
- `openplanter-desktop/frontend/src/components/MobileDock.test.ts` — DOM/session-control regression tests.

### Modified files

- `openplanter-desktop/frontend/src/api/web.ts` — consume preferences + request builder; retain research-key enhancement path; emit browser run events once.
- `openplanter-desktop/frontend/src/main.ts` — stop browser event re-dispatch recursion; initialize appearance preferences.
- `openplanter-desktop/frontend/src/components/ChatPane.ts` — one mutable browser run row; one optional completion summary.
- `openplanter-desktop/frontend/src/components/ChatPane.test.ts` — token/status deduplication regression tests.
- `openplanter-desktop/frontend/src/components/App.ts` — expose reusable session actions; mount mobile dock.
- `openplanter-desktop/frontend/src/components/App.test.ts` — ensure mobile session entry points exist.
- `openplanter-desktop/frontend/src/components/WebSettings.ts` — tabbed Control Center with web/subagent/behavior/appearance settings.
- `openplanter-desktop/frontend/src/components/App.test.ts` / new settings tests as needed — persistence/DOM checks.
- `openplanter-desktop/frontend/src/styles/main.css` — mobile shell, bottom sheets, run row, settings tabs, touch targets.
- `openplanter-desktop/frontend/src/styles/theme.css` — accent/density/font-scale/readable-width variables.
- `openplanter-desktop/frontend/e2e/*` — add portrait viewport smoke coverage if existing harness permits.

---

### Task 1: Stop Browser Event Recursion

**Files:**
- Modify: `openplanter-desktop/frontend/src/main.ts` around `onAgentStep` / `onAgentDelta`
- Modify/Test: `openplanter-desktop/frontend/src/api/events.test.ts`
- Test: `openplanter-desktop/frontend/src/components/ChatPane.test.ts`

**Interfaces:**
- Consumes: existing `isTauri(): boolean`, `onAgentStep`, `onAgentDelta`
- Produces: browser events are consumed exactly once; only Tauri-native events may be bridged to DOM events.

- [ ] **Step 1: Write a failing browser event recursion test**

Add a happy-dom test that registers an `agent-step` listener, dispatches one browser `agent-step`, invokes the event subscription path, and asserts the count remains `1` rather than increasing recursively.

```ts
it("does not redispatch a browser-native agent-step event", async () => {
  let seen = 0;
  window.addEventListener("agent-step", () => seen++);
  await onAgentStep(() => {});

  window.dispatchEvent(new CustomEvent("agent-step", {
    detail: { type: "step", depth: 0, step: 1, tool_name: null,
      tokens: { input_tokens: 10, output_tokens: 2 }, elapsed_ms: 1, is_final: false }
  }));

  expect(seen).toBe(1);
});
```

- [ ] **Step 2: Run focused test and verify RED**

Run:

```bash
cd openplanter-desktop/frontend
npm test -- src/api/events.test.ts
```

Expected before fix: duplicate/recursive browser forwarding path is exposed or the new integration assertion fails.

- [ ] **Step 3: Gate DOM forwarding on `isTauri()`**

In `main.ts`, the callback updates `appState` for both runtimes, but DOM forwarding is only allowed for Tauri:

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

Do the equivalent for `agent-delta`: browser mode already receives `agent-delta` from `webSolve`; only native/Tauri mode needs DOM bridging.

- [ ] **Step 4: Run event + chat tests and verify GREEN**

```bash
npm test -- src/api/events.test.ts src/components/ChatPane.test.ts
```

Expected: PASS, no runaway event count.

- [ ] **Step 5: Commit**

```bash
git add openplanter-desktop/frontend/src/main.ts \
        openplanter-desktop/frontend/src/api/events.test.ts \
        openplanter-desktop/frontend/src/components/ChatPane.test.ts
git commit -m "fix: stop browser agent event recursion"
```

---

### Task 2: Add Versioned Browser Preferences and Safe Migration

**Files:**
- Create: `openplanter-desktop/frontend/src/api/webPreferences.ts`
- Create: `openplanter-desktop/frontend/src/api/webPreferences.test.ts`
- Modify: `openplanter-desktop/frontend/src/api/web.ts`

**Interfaces:**
- Produces:

```ts
export type WebSearchMode = "auto" | "always" | "off";
export interface SubagentProfile { ... }
export interface WebPreferences { ... }
export const DEFAULT_WEB_PREFERENCES: WebPreferences;
export function normalizePreferences(input?: Partial<WebPreferences>): WebPreferences;
export function getWebPreferences(): WebPreferences;
export function updateWebPreferences(partial: Partial<WebPreferences>): WebPreferences;
export function applyWebAppearance(preferences?: WebPreferences): void;
```

- [ ] **Step 1: Write failing migration/default tests**

Test that an old v2 store without `preferences` receives defaults while sessions/history/credentials remain unchanged; test numeric clamping.

```ts
it("migrates v2 browser data without losing user data", () => {
  localStorage.setItem("openplanter:web:v2", JSON.stringify({
    config: { provider: "openrouter", model: "x" },
    sessions: [{ id: "s1", created_at: "2026-08-23T00:00:00Z", turn_count: 1, last_objective: "x" }],
    history: { s1: [] },
    credentials: { openrouter: "secret" },
    documents: []
  }));

  expect(getWebPreferences().webSearchMode).toBe("auto");
  expect(getWebPreferences().maxSearchResults).toBe(8);
});

it("clamps unsafe numeric preferences", () => {
  const p = normalizePreferences({ maxSearchResults: 999, fontScale: 4 });
  expect(p.maxSearchResults).toBe(20);
  expect(p.fontScale).toBe(1.2);
});
```

- [ ] **Step 2: Run focused test and verify RED**

```bash
npm test -- src/api/webPreferences.test.ts
```

Expected: FAIL because module/functions do not exist.

- [ ] **Step 3: Implement defaults + normalization**

Implement exact defaults from the spec. Use a small clamp helper:

```ts
const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, Number.isFinite(value) ? value : min));
```

Generate default subagent IDs from stable strings (`research-scout`, `verifier`) rather than `crypto.randomUUID()` so defaults compare deterministically.

- [ ] **Step 4: Integrate preferences into `WebStore` read/save**

Change `WebStore`:

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

`read()` must merge defaults and call `normalizePreferences(parsed.preferences)` rather than shallowly replacing the default object.

- [ ] **Step 5: Run preferences + existing browser tests**

```bash
npm test -- src/api/webPreferences.test.ts src/api/web.openrouter.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add openplanter-desktop/frontend/src/api/webPreferences.ts \
        openplanter-desktop/frontend/src/api/webPreferences.test.ts \
        openplanter-desktop/frontend/src/api/web.ts
git commit -m "feat: add versioned browser preferences"
```

---

### Task 3: Build OpenRouter Web Search and Fetch Tools

**Files:**
- Create: `openplanter-desktop/frontend/src/api/openrouterTools.ts`
- Create: `openplanter-desktop/frontend/src/api/openrouterTools.test.ts`
- Modify: `openplanter-desktop/frontend/src/api/web.ts`
- Modify: `openplanter-desktop/frontend/src/api/web.openrouter.test.ts`

**Interfaces:**

```ts
export type OpenRouterTool = Record<string, unknown>;
export function buildWebTools(p: WebPreferences): OpenRouterTool[];
export function buildWebSystemMessage(p: WebPreferences): string;
export function buildOpenRouterTools(p: WebPreferences): OpenRouterTool[];
export function buildWebChatBody(
  provider: string,
  model: string,
  messages: ChatMessage[],
  p?: WebPreferences
): Record<string, unknown>;
```

- [ ] **Step 1: Write failing request-shape tests**

```ts
it("adds keyless OpenRouter search and fetch in auto mode", () => {
  const p = normalizePreferences({ webSearchMode: "auto", webFetchEnabled: true });
  const body = buildWebChatBody("openrouter", "openai/gpt-5.5", [{ role: "user", content: "news today" }], p);
  expect(body.tools).toEqual(expect.arrayContaining([
    expect.objectContaining({ type: "openrouter:web_search" }),
    expect.objectContaining({ type: "openrouter:web_fetch" })
  ]));
  expect(body.plugins).toBeUndefined();
});

it("omits OpenRouter web tools when search mode is off", () => {
  const p = normalizePreferences({ webSearchMode: "off" });
  const body = buildWebChatBody("openrouter", "openai/gpt-5.5", [], p);
  expect((body.tools as unknown[] | undefined) ?? []).not.toEqual(
    expect.arrayContaining([expect.objectContaining({ type: "openrouter:web_search" })])
  );
});
```

- [ ] **Step 2: Run tests and verify RED**

```bash
npm test -- src/api/openrouterTools.test.ts src/api/web.openrouter.test.ts
```

- [ ] **Step 3: Implement `buildWebTools()`**

Use current OpenRouter server-tool shapes:

```ts
const search: OpenRouterTool = {
  type: "openrouter:web_search",
  parameters: {
    engine: p.webSearchEngine,
    max_results: p.maxSearchResults,
    ...(p.allowedDomains.length ? { allowed_domains: p.allowedDomains } : {}),
    ...(p.blockedDomains.length ? { blocked_domains: p.blockedDomains } : {}),
  },
};

const fetch: OpenRouterTool = {
  type: "openrouter:web_fetch",
  parameters: {
    engine: p.webFetchEngine,
    max_content_tokens: p.maxFetchTokens,
    ...(p.allowedDomains.length ? { allowed_domains: p.allowedDomains } : {}),
    ...(p.blockedDomains.length ? { blocked_domains: p.blockedDomains } : {}),
  },
};
```

If OpenRouter rejects unsupported search parameters during runtime verification, narrow the parameter set to the documented fields rather than falling back to the legacy plugin.

- [ ] **Step 4: Add freshness/system policy text**

`buildWebSystemMessage()` must be short and deterministic. In `auto`:

```text
Web tools are available. You MUST search before answering claims whose correctness depends on current or changing information (latest, current, today, news, prices, availability, recent releases, verification). Use web_fetch on important sources when search snippets are insufficient. Cite URLs for retrieved claims.
```

In `always`, replace the first sentence with:

```text
You MUST perform at least one web search before answering any substantive user request.
```

- [ ] **Step 5: Wire builder into `webSolve()`**

`webSolve()` gets preferences via `getWebPreferences()`, prepends the system policy message only for OpenRouter when web mode is not `off`, and calls the focused builder.

Keep `webResearch(objective)` as optional enhancement context only when user keys are present.

- [ ] **Step 6: Run focused tests + build**

```bash
npm test -- src/api/openrouterTools.test.ts src/api/web.openrouter.test.ts
npm run build
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add openplanter-desktop/frontend/src/api/openrouterTools.ts \
        openplanter-desktop/frontend/src/api/openrouterTools.test.ts \
        openplanter-desktop/frontend/src/api/web.openrouter.test.ts \
        openplanter-desktop/frontend/src/api/web.ts
git commit -m "feat: add built-in OpenRouter web tools"
```

---

### Task 4: Add Configurable OpenRouter Subagents

**Files:**
- Modify: `openplanter-desktop/frontend/src/api/openrouterTools.ts`
- Modify: `openplanter-desktop/frontend/src/api/openrouterTools.test.ts`
- Modify: `openplanter-desktop/frontend/src/api/webPreferences.ts`

**Interfaces:**

```ts
export function buildSubagentTools(p: WebPreferences): OpenRouterTool[];
```

- [ ] **Step 1: Write failing subagent serialization tests**

```ts
it("serializes each enabled worker as an OpenRouter subagent tool", () => {
  const p = normalizePreferences({
    subagentsEnabled: true,
    subagents: [{
      id: "scout", name: "Scout", enabled: true,
      model: "z-ai/glm-5.2", instructions: "Research independently.",
      reasoningEffort: "medium", temperature: 0.2, maxOutputTokens: 5000,
      webSearch: true, webFetch: true
    }]
  });

  expect(buildSubagentTools(p)).toEqual([
    expect.objectContaining({
      type: "openrouter:subagent",
      parameters: expect.objectContaining({
        model: "z-ai/glm-5.2",
        instructions: expect.stringContaining("Research independently"),
        tools: expect.arrayContaining([
          expect.objectContaining({ type: "openrouter:web_search" }),
          expect.objectContaining({ type: "openrouter:web_fetch" })
        ])
      })
    })
  ]);
});
```

- [ ] **Step 2: Run and verify RED**

```bash
npm test -- src/api/openrouterTools.test.ts
```

- [ ] **Step 3: Implement worker tool mapping**

Only enabled workers are serialized. If worker model is blank, use the outer request model by omitting `parameters.model` rather than inventing a slug.

Add worker instructions describing the profile name and append:

```text
Return a concise evidence-backed result to the parent model. Do not attempt recursive delegation.
```

Worker web tools use the same web search/fetch engine preferences as the parent.

- [ ] **Step 4: Add top-level orchestration guidance**

When subagents are enabled, system text tells the parent to delegate independent research/verification subtasks when useful and to stay within `maxDelegations`. Do not try to emulate recursive subagents client-side.

- [ ] **Step 5: Run tests**

```bash
npm test -- src/api/openrouterTools.test.ts src/api/webPreferences.test.ts
```

- [ ] **Step 6: Commit**

```bash
git add openplanter-desktop/frontend/src/api/openrouterTools.ts \
        openplanter-desktop/frontend/src/api/openrouterTools.test.ts \
        openplanter-desktop/frontend/src/api/webPreferences.ts
git commit -m "feat: add configurable OpenRouter subagents"
```

---

### Task 5: Replace Step-Line Flood with One Browser Run Status

**Files:**
- Modify: `openplanter-desktop/frontend/src/components/ChatPane.ts`
- Modify: `openplanter-desktop/frontend/src/components/ChatPane.test.ts`
- Modify: `openplanter-desktop/frontend/src/styles/main.css`

**Interfaces:**
- Produces one `.run-status` element while browser generation is active.
- Produces at most one `.run-summary` per completed browser user request when enabled.

- [ ] **Step 1: Write failing DOM test**

Dispatch 20 `agent-step` events and assert only one live run status exists:

```ts
for (let i = 1; i <= 20; i++) {
  window.dispatchEvent(new CustomEvent("agent-step", {
    detail: { step: i, depth: 0, tool_name: null,
      tokens: { input_tokens: i * 10, output_tokens: i * 5 }, elapsed_ms: i * 10, is_final: false }
  }));
}
expect(pane.querySelectorAll(".run-status")).toHaveLength(1);
expect(pane.querySelectorAll(".message.step-summary").length).toBeLessThanOrEqual(1);
```

- [ ] **Step 2: Run and verify RED**

```bash
npm test -- src/components/ChatPane.test.ts
```

- [ ] **Step 3: Replace permanent-per-event summary with mutable status in browser mode**

Add `RunStatus` behavior inside ChatPane:

```ts
function updateRunStatus(event: StepEvent) {
  const el = ensureRunStatus();
  const inK = (event.tokens.input_tokens / 1000).toFixed(1);
  const outK = (event.tokens.output_tokens / 1000).toFixed(1);
  el.textContent = `Step ${event.step} · ${inK}k in / ${outK}k out`;
}
```

Use `isTauri()` to preserve richer permanent desktop/Tauri summaries if desired; browser mode must not append one summary per event.

- [ ] **Step 4: Add completion cleanup/optional compact summary**

On `agent:complete`, destroy the live row. If `compactRunSummary` is enabled, append exactly one small `.run-summary` containing final token totals and elapsed time.

- [ ] **Step 5: Run tests**

```bash
npm test -- src/components/ChatPane.test.ts
```

- [ ] **Step 6: Commit**

```bash
git add openplanter-desktop/frontend/src/components/ChatPane.ts \
        openplanter-desktop/frontend/src/components/ChatPane.test.ts \
        openplanter-desktop/frontend/src/styles/main.css
git commit -m "fix: collapse browser run diagnostics into one row"
```

---

### Task 6: Add Portrait-First Mobile Dock and Thread Drawer

**Files:**
- Create: `openplanter-desktop/frontend/src/components/MobileDock.ts`
- Create: `openplanter-desktop/frontend/src/components/MobileDock.test.ts`
- Modify: `openplanter-desktop/frontend/src/components/App.ts`
- Modify: `openplanter-desktop/frontend/src/components/App.test.ts`
- Modify: `openplanter-desktop/frontend/src/styles/main.css`

**Interfaces:**
- `App.ts` exposes or locally shares `createNewSession()` and `switchToSession()` callbacks with desktop sidebar and mobile dock.
- `createMobileDock(actions: MobileDockActions): HTMLElement`.

```ts
export interface MobileDockActions {
  newSession(): Promise<void> | void;
  loadSessions(container: HTMLElement): Promise<void>;
  switchSession(id: string): Promise<void> | void;
  openResearch(): void;
  openSettings(): void;
  openDashboard(): void;
}
```

- [ ] **Step 1: Write failing mobile control test**

```ts
it("renders portrait-accessible New and Threads controls", () => {
  const root = document.createElement("div");
  createApp(root);
  const dock = root.querySelector(".mobile-dock");
  expect(dock).not.toBeNull();
  expect(dock!.querySelector('[data-action="new-session"]')).not.toBeNull();
  expect(dock!.querySelector('[data-action="threads"]')).not.toBeNull();
});
```

Add a click test verifying `Threads` creates `.mobile-sheet` with session list and `+ New Session`.

- [ ] **Step 2: Run and verify RED**

```bash
npm test -- src/components/MobileDock.test.ts src/components/App.test.ts
```

- [ ] **Step 3: Implement dock + thread sheet**

Use buttons with text labels and `aria-label`s. Sheet structure:

```html
<div class="mobile-sheet-backdrop">
  <section class="mobile-sheet" role="dialog" aria-label="Threads">
    <header>Threads <button>Close</button></header>
    <button class="mobile-new-session">+ New Session</button>
    <div class="mobile-session-list"></div>
  </section>
</div>
```

Do not duplicate session business logic; reuse existing open/list/delete functions.

- [ ] **Step 4: Add safe-area/mobile CSS**

At `<=760px`, reserve a dock row above the input rather than hiding session access. Minimum target size: 44px. Ensure:

```css
html, body { width: 100%; max-width: 100%; overflow-x: hidden; }
.mobile-dock { padding-bottom: max(6px, env(safe-area-inset-bottom)); }
.mobile-sheet { max-width: 100vw; overflow-x: hidden; }
```

- [ ] **Step 5: Run mobile DOM tests**

```bash
npm test -- src/components/MobileDock.test.ts src/components/App.test.ts
```

- [ ] **Step 6: Commit**

```bash
git add openplanter-desktop/frontend/src/components/MobileDock.ts \
        openplanter-desktop/frontend/src/components/MobileDock.test.ts \
        openplanter-desktop/frontend/src/components/App.ts \
        openplanter-desktop/frontend/src/components/App.test.ts \
        openplanter-desktop/frontend/src/styles/main.css
git commit -m "feat: add portrait mobile session dock"
```

---

### Task 7: Expand Control Center into Tabs

**Files:**
- Modify: `openplanter-desktop/frontend/src/components/WebSettings.ts`
- Create or Modify Test: `openplanter-desktop/frontend/src/components/WebSettings.test.ts`
- Modify: `openplanter-desktop/frontend/src/styles/main.css`

**Interfaces:**
- Consumes `getWebPreferences()`, `updateWebPreferences()`, `applyWebAppearance()`.
- Persists all spec settings through one Save action.

- [ ] **Step 1: Write failing settings-tab test**

Assert the DOM exposes exactly the six required tabs and persists a change:

```ts
expect([...panel.querySelectorAll(".settings-tab")].map((x) => x.textContent)).toEqual([
  "Model", "Web", "Subagents", "Behavior", "Appearance", "Keys & Limits"
]);
```

Change `webSearchMode` to `always`, save, and assert `getWebPreferences().webSearchMode === "always"`.

- [ ] **Step 2: Run and verify RED**

```bash
npm test -- src/components/WebSettings.test.ts
```

- [ ] **Step 3: Implement tab shell without framework migration**

Create helpers inside `WebSettings.ts`:

```ts
function createTabButton(id: SettingsTab, label: string): HTMLButtonElement;
function createField(labelText: string, control: HTMLElement, hint?: string): HTMLLabelElement;
function showTab(id: SettingsTab): void;
```

Only the active tab panel is visible. Keep current model catalog search/favorites behavior.

- [ ] **Step 4: Implement Web + Behavior + Appearance controls**

Use select/number/text controls with values from preferences. Domain inputs accept comma/newline-separated domains and normalize with:

```ts
const parseDomains = (value: string) =>
  [...new Set(value.split(/[\n,]+/).map((x) => x.trim().toLowerCase()).filter(Boolean))];
```

- [ ] **Step 5: Implement Subagents editor**

Each worker card contains:

- enabled checkbox
- name
- model searchable text/select
- instructions textarea
- reasoning effort
- temperature
- max output tokens
- web search checkbox
- web fetch checkbox
- remove button

`Add subagent` creates a new local profile with a UUID, disabled by default until required fields are present.

- [ ] **Step 6: Implement Keys & Limits + mobile sheet behavior**

Retain provider key, Exa, Firecrawl, spend-limit controls. Add text that OpenRouter web search does **not** require Exa/Firecrawl keys.

At `<=760px`, Control Center should fill the viewport/safe area and use sticky tab/header/footer areas.

- [ ] **Step 7: Run settings tests + build**

```bash
npm test -- src/components/WebSettings.test.ts src/api/webPreferences.test.ts
npm run build
```

- [ ] **Step 8: Commit**

```bash
git add openplanter-desktop/frontend/src/components/WebSettings.ts \
        openplanter-desktop/frontend/src/components/WebSettings.test.ts \
        openplanter-desktop/frontend/src/styles/main.css
git commit -m "feat: expand browser control center"
```

---

### Task 8: Apply UI Customization Without Changing the Vibe

**Files:**
- Modify: `openplanter-desktop/frontend/src/api/webPreferences.ts`
- Modify: `openplanter-desktop/frontend/src/main.ts`
- Modify: `openplanter-desktop/frontend/src/styles/theme.css`
- Modify: `openplanter-desktop/frontend/src/styles/main.css`
- Test: `openplanter-desktop/frontend/src/api/webPreferences.test.ts`

**Interfaces:**
- `applyWebAppearance()` writes `data-theme`, `data-accent`, `data-density`, `data-message-width`, `data-reduced-motion` and `--font-scale`.

- [ ] **Step 1: Write failing appearance test**

```ts
it("applies persisted appearance as root attributes", () => {
  applyWebAppearance(normalizePreferences({ accent: "violet", density: "compact", fontScale: 1.1 }));
  expect(document.documentElement.dataset.accent).toBe("violet");
  expect(document.documentElement.dataset.density).toBe("compact");
  expect(document.documentElement.style.getPropertyValue("--font-scale")).toBe("1.1");
});
```

- [ ] **Step 2: Run and verify RED**

```bash
npm test -- src/api/webPreferences.test.ts
```

- [ ] **Step 3: Implement accent/density/font/readable-width CSS variables**

Use data selectors, for example:

```css
html[data-accent="violet"] { --accent: #a78bfa; --accent-hover: #c4b5fd; }
html[data-density="compact"] { --ui-gap: 5px; --control-height: 36px; }
html[data-message-width="readable"] .chat-messages > * { max-width: 900px; margin-inline: auto; }
html[data-reduced-motion="true"] * { animation-duration: 0.001ms !important; transition-duration: 0.001ms !important; }
```

- [ ] **Step 4: Initialize appearance before app render**

Browser init path calls `applyWebAppearance(getWebPreferences())` before `createApp(app)` to avoid visual flash.

- [ ] **Step 5: Run tests + build**

```bash
npm test -- src/api/webPreferences.test.ts
npm run build
```

- [ ] **Step 6: Commit**

```bash
git add openplanter-desktop/frontend/src/api/webPreferences.ts \
        openplanter-desktop/frontend/src/main.ts \
        openplanter-desktop/frontend/src/styles/theme.css \
        openplanter-desktop/frontend/src/styles/main.css
git commit -m "feat: add OpenPlanter appearance controls"
```

---

### Task 9: Error Handling for Web Tools and Subagents

**Files:**
- Modify: `openplanter-desktop/frontend/src/api/web.ts`
- Modify: `openplanter-desktop/frontend/src/api/web.openrouter.test.ts`

**Interfaces:**
- Extends existing `formatProviderError()` only; no new UI dependency.

- [ ] **Step 1: Write failing error translation tests**

Cover phrases/statuses for tool-calling unsupported, insufficient credits, rate limit, worker unavailable, and web engine/privacy conflict.

Example:

```ts
it("explains unsupported tool calling without asking for Exa", () => {
  const msg = formatProviderError("openrouter", "model/x", 400,
    JSON.stringify({ error: { message: "Model does not support tool calling" } }));
  expect(msg).toContain("tool-capable OpenRouter model");
  expect(msg).not.toContain("Exa API key");
});
```

- [ ] **Step 2: Run RED**

```bash
npm test -- src/api/web.openrouter.test.ts
```

- [ ] **Step 3: Implement exact translations**

Preserve raw status/message tail for unknown errors. Do not conceal provider errors that are not recognized.

- [ ] **Step 4: Run GREEN**

```bash
npm test -- src/api/web.openrouter.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add openplanter-desktop/frontend/src/api/web.ts \
        openplanter-desktop/frontend/src/api/web.openrouter.test.ts
git commit -m "fix: clarify browser web tool failures"
```

---

### Task 10: Full Regression Suite and Browser-Width Verification

**Files:**
- Modify/Create: `openplanter-desktop/frontend/e2e/mobile.spec.ts` if Playwright config supports browser launch in this environment.
- No production source change unless a failing verification exposes a defect.

**Interfaces:** none.

- [ ] **Step 1: Run full unit suite**

```bash
cd openplanter-desktop/frontend
npm test
```

Expected: zero failures.

- [ ] **Step 2: Run production build**

```bash
npm run build
```

Expected: TypeScript and Vite build exit 0.

- [ ] **Step 3: Add/run portrait smoke checks**

Playwright cases:

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

Run:

```bash
npm run test:e2e
```

If browser binaries are unavailable, record that specific infrastructure limitation and use happy-dom + built CSS/build checks; do not claim Playwright passed.

- [ ] **Step 4: Inspect diff for accidental behavior removal**

```bash
git diff v0/openplanter-36c03735...HEAD --stat
git diff v0/openplanter-36c03735...HEAD -- openplanter-desktop/frontend/src
```

Verify existing Backup, Research, Dashboard, Graph, model search, Exa, and Firecrawl paths still exist.

- [ ] **Step 5: Commit any verification-only test additions**

```bash
git add openplanter-desktop/frontend/e2e
git commit -m "test: cover OpenPlanter mobile web shell"
```

---

### Task 11: Propagate Verified Changes to Live Branches

**Files:** Git refs only unless `main` requires a small conflict resolution in `main.ts`.

**Interfaces:** both `v0/openplanter-36c03735` and `main` must contain the verified browser implementation.

- [ ] **Step 1: Record verified implementation commit**

```bash
VERIFIED_SHA=$(git rev-parse HEAD)
echo "$VERIFIED_SHA"
```

- [ ] **Step 2: Fast-forward `v0/openplanter-36c03735` if ancestry permits**

```bash
git merge-base --is-ancestor v0/openplanter-36c03735 "$VERIFIED_SHA"
git branch -f v0/openplanter-36c03735 "$VERIFIED_SHA"
```

In GitHub connector execution, use a non-forced branch ref update only after compare confirms fast-forward.

- [ ] **Step 3: Port to `main`**

Because `main` and `v0` currently differ mainly in browser event forwarding/CSS history, compare the verified branch to `main`. Prefer a normal merge/cherry-pick-equivalent tree application; do not force-reset `main` if it would discard unrelated commits.

- [ ] **Step 4: Verify both branches independently**

Fetch the final `package.json`, `web.ts`, `main.ts`, settings and CSS from each ref and compare expected key changes. If local checkout is available, run `npm test && npm run build` on each branch.

- [ ] **Step 5: Check Vercel production visibility**

Use the connected Vercel project list. If `openplanter.vercel.app` is visible, inspect latest production deployment and build logs. If it remains absent from the connected team, state that limitation precisely; do not claim production deployment verification.

- [ ] **Step 6: Final temporary commit / PR checkpoint**

Open a PR from the implementation branch to `main` if direct propagation is not safe or not possible through the connector. Include test/build evidence in the PR body.

---

## Final Verification Checklist

- [ ] One browser `agent-step` event is processed once.
- [ ] One request creates no token/status flood.
- [ ] `webSearchMode=auto` adds `openrouter:web_search` + `openrouter:web_fetch` without external keys.
- [ ] `webSearchMode=off` omits them.
- [ ] Legacy `plugins.web` never appears in request bodies.
- [ ] Enabled subagent profiles serialize into `openrouter:subagent` tools with their configured worker model and web tools.
- [ ] Old browser storage migrates without session/history/credential loss.
- [ ] Portrait mobile shell has visible New + Threads controls at 320/390/430px widths.
- [ ] Settings expose Model, Web, Subagents, Behavior, Appearance, Keys & Limits.
- [ ] Exa/Firecrawl remain optional enhancements.
- [ ] Appearance changes preserve the terminal/research structure.
- [ ] `npm test` passes.
- [ ] `npm run build` passes.
- [ ] Playwright mobile smoke checks pass when browser runtime is available.
- [ ] Verified changes reach `v0/openplanter-36c03735` and `main` without discarding unrelated work.
- [ ] Production Vercel state is inspected only if the connected Vercel account exposes the project.
