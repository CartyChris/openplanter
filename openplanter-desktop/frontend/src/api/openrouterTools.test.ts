import { describe, expect, it } from "vitest";
import { normalizePreferences } from "./webPreferences";
import {
  buildOpenRouterTools,
  buildSubagentTools,
  buildWebChatBody,
  buildWebSystemMessage,
} from "./openrouterTools";

describe("OpenRouter server tools", () => {
  it("adds built-in web search and fetch without external API keys", () => {
    const preferences = normalizePreferences({
      webSearchMode: "auto",
      webFetchEnabled: true,
      maxSearchResults: 7,
    });
    const body = buildWebChatBody(
      "openrouter",
      "openai/gpt-5.5",
      [{ role: "user", content: "What happened today?" }],
      preferences
    );
    const tools = body.tools as Array<Record<string, unknown>>;

    expect(tools).toEqual(expect.arrayContaining([
      expect.objectContaining({ type: "openrouter:web_search" }),
      expect.objectContaining({ type: "openrouter:web_fetch" }),
    ]));
    expect(body.plugins).toBeUndefined();
    expect(body.provider).toEqual({ allow_fallbacks: true });
  });

  it("omits built-in web tools when web search is off", () => {
    const preferences = normalizePreferences({ webSearchMode: "off", webFetchEnabled: false });
    const tools = buildOpenRouterTools(preferences, "openai/gpt-5.5");
    expect(tools.some((tool) => tool.type === "openrouter:web_search")).toBe(false);
    expect(tools.some((tool) => tool.type === "openrouter:web_fetch")).toBe(false);
  });

  it("passes domain and result limits to the web tools", () => {
    const preferences = normalizePreferences({
      maxSearchResults: 5,
      maxFetchTokens: 18000,
      allowedDomains: ["reuters.com"],
      blockedDomains: ["example.com"],
    });
    const tools = buildOpenRouterTools(preferences, "openai/gpt-5.5");
    const search = tools.find((tool) => tool.type === "openrouter:web_search") as any;
    const fetch = tools.find((tool) => tool.type === "openrouter:web_fetch") as any;

    expect(search.parameters.max_results).toBe(5);
    expect(search.parameters.allowed_domains).toEqual(["reuters.com"]);
    expect(search.parameters.excluded_domains).toEqual(["example.com"]);
    expect(fetch.parameters.max_content_tokens).toBe(18000);
  });

  it("instructs auto mode to search for changing information", () => {
    const policy = buildWebSystemMessage(normalizePreferences({ webSearchMode: "auto" }));
    expect(policy).toContain("MUST search");
    expect(policy).toContain("current or changing information");
    expect(policy).toContain("Cite URLs");
  });

  it("instructs always mode to search every substantive request", () => {
    const policy = buildWebSystemMessage(normalizePreferences({ webSearchMode: "always" }));
    expect(policy).toContain("at least one web search");
  });

  it("serializes enabled worker profiles as OpenRouter subagent tools", () => {
    const preferences = normalizePreferences({
      subagentsEnabled: true,
      maxDelegations: 4,
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
        webFetch: true,
      }],
    });
    const tools = buildSubagentTools(preferences, "openai/gpt-5.5") as any[];

    expect(tools).toHaveLength(1);
    expect(tools[0].type).toBe("openrouter:subagent");
    expect(tools[0].parameters.model).toBe("z-ai/glm-5.2");
    expect(tools[0].parameters.instructions).toContain("Research independently");
    expect(tools[0].parameters.tools).toEqual(expect.arrayContaining([
      expect.objectContaining({ type: "openrouter:web_search" }),
      expect.objectContaining({ type: "openrouter:web_fetch" }),
    ]));
  });

  it("uses the parent model when a worker model is blank", () => {
    const preferences = normalizePreferences({
      subagentsEnabled: true,
      subagents: [{
        id: "scout",
        name: "Scout",
        enabled: true,
        model: "",
        instructions: "Research independently.",
        reasoningEffort: "low",
        temperature: 0.2,
        maxOutputTokens: 3000,
        webSearch: true,
        webFetch: false,
      }],
    });
    const tools = buildSubagentTools(preferences, "qwen/qwen3-coder") as any[];
    expect(tools[0].parameters.model).toBe("qwen/qwen3-coder");
  });

  it("does not inject OpenRouter tools into direct providers", () => {
    const body = buildWebChatBody(
      "openai",
      "gpt-5",
      [{ role: "user", content: "hello" }],
      normalizePreferences({ subagentsEnabled: true })
    );
    expect(body.tools).toBeUndefined();
    expect(body.provider).toBeUndefined();
  });
});
