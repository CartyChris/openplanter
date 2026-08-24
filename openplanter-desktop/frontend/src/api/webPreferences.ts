const STORE_KEY = "openplanter:web:v2";

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

const reducedMotionDefault =
  typeof window !== "undefined" && typeof window.matchMedia === "function"
    ? window.matchMedia("(prefers-reduced-motion: reduce)").matches
    : false;

export const DEFAULT_WEB_PREFERENCES: WebPreferences = {
  webSearchMode: "auto",
  webFetchEnabled: true,
  webSearchEngine: "auto",
  webFetchEngine: "openrouter",
  maxSearchResults: 8,
  maxFetchTokens: 24000,
  allowedDomains: [],
  blockedDomains: [],
  citationsRequired: true,
  subagentsEnabled: false,
  maxDelegations: 3,
  delegationMode: "auto",
  subagents: [
    {
      id: "research-scout",
      name: "Research Scout",
      enabled: true,
      model: "",
      instructions:
        "Research the delegated question independently. Prefer primary and recent sources, compare conflicting evidence, and return concise findings with URLs.",
      reasoningEffort: "medium",
      temperature: 0.2,
      maxOutputTokens: 6000,
      webSearch: true,
      webFetch: true,
    },
    {
      id: "verifier",
      name: "Verifier",
      enabled: false,
      model: "",
      instructions:
        "Challenge the parent model's important factual claims, look for counterevidence and stale assumptions, and report only verified corrections or confirmations with sources.",
      reasoningEffort: "medium",
      temperature: 0.1,
      maxOutputTokens: 4000,
      webSearch: true,
      webFetch: true,
    },
  ],
  temperature: 0.2,
  maxOutputTokens: 12000,
  allowProviderFallbacks: true,
  showRunDiagnostics: true,
  compactRunSummary: true,
  autoScroll: true,
  theme: "dark",
  accent: "blue",
  fontScale: 1,
  density: "comfortable",
  messageWidth: "full",
  compactToolbar: false,
  reducedMotion: reducedMotionDefault,
};

const clamp = (value: unknown, fallback: number, min: number, max: number) => {
  const n = typeof value === "number" ? value : Number(value);
  return Math.min(max, Math.max(min, Number.isFinite(n) ? n : fallback));
};

const bool = (value: unknown, fallback: boolean) =>
  typeof value === "boolean" ? value : fallback;

const oneOf = <T extends string>(value: unknown, allowed: readonly T[], fallback: T): T =>
  typeof value === "string" && allowed.includes(value as T) ? (value as T) : fallback;

const domains = (value: unknown): string[] => {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map((item) => String(item).trim().toLowerCase()).filter(Boolean))].slice(0, 100);
};

function normalizeSubagent(input: unknown, index: number): SubagentProfile {
  const raw = input && typeof input === "object" ? (input as Record<string, unknown>) : {};
  const fallback = DEFAULT_WEB_PREFERENCES.subagents[index] || {
    id: `worker-${index + 1}`,
    name: `Worker ${index + 1}`,
    enabled: false,
    model: "",
    instructions: "Research the delegated task and return concise evidence-backed findings.",
    reasoningEffort: "medium" as ReasoningEffort,
    temperature: 0.2,
    maxOutputTokens: 4000,
    webSearch: true,
    webFetch: true,
  };
  return {
    id: typeof raw.id === "string" && raw.id.trim() ? raw.id.trim() : fallback.id,
    name: typeof raw.name === "string" && raw.name.trim() ? raw.name.trim().slice(0, 80) : fallback.name,
    enabled: bool(raw.enabled, fallback.enabled),
    model: typeof raw.model === "string" ? raw.model.trim().slice(0, 200) : fallback.model,
    instructions:
      typeof raw.instructions === "string" && raw.instructions.trim()
        ? raw.instructions.trim().slice(0, 6000)
        : fallback.instructions,
    reasoningEffort: oneOf(raw.reasoningEffort, ["off", "low", "medium", "high"] as const, fallback.reasoningEffort),
    temperature: clamp(raw.temperature, fallback.temperature, 0, 2),
    maxOutputTokens: Math.round(clamp(raw.maxOutputTokens, fallback.maxOutputTokens, 256, 64000)),
    webSearch: bool(raw.webSearch, fallback.webSearch),
    webFetch: bool(raw.webFetch, fallback.webFetch),
  };
}

export function normalizePreferences(input?: Partial<WebPreferences> | null): WebPreferences {
  const raw = input && typeof input === "object" ? (input as Record<string, unknown>) : {};
  const subagents = Array.isArray(raw.subagents)
    ? raw.subagents.slice(0, 10).map((worker, index) => normalizeSubagent(worker, index))
    : DEFAULT_WEB_PREFERENCES.subagents.map((worker) => ({ ...worker }));

  return {
    webSearchMode: oneOf(raw.webSearchMode, ["auto", "always", "off"] as const, "auto"),
    webFetchEnabled: bool(raw.webFetchEnabled, true),
    webSearchEngine: oneOf(raw.webSearchEngine, ["auto", "native", "exa", "parallel"] as const, "auto"),
    webFetchEngine: oneOf(raw.webFetchEngine, ["openrouter", "auto", "native", "exa", "parallel"] as const, "openrouter"),
    maxSearchResults: Math.round(clamp(raw.maxSearchResults, 8, 1, 20)),
    maxFetchTokens: Math.round(clamp(raw.maxFetchTokens, 24000, 2000, 50000)),
    allowedDomains: domains(raw.allowedDomains),
    blockedDomains: domains(raw.blockedDomains),
    citationsRequired: bool(raw.citationsRequired, true),
    subagentsEnabled: bool(raw.subagentsEnabled, false),
    maxDelegations: Math.round(clamp(raw.maxDelegations, 3, 1, 10)),
    delegationMode: oneOf(raw.delegationMode, ["auto", "research-only"] as const, "auto"),
    subagents,
    temperature: clamp(raw.temperature, 0.2, 0, 2),
    maxOutputTokens: Math.round(clamp(raw.maxOutputTokens, 12000, 256, 64000)),
    allowProviderFallbacks: bool(raw.allowProviderFallbacks, true),
    showRunDiagnostics: bool(raw.showRunDiagnostics, true),
    compactRunSummary: bool(raw.compactRunSummary, true),
    autoScroll: bool(raw.autoScroll, true),
    theme: oneOf(raw.theme, ["dark", "light", "high-contrast"] as const, "dark"),
    accent: oneOf(raw.accent, ["blue", "cyan", "green", "violet", "amber"] as const, "blue"),
    fontScale: clamp(raw.fontScale, 1, 0.9, 1.2),
    density: oneOf(raw.density, ["compact", "comfortable"] as const, "comfortable"),
    messageWidth: oneOf(raw.messageWidth, ["full", "readable"] as const, "full"),
    compactToolbar: bool(raw.compactToolbar, false),
    reducedMotion: bool(raw.reducedMotion, reducedMotionDefault),
  };
}

function readStore(): Record<string, unknown> {
  if (typeof localStorage === "undefined") return {};
  try {
    const raw = localStorage.getItem(STORE_KEY);
    return raw ? (JSON.parse(raw) as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

export function getWebPreferences(): WebPreferences {
  return normalizePreferences(readStore().preferences as Partial<WebPreferences> | undefined);
}

export function updateWebPreferences(partial: Partial<WebPreferences>): WebPreferences {
  const store = readStore();
  const preferences = normalizePreferences({ ...getWebPreferences(), ...partial });
  if (typeof localStorage !== "undefined") {
    localStorage.setItem(STORE_KEY, JSON.stringify({ ...store, preferences }));
  }
  return preferences;
}

export function applyWebAppearance(preferences = getWebPreferences()): void {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  root.dataset.theme = preferences.theme;
  root.dataset.accent = preferences.accent;
  root.dataset.density = preferences.density;
  root.dataset.messageWidth = preferences.messageWidth;
  root.dataset.reducedMotion = String(preferences.reducedMotion);
  root.dataset.compactToolbar = String(preferences.compactToolbar);
  root.style.setProperty("--font-scale", String(preferences.fontScale));
}
