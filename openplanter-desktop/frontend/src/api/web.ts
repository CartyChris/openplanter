import type { ConfigView, GraphData, ModelInfo, ReplayEntry, SessionInfo } from "./types";
import {
  DEFAULT_WEB_PREFERENCES,
  getWebPreferences,
  normalizePreferences,
  type WebPreferences,
} from "./webPreferences";
import {
  buildWebChatBody,
  buildWebSystemMessage,
  type ChatMessage,
} from "./openrouterTools";

export { buildWebChatBody } from "./openrouterTools";

const KEY = "openplanter:web:v2";
type DocumentRecord = { name: string; content: string; createdAt: string };
type WebStore = {
  config: ConfigView;
  sessions: SessionInfo[];
  history: Record<string, ReplayEntry[]>;
  credentials: Record<string, string>;
  documents: DocumentRecord[];
  preferences: WebPreferences;
};
type ProviderErrorEnvelope = {
  error?: {
    message?: string;
    metadata?: { missing_attestation_types?: string[] };
  };
  message?: string;
};

const defaults = (): WebStore => ({
  config: {
    provider: "openrouter",
    model: "anthropic/claude-sonnet-4.5",
    reasoning_effort: null,
    workspace: "Browser workspace",
    session_id: null,
    recursive: true,
    max_depth: 4,
    max_steps_per_call: 100,
    demo: false,
  },
  sessions: [],
  history: {},
  credentials: {},
  documents: [],
  preferences: normalizePreferences(DEFAULT_WEB_PREFERENCES),
});

function hydrate(input: Partial<WebStore>): WebStore {
  const base = defaults();
  return {
    ...base,
    ...input,
    config: { ...base.config, ...(input.config || {}) },
    sessions: Array.isArray(input.sessions) ? input.sessions : [],
    history: input.history && typeof input.history === "object" ? input.history : {},
    credentials: input.credentials && typeof input.credentials === "object" ? input.credentials : {},
    documents: Array.isArray(input.documents) ? input.documents : [],
    preferences: normalizePreferences(input.preferences),
  };
}

function read(): WebStore {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return hydrate(JSON.parse(raw) as Partial<WebStore>);
    const old = localStorage.getItem("openplanter:web:v1");
    return old ? hydrate({ ...(JSON.parse(old) as Partial<WebStore>), credentials: {} }) : defaults();
  } catch {
    return defaults();
  }
}

function save(store: WebStore) {
  localStorage.setItem(KEY, JSON.stringify(store));
}

export const isTauri = () =>
  typeof window !== "undefined" &&
  Boolean((window as Window & { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__);

export function webConfig(): ConfigView {
  return read().config;
}

export function webUpdateConfig(partial: Partial<ConfigView>): ConfigView {
  const store = read();
  store.config = { ...store.config, ...partial };
  save(store);
  return store.config;
}

export function webCredentials(): Record<string, boolean> {
  return Object.fromEntries(
    Object.entries(read().credentials).map(([key, value]) => [key, Boolean(value)])
  );
}

export function webSaveCredential(provider: string, value: string) {
  const store = read();
  if (value.trim()) store.credentials[provider] = value.trim();
  else delete store.credentials[provider];
  save(store);
}

export function webSessions(): SessionInfo[] {
  return read().sessions;
}

export function webOpenSession(id?: string): SessionInfo {
  const store = read();
  const session =
    (id && store.sessions.find((item) => item.id === id)) || {
      id: crypto.randomUUID(),
      created_at: new Date().toISOString(),
      turn_count: 0,
      last_objective: null,
    };
  if (!store.sessions.some((item) => item.id === session.id)) store.sessions.unshift(session);
  store.config.session_id = session.id;
  save(store);
  return session;
}

export function webDeleteSession(id: string) {
  const store = read();
  store.sessions = store.sessions.filter((item) => item.id !== id);
  delete store.history[id];
  save(store);
}

export function webHistory(id: string) {
  return read().history[id] || [];
}

export function webAddHistory(id: string, entry: ReplayEntry) {
  const store = read();
  store.history[id] = [...(store.history[id] || []), entry].slice(-500);
  const session = store.sessions.find((item) => item.id === id);
  if (session) {
    session.turn_count = (session.turn_count || 0) + (entry.role === "assistant" ? 1 : 0);
  }
  save(store);
}

const modelCatalog: Record<string, string[]> = {
  openrouter: [
    "anthropic/claude-sonnet-4.5",
    "openai/gpt-5.5",
    "openai/gpt-5",
    "z-ai/glm-5.2",
    "moonshotai/kimi-k2",
    "deepseek/deepseek-r1",
    "qwen/qwen3-coder",
  ],
  openai: ["gpt-5", "gpt-5-mini", "gpt-4.1-mini"],
  anthropic: ["claude-sonnet-4-5", "claude-opus-4-1", "claude-haiku-4-5"],
  google: ["gemini-2.5-pro", "gemini-2.5-flash"],
  cerebras: ["llama-4-scout-17b-16e-instruct", "qwen-3-235b-a22b-instruct-2507"],
  ollama: ["llama3.2", "qwen3:8b", "deepseek-r1"],
  lmstudio: ["local-model"],
};

export function webModels(provider: string): ModelInfo[] {
  return (modelCatalog[provider] || modelCatalog.openrouter).map((id) => ({ id, name: id, provider }));
}

export async function webRefreshOpenRouterModels(): Promise<ModelInfo[]> {
  const response = await fetch("https://openrouter.ai/api/v1/models");
  if (!response.ok) throw new Error(`OpenRouter models unavailable (${response.status})`);
  const json = (await response.json()) as { data?: Array<{ id: string; name?: string }> };
  const models = (json.data || []).map((item) => ({
    id: item.id,
    name: item.name || item.id,
    provider: "openrouter",
  }));
  if (models.length) modelCatalog.openrouter = models.map((item) => item.id);
  return models;
}

const researchEndpoints = {
  exa: "https://api.exa.ai/search",
  firecrawl: "https://api.firecrawl.dev/v1/search",
};

/** Optional enhancement retrieval. OpenRouter's own web tools do not depend on this. */
export async function webResearch(query: string): Promise<string> {
  const store = read();
  const exaKey = store.credentials.exa;
  const firecrawlKey = store.credentials.firecrawl;
  if (!exaKey && !firecrawlKey) return "";

  if (exaKey) {
    const response = await fetch(researchEndpoints.exa, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": exaKey },
      body: JSON.stringify({
        query,
        type: "auto",
        numResults: Math.min(10, store.preferences.maxSearchResults),
        contents: { highlights: { maxCharacters: 1200 } },
      }),
    });
    if (response.ok) {
      const json = (await response.json()) as {
        results?: Array<{ title?: string; url?: string; highlights?: string[] }>;
      };
      return (json.results || [])
        .map(
          (result) =>
            `SOURCE: ${result.title || result.url}\nURL: ${result.url || ""}\n${(result.highlights || []).join(" ")}`
        )
        .join("\n\n");
    }
  }

  if (firecrawlKey) {
    const response = await fetch(researchEndpoints.firecrawl, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${firecrawlKey}` },
      body: JSON.stringify({ query, limit: Math.min(10, store.preferences.maxSearchResults) }),
    });
    if (response.ok) {
      const json = (await response.json()) as {
        data?: Array<{ title?: string; url?: string; description?: string }>;
      };
      return (json.data || [])
        .map(
          (result) =>
            `SOURCE: ${result.title || result.url}\nURL: ${result.url || ""}\n${result.description || ""}`
        )
        .join("\n\n");
    }
  }

  return "";
}

export function webGraph(): GraphData {
  const docs = read().documents;
  return {
    nodes: docs.map((doc, index) => ({
      id: `doc-${index}`,
      label: doc.name,
      category: "document",
      path: doc.name,
      node_type: "source" as const,
    })),
    edges: [],
  };
}

export function webSaveDocument(name: string, content: string) {
  const store = read();
  store.documents = [
    ...store.documents.filter((doc) => doc.name !== name),
    { name, content, createdAt: new Date().toISOString() },
  ];
  save(store);
}

export function webDocuments() {
  return read().documents;
}

export function downloadText(filename: string, content: string, type = "text/markdown") {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function exportWorkspace() {
  downloadText("openplanter-backup.json", JSON.stringify(read(), null, 2), "application/json");
}

export async function importWorkspace(file: File) {
  const incoming = JSON.parse(await file.text()) as Partial<WebStore>;
  if (!incoming || !incoming.config || !Array.isArray(incoming.sessions)) {
    throw new Error("Invalid OpenPlanter backup");
  }
  save(hydrate(incoming));
  location.reload();
}

export function wipeWorkspace() {
  localStorage.removeItem(KEY);
  localStorage.removeItem("openplanter:web:v1");
  localStorage.removeItem("openplanter:evidence");
  localStorage.removeItem("openplanter:favorites");
  localStorage.removeItem("openplanter:profile");
  localStorage.removeItem("openplanter:spend-limit");
  location.reload();
}

export async function importFolder(files: FileList | File[]) {
  for (const file of Array.from(files)) {
    if (file.size <= 2_000_000) {
      webSaveDocument(file.webkitRelativePath || file.name, await file.text());
    }
  }
}

export function exportFindings() {
  const store = read();
  const notes = JSON.parse(localStorage.getItem("openplanter:evidence") || "[]");
  const body = `# OpenPlanter Findings\n\n## Documents\n${store.documents
    .map((doc) => `### ${doc.name}\n\n${doc.content}`)
    .join("\n\n")}\n\n## Evidence\n${notes
    .map(
      (note: { text: string; contradiction: boolean }) =>
        `- ${note.contradiction ? "[CONTRADICTION] " : ""}${note.text}`
    )
    .join("\n")}`;
  downloadText("openplanter-findings.md", body);
}

const endpoints: Record<string, string> = {
  openrouter: "https://openrouter.ai/api/v1",
  openai: "https://api.openai.com/v1",
  google: "https://generativelanguage.googleapis.com/v1beta/openai",
  cerebras: "https://api.cerebras.ai/v1",
  ollama: "http://localhost:11434/v1",
  lmstudio: "http://localhost:1234/v1",
};

export function formatProviderError(
  provider: string,
  model: string,
  status: number,
  raw: string
): string {
  let parsed: ProviderErrorEnvelope | null = null;
  try {
    parsed = JSON.parse(raw) as ProviderErrorEnvelope;
  } catch {
    // Provider may return plain text.
  }
  const message = parsed?.error?.message || parsed?.message || raw.trim() || "Unknown provider error";
  const missingAttestations = parsed?.error?.metadata?.missing_attestation_types || [];

  if (provider === "openrouter") {
    if (status === 403 && missingAttestations.includes("age_18plus")) {
      return `OpenRouter requires a one-time 18+ age confirmation before ${model} can be used. Confirm it at https://openrouter.ai/settings/preferences and retry. No OpenPlanter setting change is required.`;
    }
    if (status === 404 && /guardrail restrictions|data policy/i.test(message)) {
      return `OpenRouter cannot find an endpoint for ${model} that is allowed by your account or API-key privacy guardrails. OpenPlanter is not forcing Zero Data Retention or a provider. Use a compatible model or review https://openrouter.ai/settings/privacy.`;
    }
    if (/does not support tool|tool calling|tools are not supported/i.test(message)) {
      return `The selected model (${model}) cannot use OpenRouter server tools. Switch to a tool-capable OpenRouter model to use built-in web search or subagents.`;
    }
    if (status === 402 || /insufficient credits|payment required/i.test(message)) {
      return "OpenRouter reports insufficient credits for this request or its server tools. Add OpenRouter credits or choose a free/cheaper model or search configuration.";
    }
    if (status === 429 || /rate limit/i.test(message)) {
      return "OpenRouter is rate-limiting this request. Wait briefly and retry; provider fallbacks remain enabled when allowed by your settings.";
    }
    if (/subagent/i.test(message) && /unavailable|model|provider/i.test(message)) {
      return `An OpenRouter subagent worker could not start. Check the worker model in Settings → Subagents or disable that worker and retry. Provider message: ${message.slice(0, 220)}`;
    }
    if (/web[_ -]?(search|fetch)|search engine/i.test(message) && /privacy|zdr|retention|policy/i.test(message)) {
      return `OpenRouter's built-in web tool is blocked by the current account/privacy policy. OpenPlanter does not require Exa or Firecrawl keys; use a compatible OpenRouter privacy setting or turn web search off for this request.`;
    }
    if (status === 400 && /firecrawl/i.test(message) && /zero data retention|zdr/i.test(message)) {
      return "A legacy Firecrawl/ZDR conflict was returned. This OpenPlanter build uses OpenRouter server tools rather than the old web plugin; refresh to the latest deployment and retry.";
    }
  }

  return `${status}: ${message.slice(0, 500)}`;
}

export async function webSolve(objective: string, sessionId: string, signal?: AbortSignal) {
  const store = read();
  const provider = store.config.provider;
  const key = store.credentials[provider];
  const keylessLocal = provider === "ollama" || provider === "lmstudio";
  if (!key && !keylessLocal) throw new Error(`Add a ${provider} API key in Settings first.`);
  if (provider === "anthropic") {
    throw new Error(
      "For Claude through the web app, select provider 'openrouter' and an anthropic/... model. Direct Anthropic browser transport is not enabled in this build."
    );
  }

  const preferences = getWebPreferences();
  const started = Date.now();
  const inputTokens = Math.max(1, Math.ceil(objective.length / 4));
  window.dispatchEvent(
    new CustomEvent("agent-step", {
      detail: {
        depth: 0,
        step: 1,
        tool_name: preferences.webSearchMode === "off" ? null : "web-ready",
        tokens: { input_tokens: inputTokens, output_tokens: 0 },
        elapsed_ms: 0,
        is_final: false,
      },
    })
  );

  const messages: ChatMessage[] = (store.history[sessionId] || [])
    .filter((entry) => entry.role === "user" || entry.role === "assistant")
    .slice(-20)
    .map((entry) => ({ role: entry.role, content: entry.content }));

  if (provider === "openrouter") {
    const systemPolicy = buildWebSystemMessage(preferences);
    if (systemPolicy) messages.unshift({ role: "system", content: systemPolicy });
  }

  const research = await webResearch(objective).catch(() => "");
  const prompt = research
    ? `${objective}\n\nOptional enhanced retrieval context (OpenRouter web tools are also available):\n${research}`
    : objective;
  messages.push({ role: "user", content: prompt });

  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (key) headers.Authorization = `Bearer ${key}`;
  if (provider === "openrouter") {
    headers["HTTP-Referer"] = location.origin;
    headers["X-Title"] = "OpenPlanter";
  }

  const response = await fetch(`${endpoints[provider] || endpoints.openrouter}/chat/completions`, {
    method: "POST",
    signal,
    headers,
    body: JSON.stringify(buildWebChatBody(provider, store.config.model, messages, preferences)),
  });
  if (!response.ok) {
    const raw = await response.text();
    throw new Error(formatProviderError(provider, store.config.model, response.status, raw));
  }
  if (!response.body) throw new Error("Provider returned no response stream.");

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let result = "";
  const emit = (text: string) => {
    result += text;
    window.dispatchEvent(new CustomEvent("agent-chunk", { detail: { text, result } }));
  };

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() || "";
    for (const line of lines) {
      if (!line.startsWith("data:")) continue;
      const data = line.slice(5).trim();
      if (data === "[DONE]") continue;
      try {
        const delta = JSON.parse(data).choices?.[0]?.delta?.content;
        if (delta) emit(delta);
      } catch {
        // Ignore incomplete SSE frames.
      }
    }
  }

  if (!result.trim()) throw new Error("The model returned an empty response.");
  webAddHistory(sessionId, {
    seq: webHistory(sessionId).length,
    timestamp: new Date().toISOString(),
    role: "assistant",
    content: result,
    is_rendered: true,
  });
  window.dispatchEvent(
    new CustomEvent("agent-step", {
      detail: {
        depth: 0,
        step: 1,
        tool_name: null,
        tokens: {
          input_tokens: inputTokens,
          output_tokens: Math.max(1, Math.ceil(result.length / 4)),
        },
        elapsed_ms: Date.now() - started,
        is_final: true,
      },
    })
  );
  window.dispatchEvent(new CustomEvent("agent:complete", { detail: { result } }));
}

export function webCancel() {
  // Fetch is aborted by the invoke layer's AbortController.
}
export function webAbortController() {
  return new AbortController();
}
export function clearWebData() {
  wipeWorkspace();
}
export function getWebBackup() {
  return read();
}
export function restoreWebBackup(data: WebStore) {
  save(hydrate(data));
}
export type { WebStore };
