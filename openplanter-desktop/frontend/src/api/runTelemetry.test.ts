import { describe, expect, it } from "vitest";
import { collectStreamTelemetry, safeSourceUrl, type RunTelemetry } from "./runTelemetry";
const run = (): RunTelemetry => ({ id: "test", timestamp: "2026-10-27", model: "test", provider: "test", objective: "Research", status: "running", elapsedMs: 0, usage: null, citations: [], toolCalls: [] });
describe("provider-exposed telemetry", () => {
  it("collects citation URLs without inventing verification", () => {
    const result = run();
    const chunk = { choices: [{ delta: { content: "Finding", annotations: [{ url_citation: { url: "https://example.com/case", title: "Opinion" } }, { url_citation: { url: "javascript:alert(1)" } }] } }] };
    expect(collectStreamTelemetry(chunk, result)).toBe("Finding");
    collectStreamTelemetry(chunk, result);
    expect(result.citations).toEqual([{ url: "https://example.com/case", title: "Opinion" }]);
    expect(result.usage).toBeNull();
  });
  it("joins exposed tool arguments and records actual usage", () => {
    const result = run();
    collectStreamTelemetry({ choices: [{ delta: { tool_calls: [{ index: 0, function: { name: "web_search", arguments: '{"query":' } }] } }] }, result);
    collectStreamTelemetry({ choices: [{ delta: { tool_calls: [{ index: 0, function: { arguments: '"case law"}' } }] } }], usage: { prompt_tokens: 20, completion_tokens: 50 } }, result);
    expect(result.toolCalls).toEqual([{ name: "web_search", arguments: '{"query":"case law"}' }]);
    expect(result.usage).toEqual({ input: 20, output: 50 });
  });
  it("surfaces provider stream failures rather than marking them successful", () => {
    expect(() => collectStreamTelemetry({ error: { message: "Provider disconnected" } }, run())).toThrow("Provider disconnected");
  });
  it("rejects credential-bearing and non-http links", () => {
    expect(safeSourceUrl("https://user:password@example.com")).toBeNull();
    expect(safeSourceUrl("file:///private")).toBeNull();
  });
});
