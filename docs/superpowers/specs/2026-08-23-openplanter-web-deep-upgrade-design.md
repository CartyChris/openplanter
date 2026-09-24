# OpenPlanter Web Deep Upgrade Design

## Objective

Upgrade the Vercel/browser build of OpenPlanter so it behaves like a capable local-first research harness on phones and desktops without requiring users to bring Exa or Firecrawl keys for basic web retrieval. Preserve the existing dark terminal/research aesthetic while making the browser build substantially easier to use, especially on iPhone-sized screens.

## Confirmed Root Causes

1. **Repeated token/step lines:** browser `agent-step` / `agent-delta` events are subscribed to and then re-dispatched onto the same browser event names by `main.ts`, creating duplicate/recursive status processing. The current chat pane also persists a new `step-summary` message for every step event instead of maintaining one live run status.
2. **Mobile thread controls are inaccessible:** below 760px `.sidebar` is hidden, and the sidebar is the only place that exposes `+ New Session` and the session list. No mobile replacement exists.
3. **Built-in web retrieval disappeared after the Firecrawl/ZDR fix:** the browser path now only retrieves external data through `webResearch()`, which requires a user-provided Exa or Firecrawl key. Ordinary OpenRouter requests contain no supported built-in retrieval tool.
4. **Settings are too shallow for the browser harness:** current settings expose one provider/model pair, optional research keys, spend limit, task profile, and theme. They do not model web policy, subagents, delegation budgets, UI density, or mobile ergonomics.

## Architecture

### 1. Browser Event Flow

Browser event ownership will be explicit:

- `webSolve()` is the producer of browser-native `agent-step`, `agent-delta`, and `agent:complete` events.
- `events.ts` subscribes to those events in browser mode.
- `main.ts` updates application state from those events but **must not re-dispatch them in browser mode**.
- Tauri mode may still bridge native Tauri events to DOM events where required by the existing UI.

The run/status UI will have one transient, mutable status element rather than one permanent token line per event. A single compact completion summary may remain after each request.

### 2. Built-In Web Retrieval

OpenRouter is the preferred browser transport. For OpenRouter requests, OpenPlanter will use current server tools rather than the legacy `plugins: [{ id: "web" }]` path:

```json
{
  "tools": [
    { "type": "openrouter:web_search" },
    {
      "type": "openrouter:web_fetch",
      "parameters": {
        "engine": "openrouter"
      }
    }
  ]
}
```

`openrouter:web_search` is available to tool-calling models through OpenRouter and executes server-side. `openrouter:web_fetch` provides page retrieval without a separate user API key when the OpenRouter engine is used. Provider-native search/fetch may be used automatically where OpenRouter supports it.

External Exa and Firecrawl credentials remain optional enhancement sources. They must never be prerequisites for ordinary web-enabled OpenRouter use.

#### Search policy

Persist a `webSearchMode` setting with exact values:

- `auto` — default. Web tools are available; the system prompt requires search for freshness-sensitive requests such as latest/current/today/news/price/availability/verification.
- `always` — web tools are available and the system prompt instructs the model to perform at least one search before answering any substantive request.
- `off` — OpenRouter web tools are omitted.

Persist additional web settings:

- `webFetchEnabled: boolean`, default `true`
- `webSearchEngine: "auto" | "native" | "exa" | "parallel"`, default `auto`
- `webFetchEngine: "openrouter" | "auto" | "native" | "exa" | "parallel"`, default `openrouter`
- `maxSearchResults: number`, default `8`, range `1..20`
- `maxFetchTokens: number`, default `24000`, range `2000..50000`
- `allowedDomains: string[]`, default `[]`
- `blockedDomains: string[]`, default `[]`
- `citationsRequired: boolean`, default `true`

If the selected model does not support tool calling, OpenPlanter must surface a clear message and optionally suggest switching to a tool-capable OpenRouter model. It must not silently fall back to the retired Firecrawl web plugin.

### 3. Subagent Orchestration

Use OpenRouter's `openrouter:subagent` server tool for browser-mode delegation rather than manually launching uncontrolled parallel client calls.

Persist an array of `SubagentProfile` records:

```ts
interface SubagentProfile {
  id: string;
  name: string;
  enabled: boolean;
  model: string;
  instructions: string;
  reasoningEffort: "off" | "low" | "medium" | "high";
  temperature: number;
  maxOutputTokens: number;
  webSearch: boolean;
  webFetch: boolean;
}
```

Default profiles:

1. `Research Scout` — enabled, inherits the current OpenRouter model until the user selects another, web search + fetch on.
2. `Verifier` — disabled by default, web search on, instructed to challenge factual claims and conflicting evidence.

Persist orchestration settings:

- `subagentsEnabled: boolean`, default `false`
- `maxDelegations: number`, default `3`, range `1..10`
- `delegationMode: "auto" | "research-only"`, default `auto`

Each enabled profile becomes a separate `openrouter:subagent` tool entry with the configured worker model/instructions. Workers may receive `openrouter:web_search` and/or `openrouter:web_fetch` tools according to the profile. Recursive subagent delegation is not exposed.

### 4. Expanded Control Center

Replace the single long settings form with a tabbed or segmented Control Center:

- **Model** — provider, live OpenRouter model catalog, searchable model selector, favorites, task profile, reasoning effort, temperature, max output tokens, provider fallback toggle.
- **Web** — search mode, engines, result/fetch limits, allowed/blocked domains, citations, optional Exa/Firecrawl keys.
- **Subagents** — master enable, max delegations, delegation mode, add/remove/reorder worker profiles, per-worker model and web/tool controls.
- **Behavior** — recursive/flat mode, max depth, max steps, auto-scroll, diagnostics visibility, compact completion summaries.
- **Appearance** — dark/light/high-contrast, accent preset, font scale, UI density, message width, compact toolbar, reduced motion.
- **Keys & Limits** — provider keys, credential status, spend limit, browser-storage warning, export/backup controls.

All settings remain browser-local for the current architecture unless a future server-side credential vault is explicitly introduced.

### 5. Mobile Shell

At widths <= 760px:

- Chat occupies the primary viewport.
- The desktop sidebar and graph pane remain hidden by default.
- Add a persistent mobile action bar/dock with touch targets at least 44px high:
  - `New`
  - `Threads`
  - `Research`
  - `Settings`
  - `More` / `Graph`
- `Threads` opens a bottom sheet or full-height drawer containing the session list and new-session control.
- `Settings`, `Research`, and other browser dialogs become safe-area-aware bottom sheets/full-screen panels rather than desktop-centered modal cards.
- The input bar must remain visible above the iOS keyboard and account for `env(safe-area-inset-bottom)`.
- Horizontal page scrolling is forbidden. Long code/content may scroll inside its own block.
- No mobile control may depend on hover.

### 6. Appearance Customization

Preserve the OpenPlanter terminal/research vibe. Supported customization must use existing CSS variables rather than wholesale redesign.

Persist:

- `theme: "dark" | "light" | "high-contrast"`
- `accent: "blue" | "cyan" | "green" | "violet" | "amber"`
- `fontScale: number`, default `1`, range `0.9..1.2`
- `density: "compact" | "comfortable"`, default `comfortable`
- `messageWidth: "full" | "readable"`, default `full`
- `reducedMotion: boolean`, default from `prefers-reduced-motion`

Apply these as `data-*` attributes and CSS custom properties on `document.documentElement`.

## Data Model

Extend the browser `WebStore` with a versioned `preferences` object so existing `openplanter:web:v2` data can migrate safely without losing sessions or credentials.

```ts
interface WebPreferences {
  webSearchMode: "auto" | "always" | "off";
  webFetchEnabled: boolean;
  webSearchEngine: "auto" | "native" | "exa" | "parallel";
  webFetchEngine: "openrouter" | "auto" | "native" | "exa" | "parallel";
  maxSearchResults: number;
  maxFetchTokens: number;
  allowedDomains: string[];
  blockedDomains: string[];
  citationsRequired: boolean;
  subagentsEnabled: boolean;
  maxDelegations: number;
  delegationMode: "auto" | "research-only";
  subagents: SubagentProfile[];
  temperature: number;
  maxOutputTokens: number;
  allowProviderFallbacks: boolean;
  showRunDiagnostics: boolean;
  compactRunSummary: boolean;
  autoScroll: boolean;
  theme: "dark" | "light" | "high-contrast";
  accent: "blue" | "cyan" | "green" | "violet" | "amber";
  fontScale: number;
  density: "compact" | "comfortable";
  messageWidth: "full" | "readable";
  compactToolbar: boolean;
  reducedMotion: boolean;
}
```

Unknown future fields must be preserved where practical. Invalid numeric values are clamped on read.

## Request Construction

Create a focused OpenRouter request builder instead of growing `webSolve()` indefinitely.

Required exported helpers:

```ts
export function buildOpenRouterTools(preferences: WebPreferences): OpenRouterTool[];
export function buildSubagentTools(preferences: WebPreferences): OpenRouterTool[];
export function buildWebSystemMessage(preferences: WebPreferences): string;
export function buildWebChatBody(provider: string, model: string, messages: ChatMessage[], preferences?: WebPreferences): Record<string, unknown>;
```

`buildWebChatBody()` must:

- preserve `provider.allow_fallbacks` when enabled;
- add OpenRouter web/server tools only for OpenRouter;
- add subagent tools only when enabled;
- never inject the legacy `plugins.web` object;
- never force ZDR or data-collection policy;
- use user-configured temperature/output limits;
- preserve compatibility with direct OpenAI/Google/Cerebras browser endpoints.

## Run Status / Token UX

Browser mode should display exactly one mutable run status row during a generation. It updates step number, input tokens, output tokens, elapsed time, and current tool/activity in-place.

On completion:

- remove the live activity element;
- optionally add one compact final summary per user request when `compactRunSummary` is true;
- never add one permanent status message per streaming/event update.

Historical desktop/Tauri step summaries may remain available where they are useful, but browser mode must not flood the chat transcript.

## Error Handling

Translate common OpenRouter failures into actionable UI messages:

- one-time age attestation required;
- account/key guardrails eliminate all endpoints;
- tool-calling unsupported by selected model;
- web engine unavailable under privacy policy;
- insufficient credits for paid search/provider;
- subagent worker model unavailable;
- rate limit / temporary provider failure.

Do not tell the user to configure Exa/Firecrawl when built-in OpenRouter retrieval is available.

## Testing Requirements

Before implementation, add failing tests for:

1. Browser event forwarding does not re-dispatch browser-native `agent-step`/`agent-delta` events.
2. OpenRouter request body in `auto` mode contains `openrouter:web_search` and `openrouter:web_fetch` with no Exa/Firecrawl credential requirement.
3. `off` mode omits web tools.
4. Subagent profiles serialize into separate `openrouter:subagent` tool definitions with worker-specific model/instructions/web tools.
5. Existing v2 browser storage migrates to defaults without losing sessions/history/credentials.
6. Mobile DOM contains an always-accessible Threads entry point and New Session control at <= 760px.
7. One user request cannot create unbounded duplicate step-summary rows in browser mode.
8. Control Center persists appearance and behavior settings.

Run the full frontend test suite and TypeScript/Vite build. Where browser-runtime verification is possible, exercise a production-like browser build at mobile and desktop viewport widths.

## Deployment / Branch Strategy

Implement on `chatgpt/openplanter-web-deep-upgrade-impl`, originally branched from `v0/openplanter-36c03735` because that branch currently contains the browser/mobile fixes matching the deployed screenshots. After verification:

1. Fast-forward or merge the verified changes into `v0/openplanter-36c03735`.
2. Port the same browser changes into `main`, resolving only the known event-forwarding divergence.
3. Verify both branches build.
4. Check the connected Vercel project if it is visible; otherwise verify GitHub state and explicitly report that Vercel production could not be independently inspected.

## Done Criteria

The pass is complete only when all of the following are true:

- OpenRouter web-enabled models can retrieve fresh web information without Exa/Firecrawl user keys.
- Optional Exa/Firecrawl keys can still enhance retrieval.
- Configurable OpenRouter subagent worker profiles are persisted and included in request tools when enabled.
- iPhone-sized users can create/switch sessions without rotating the device.
- No browser event feedback loop exists.
- The chat no longer accumulates dozens of token-count/status lines for one request.
- Expanded settings persist and apply.
- Full frontend tests and production build pass on the implementation branch.
- Changes are propagated to both `v0/openplanter-36c03735` and `main` after verification.