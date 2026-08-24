import { describe, expect, it } from "vitest";
import { buildWebChatBody, formatProviderError } from "./web";

describe("OpenRouter browser routing", () => {
  it("does not force the legacy web plugin or ZDR policy", () => {
    const body = buildWebChatBody("openrouter", "meta/muse-spark-1.2-contributor", [
      { role: "user", content: "Hi" },
    ]) as Record<string, any>;

    expect(body.plugins).toBeUndefined();
    expect(body.provider).toEqual({ allow_fallbacks: true });
    expect(body.provider.zdr).toBeUndefined();
    expect(body.provider.data_collection).toBeUndefined();
    expect(body.tools).toEqual(expect.arrayContaining([
      expect.objectContaining({ type: "openrouter:web_search" }),
      expect.objectContaining({ type: "openrouter:web_fetch" }),
    ]));
  });

  it("turns the 18+ attestation error into a one-time setup message", () => {
    const raw = JSON.stringify({
      error: {
        message: "This model requires you to complete the following before use: 18+ age confirmation.",
        metadata: { missing_attestation_types: ["age_18plus"] },
      },
    });

    const message = formatProviderError("openrouter", "meta/muse-spark-1.2-contributor", 403, raw);
    expect(message).toContain("one-time 18+ age confirmation");
    expect(message).toContain("openrouter.ai/settings/preferences");
    expect(message).toContain("No OpenPlanter setting change is required");
  });

  it("explains account guardrail failures without claiming OpenPlanter forces ZDR", () => {
    const raw = JSON.stringify({
      error: { message: "No endpoints available matching your guardrail restrictions and data policy." },
    });

    const message = formatProviderError("openrouter", "some/model", 404, raw);
    expect(message).toContain("account or API-key privacy guardrails");
    expect(message).toContain("not forcing Zero Data Retention");
  });

  it("recognizes legacy Firecrawl plus ZDR errors without asking for an external key", () => {
    const raw = JSON.stringify({
      error: { message: "Firecrawl is not available when Zero Data Retention (ZDR) is enabled." },
    });

    const message = formatProviderError("openrouter", "some/model", 400, raw);
    expect(message).toContain("legacy Firecrawl/ZDR conflict");
    expect(message).toContain("OpenRouter server tools");
    expect(message).not.toContain("add an Exa");
    expect(message).not.toContain("add a Firecrawl");
  });

  it("explains tool-calling incompatibility without asking for Exa", () => {
    const raw = JSON.stringify({ error: { message: "Model does not support tool calling" } });
    const message = formatProviderError("openrouter", "some/model", 400, raw);
    expect(message).toContain("tool-capable OpenRouter model");
    expect(message).not.toContain("Exa API key");
  });

  it("explains insufficient OpenRouter credits", () => {
    const message = formatProviderError(
      "openrouter",
      "some/model",
      402,
      JSON.stringify({ error: { message: "Insufficient credits" } })
    );
    expect(message).toContain("insufficient credits");
  });

  it("explains rate limits", () => {
    const message = formatProviderError(
      "openrouter",
      "some/model",
      429,
      JSON.stringify({ error: { message: "Rate limit exceeded" } })
    );
    expect(message).toContain("rate-limiting");
  });
});
