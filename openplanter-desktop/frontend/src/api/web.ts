import type { ConfigView, GraphData, ModelInfo, ReplayEntry, SessionInfo } from "./types";

const KEY = "openplanter:web:v2";
type DocumentRecord = { name: string; content: string; createdAt: string };
type WebStore = { config: ConfigView; sessions: SessionInfo[]; history: Record<string, ReplayEntry[]>; credentials: Record<string, string>; documents: DocumentRecord[] };
type ChatMessage = { role: string; content: string };
type ProviderErrorEnvelope = {
  error?: {
    message?: string;
    metadata?: { missing_attestation_types?: string[] };
  };
  message?: string;
};

const defaults = (): WebStore => ({ config: { provider: "openrouter", model: "anthropic/claude-sonnet-4.5", reasoning_effort: null, workspace: "Browser workspace", session_id: null, recursive: true, max_depth: 4, max_steps_per_call: 100, demo: false }, sessions: [], history: {}, credentials: {}, documents: [] });
function read(): WebStore { try { const raw = localStorage.getItem(KEY); if (raw) return { ...defaults(), ...JSON.parse(raw) }; const old = localStorage.getItem("openplanter:web:v1"); return old ? { ...defaults(), ...JSON.parse(old), credentials: {} } : defaults(); } catch { return defaults(); } }
function save(s: WebStore) { localStorage.setItem(KEY, JSON.stringify(s)); }
export const isTauri = () => typeof window !== "undefined" && Boolean((window as Window & { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__);
export function webConfig(): ConfigView { return read().config; }
export function webUpdateConfig(partial: Partial<ConfigView>): ConfigView { const s = read(); s.config = { ...s.config, ...partial }; save(s); return s.config; }
export function webCredentials(): Record<string, boolean> { return Object.fromEntries(Object.entries(read().credentials).map(([k, v]) => [k, Boolean(v)])); }
export function webSaveCredential(provider: string, value: string) { const s = read(); if (value.trim()) s.credentials[provider] = value.trim(); else delete s.credentials[provider]; save(s); }
export function webSessions(): SessionInfo[] { return read().sessions; }
export function webOpenSession(id?: string): SessionInfo { const s = read(); const session = (id && s.sessions.find((x) => x.id === id)) || { id: crypto.randomUUID(), created_at: new Date().toISOString(), turn_count: 0, last_objective: null }; if (!s.sessions.some((x) => x.id === session.id)) s.sessions.unshift(session); s.config.session_id = session.id; save(s); return session; }
export function webDeleteSession(id: string) { const s = read(); s.sessions = s.sessions.filter((x) => x.id !== id); delete s.history[id]; save(s); }
export function webHistory(id: string) { return read().history[id] || []; }
export function webAddHistory(id: string, entry: ReplayEntry) { const s = read(); s.history[id] = [...(s.history[id] || []), entry].slice(-500); save(s); }
const modelCatalog: Record<string, string[]> = { openrouter: ["anthropic/claude-sonnet-4.5", "openai/gpt-5", "openai/gpt-5-mini", "moonshotai/kimi-k2", "deepseek/deepseek-chat-v3.1", "deepseek/deepseek-r1", "z-ai/glm-4.5-air", "google/gemini-2.5-pro", "meta-llama/llama-4-maverick", "qwen/qwen3-coder"], openai: ["gpt-5", "gpt-5-mini", "gpt-4.1-mini"], anthropic: ["claude-sonnet-4-5", "claude-opus-4-1", "claude-haiku-4-5"], google: ["gemini-2.5-pro", "gemini-2.5-flash"], cerebras: ["llama-4-scout-17b-16e-instruct", "qwen-3-235b-a22b-instruct-2507"], ollama: ["llama3.2", "qwen3:8b", "deepseek-r1"], lmstudio: ["local-model"] };
export function webModels(provider: string): ModelInfo[] { return (modelCatalog[provider] || modelCatalog.openrouter).map((id) => ({ id, name: id, provider })); }
export async function webRefreshOpenRouterModels(): Promise<ModelInfo[]> { const response = await fetch("https://openrouter.ai/api/v1/models"); if (!response.ok) throw new Error(`OpenRouter models unavailable (${response.status})`); const json = await response.json() as { data?: Array<{ id: string; name?: string }> }; const models = (json.data || []).map((m) => ({ id: m.id, name: m.name || m.id, provider: "openrouter" })); if (models.length) { modelCatalog.openrouter = models.map((m) => m.id); } return models; }
const researchEndpoints = { exa: "https://api.exa.ai/search", firecrawl: "https://api.firecrawl.dev/v1/search" };
export async function webResearch(query: string): Promise<string> { const s = read(); const exaKey = s.credentials.exa; const firecrawlKey = s.credentials.firecrawl; if (!exaKey && !firecrawlKey) return ""; if (exaKey) { const response = await fetch(researchEndpoints.exa, { method: "POST", headers: { "Content-Type": "application/json", "x-api-key": exaKey }, body: JSON.stringify({ query, type: "auto", numResults: 5, contents: { highlights: { maxCharacters: 1200 } } }) }); if (response.ok) { const json = await response.json() as { results?: Array<{ title?: string; url?: string; highlights?: string[] }> }; return (json.results || []).map((r) => `SOURCE: ${r.title || r.url}\nURL: ${r.url || ""}\n${(r.highlights || []).join(" ")}`).join("\n\n"); } } if (firecrawlKey) { const response = await fetch(researchEndpoints.firecrawl, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${firecrawlKey}` }, body: JSON.stringify({ query, limit: 5 }) }); if (response.ok) { const json = await response.json() as { data?: Array<{ title?: string; url?: string; description?: string }> }; return (json.data || []).map((r) => `SOURCE: ${r.title || r.url}\nURL: ${r.url || ""}\n${r.description || ""}`).join("\n\n"); } } return ""; }
export function webGraph(): GraphData { const docs = read().documents; return { nodes: docs.map((d, i) => ({ id: `doc-${i}`, label: d.name, category: "document", path: d.name, node_type: "source" as const })), edges: [] }; }
export function webSaveDocument(name: string, content: string) { const s = read(); s.documents = [...s.documents.filter((d) => d.name !== name), { name, content, createdAt: new Date().toISOString() }]; save(s); }
export function webDocuments() { return read().documents; }
export function downloadText(filename: string, content: string, type = "text/markdown") { const blob = new Blob([content], { type }); const url = URL.createObjectURL(blob); const a = document.createElement("a"); a.href = url; a.download = filename; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000); }
export function exportWorkspace() { downloadText("openplanter-backup.json", JSON.stringify(read(), null, 2), "application/json"); }
export async function importWorkspace(file: File) { const incoming = JSON.parse(await file.text()) as WebStore; if (!incoming || !incoming.config || !Array.isArray(incoming.sessions)) throw new Error("Invalid OpenPlanter backup"); save({ ...defaults(), ...incoming }); location.reload(); }
export function wipeWorkspace() { localStorage.removeItem(KEY); localStorage.removeItem("openplanter:web:v1"); localStorage.removeItem("openplanter:evidence"); localStorage.removeItem("openplanter:favorites"); localStorage.removeItem("openplanter:profile"); localStorage.removeItem("openplanter:spend-limit"); location.reload(); }
export async function importFolder(files: FileList | File[]) { for (const file of Array.from(files)) { if (file.size <= 2_000_000) webSaveDocument(file.webkitRelativePath || file.name, await file.text()); } }
export function exportFindings() { const s = read(); const notes = JSON.parse(localStorage.getItem("openplanter:evidence") || "[]"); const body = `# OpenPlanter Findings\n\n## Documents\n${s.documents.map((d) => `### ${d.name}\n\n${d.content}`).join("\n\n")}\n\n## Evidence\n${notes.map((n: { text: string; contradiction: boolean }) => `- ${n.contradiction ? "[CONTRADICTION] " : ""}${n.text}`).join("\n")}`; downloadText("openplanter-findings.md", body); }

const endpoints: Record<string, string> = { openrouter: "https://openrouter.ai/api/v1", openai: "https://api.openai.com/v1", google: "https://generativelanguage.googleapis.com/v1beta/openai", cerebras: "https://api.cerebras.ai/v1", ollama: "http://localhost:11434/v1", lmstudio: "http://localhost:1234/v1" };

export function buildWebChatBody(provider: string, model: string, messages: ChatMessage[]) {
  return {
    model,
    messages,
    stream: true,
    temperature: 0.2,
    ...(provider === "openrouter" ? { provider: { allow_fallbacks: true } } : {}),
  };
}

export function formatProviderError(provider: string, model: string, status: number, raw: string): string {
  let parsed: ProviderErrorEnvelope | null = null;
  try { parsed = JSON.parse(raw) as ProviderErrorEnvelope; } catch { /* provider may return plain text */ }
  const message = parsed?.error?.message || parsed?.message || raw.trim() || "Unknown provider error";
  const missingAttestations = parsed?.error?.metadata?.missing_attestation_types || [];

  if (provider === "openrouter") {
    if (status === 403 && missingAttestations.includes("age_18plus")) {
      return `OpenRouter requires a one-time 18+ age confirmation before ${model} can be used. Confirm it at https://openrouter.ai/settings/preferences and retry. No OpenPlanter setting change is required.`;
    }
    if (status === 404 && /guardrail restrictions|data policy/i.test(message)) {
      return `OpenRouter cannot find an endpoint for ${model} that is allowed by your account or API-key privacy guardrails. OpenPlanter is not forcing Zero Data Retention or a provider. Use a compatible model or review https://openrouter.ai/settings/privacy.`;
    }
    if (status === 400 && /firecrawl/i.test(message) && /zero data retention|zdr/i.test(message)) {
      return "OpenRouter web search is conflicting with Zero Data Retention. OpenPlanter no longer enables OpenRouter's web-search plugin automatically; refresh to the latest deployment and retry.";
    }
  }

  return `${status}: ${message.slice(0, 500)}`;
}

export async function webSolve(objective: string, sessionId: string, signal?: AbortSignal) {
  const s = read();
  const provider = s.config.provider;
  const key = s.credentials[provider];
  const keylessLocal = provider === "ollama" || provider === "lmstudio";
  if (!key && !keylessLocal) throw new Error(`Add a ${provider} API key in Settings first.`);
  if (provider === "anthropic") {
    throw new Error("For Claude through the web app, select provider 'openrouter' and an anthropic/... model. Direct Anthropic browser transport is not enabled in this build.");
  }

  const started = Date.now();
  const inputTokens = Math.max(1, Math.ceil(objective.length / 4));
  window.dispatchEvent(new CustomEvent("agent-step", { detail: { depth: 0, step: 1, tool_name: null, tokens: { input_tokens: inputTokens, output_tokens: 0 }, elapsed_ms: 0, is_final: false } }));
  const messages: ChatMessage[] = (s.history[sessionId] || []).filter((x) => x.role === "user" || x.role === "assistant").slice(-20).map((x) => ({ role: x.role, content: x.content }));
  const research = await webResearch(objective).catch(() => "");
  const prompt = research ? `${objective}\n\nUse these web sources when relevant. Cite URLs and distinguish retrieved facts from your own reasoning:\n${research}` : objective;
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
    body: JSON.stringify(buildWebChatBody(provider, s.config.model, messages)),
  });
  if (!response.ok) {
    const raw = await response.text();
    throw new Error(formatProviderError(provider, s.config.model, response.status, raw));
  }
  if (!response.body) throw new Error("Provider returned no response stream.");

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let result = "";
  const emit = (text: string) => { result += text; window.dispatchEvent(new CustomEvent("agent-chunk", { detail: { text, result } })); };
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
      try { const delta = JSON.parse(data).choices?.[0]?.delta?.content; if (delta) emit(delta); } catch { /* ignore incomplete SSE frames */ }
    }
  }
  if (!result.trim()) throw new Error("The model returned an empty response.");
  webAddHistory(sessionId, { seq: webHistory(sessionId).length, timestamp: new Date().toISOString(), role: "assistant", content: result, is_rendered: true });
  window.dispatchEvent(new CustomEvent("agent-step", { detail: { depth: 0, step: 1, tool_name: null, tokens: { input_tokens: inputTokens, output_tokens: Math.max(1, Math.ceil(result.length / 4)) }, elapsed_ms: Date.now() - started, is_final: true } }));
  window.dispatchEvent(new CustomEvent("agent:complete", { detail: { result } }));
}

export function webCancel() { /* fetch is aborted by invoke layer */ }
export function webAbortController() { return new AbortController(); }
export function clearWebData() { wipeWorkspace(); }
export function getWebBackup() { return read(); }
export function restoreWebBackup(data: WebStore) { save({ ...defaults(), ...data }); }
export type { WebStore };
