import {
  DEFAULT_WEB_PREFERENCES,
  type SubagentProfile,
  type WebPreferences,
  normalizePreferences,
} from "./webPreferences";

export type ChatMessage = { role: string; content: string };
export type OpenRouterTool = Record<string, any>;

function searchParameters(preferences: WebPreferences): Record<string, unknown> {
  return {
    engine: preferences.webSearchEngine,
    max_results: preferences.maxSearchResults,
    max_total_results: Math.min(50, Math.max(preferences.maxSearchResults, preferences.maxSearchResults * 3)),
    search_context_size: preferences.maxSearchResults >= 8 ? "high" : "medium",
    ...(preferences.allowedDomains.length ? { allowed_domains: preferences.allowedDomains } : {}),
    ...(preferences.blockedDomains.length ? { excluded_domains: preferences.blockedDomains } : {}),
  };
}

function fetchParameters(preferences: WebPreferences): Record<string, unknown> {
  return {
    engine: preferences.webFetchEngine,
    max_content_tokens: preferences.maxFetchTokens,
    ...(preferences.allowedDomains.length ? { allowed_domains: preferences.allowedDomains } : {}),
    ...(preferences.blockedDomains.length ? { blocked_domains: preferences.blockedDomains } : {}),
  };
}

export function buildWebTools(preferences: WebPreferences): OpenRouterTool[] {
  if (preferences.webSearchMode === "off") return [];
  const tools: OpenRouterTool[] = [
    { type: "openrouter:web_search", parameters: searchParameters(preferences) },
  ];
  if (preferences.webFetchEnabled) {
    tools.push({ type: "openrouter:web_fetch", parameters: fetchParameters(preferences) });
  }
  return tools;
}

function workerInstructions(profile: SubagentProfile): string {
  const reasoning = profile.reasoningEffort === "off" ? "Do not spend extra time on hidden reasoning." : `Use ${profile.reasoningEffort} reasoning effort.`;
  return [
    `You are the ${profile.name} subagent.`,
    profile.instructions,
    reasoning,
    `Aim to stay within roughly ${profile.maxOutputTokens} output tokens and keep the result focused.`,
    "Return a concise evidence-backed result to the parent model. Do not attempt recursive delegation.",
  ].join(" ");
}

function workerTools(profile: SubagentProfile, preferences: WebPreferences): OpenRouterTool[] {
  const tools: OpenRouterTool[] = [];
  if (profile.webSearch) {
    tools.push({ type: "openrouter:web_search", parameters: searchParameters(preferences) });
  }
  if (profile.webFetch) {
    tools.push({ type: "openrouter:web_fetch", parameters: fetchParameters(preferences) });
  }
  return tools;
}

export function buildSubagentTools(preferences: WebPreferences, parentModel: string): OpenRouterTool[] {
  if (!preferences.subagentsEnabled) return [];
  return preferences.subagents
    .filter((profile) => profile.enabled)
    .slice(0, 10)
    .map((profile) => ({
      type: "openrouter:subagent",
      parameters: {
        model: profile.model || parentModel,
        instructions: workerInstructions(profile),
        tools: workerTools(profile, preferences),
      },
    }));
}

export function buildOpenRouterTools(preferences: WebPreferences, parentModel: string): OpenRouterTool[] {
  return [
    ...buildWebTools(preferences),
    ...buildSubagentTools(preferences, parentModel),
  ];
}

export function buildWebSystemMessage(preferences: WebPreferences): string {
  const lines: string[] = [];
  if (preferences.webSearchMode === "always") {
    lines.push("You MUST perform at least one web search before answering any substantive user request.");
  } else if (preferences.webSearchMode === "auto") {
    lines.push(
      "Web tools are available. You MUST search before answering claims whose correctness depends on current or changing information, including latest/current/today/news/prices/availability/recent releases/verification."
    );
  }
  if (preferences.webSearchMode !== "off" && preferences.webFetchEnabled) {
    lines.push("Use web_fetch on important sources when search snippets are insufficient or when exact source details matter.");
  }
  if (preferences.citationsRequired && preferences.webSearchMode !== "off") {
    lines.push("Cite URLs for retrieved claims and distinguish retrieved facts from your own reasoning.");
  }
  if (preferences.subagentsEnabled && preferences.subagents.some((profile) => profile.enabled)) {
    lines.push(
      `Subagents are available. Delegate independent research, extraction, comparison, or verification tasks when useful. Use no more than ${preferences.maxDelegations} delegations for this user request and integrate the workers' evidence into your final answer.`
    );
    if (preferences.delegationMode === "research-only") {
      lines.push("Use subagents only for research, source gathering, extraction, or verification—not for drafting the final response.");
    }
  }
  return lines.join(" ");
}

export function buildWebChatBody(
  provider: string,
  model: string,
  messages: ChatMessage[],
  preferences: WebPreferences = DEFAULT_WEB_PREFERENCES
): Record<string, unknown> {
  const normalized = normalizePreferences(preferences);
  const body: Record<string, unknown> = {
    model,
    messages,
    stream: true,
    temperature: normalized.temperature,
    max_tokens: normalized.maxOutputTokens,
  };

  if (provider === "openrouter") {
    if (normalized.allowProviderFallbacks) {
      body.provider = { allow_fallbacks: true };
    }
    const tools = buildOpenRouterTools(normalized, model);
    if (tools.length) body.tools = tools;
  }

  return body;
}
