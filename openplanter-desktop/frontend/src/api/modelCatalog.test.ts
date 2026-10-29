import { afterEach, expect, it, vi } from "vitest";
import { webRefreshOpenRouterModels } from "./web";
afterEach(() => vi.unstubAllGlobals());
it("loads current models newest-first and retains advertised capabilities", async () => {
  const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ data: [
    { id: "vendor/older", created: 10, supported_parameters: [] },
    { id: "vendor/new", name: "New", created: 20, context_length: 128000, supported_parameters: ["tools"], pricing: { prompt: "0.000001", completion: "0.000002" } },
  ] })));
  vi.stubGlobal("fetch", fetch);
  const models = await webRefreshOpenRouterModels();
  expect(models.map((model) => model.id)).toEqual(["vendor/new", "vendor/older"]);
  expect(models[0].supportedParameters).toEqual(["tools"]);
  expect(models[0].contextLength).toBe(128000);
  expect(fetch).toHaveBeenCalledWith("https://openrouter.ai/api/v1/models?sort=newest", expect.objectContaining({ cache: "no-store" }));
});
it("does not silently accept an empty catalog", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response('{"data":[]}')));
  await expect(webRefreshOpenRouterModels()).rejects.toThrow("empty catalog");
});
