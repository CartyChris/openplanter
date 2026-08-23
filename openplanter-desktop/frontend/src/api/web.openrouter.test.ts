import { describe, expect, it } from "vitest";
import { buildWebChatBody, formatProviderError } from "./web";

describe("OpenRouter browser routing", () => {
  it("does not force the legacy web plugin or ZDR policy", () => {
    const body = buildWebChatBody("openrouter", "meta/muse-spark-1.2-contributor", [
      { role: "user", content: "Hi" },
    ]) as Record<string, unknown>;

    expect(body.plugins).toBeUndefined();
    expect(body.provider).toEqual({ allow_fallbacks: true });
    expect((body.provider as Record<string, unknown>).zdr).toBeUndefined();
    expect((body.provider as Record<string, unknown>).data_collection).toBeUndefined();
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

  it("recognizes the Firecrawl plus ZDR incompatibility", () => {
    const raw = JSON.stringify({
      error: { message: "Firecrawl is not available when Zero Data Retention (ZDR) is enabled." },
    });

    const message = formatProviderError("openrouter", "some/model", 400, raw);
    expect(message).toContain("no longer enables OpenRouter's web-search plugin automatically");
  });
});
