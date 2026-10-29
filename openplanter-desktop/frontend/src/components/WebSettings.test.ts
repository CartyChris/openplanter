// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { getWebPreferences } from "../api/webPreferences";
import { openWebSettings } from "./WebSettings";

beforeEach(() => {
  localStorage.clear();
  document.body.innerHTML = "";
  delete (window as any).__TAURI_INTERNALS__;
  vi.stubGlobal(
    "fetch",
    vi.fn(async () =>
      new Response(
        JSON.stringify({
          data: [
            { id: "openai/gpt-5.5", name: "GPT-5.5" },
            { id: "z-ai/glm-5.2", name: "GLM 5.2" },
          ],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      )
    )
  );
});

describe("browser Control Center", () => {
  it("renders the six approved settings tabs", async () => {
    openWebSettings();
    await Promise.resolve();
    const labels = [...document.querySelectorAll(".settings-tab")].map((node) => node.textContent);
    expect(labels).toEqual([
      "Model",
      "Web",
      "Subagents",
      "Behavior",
      "Appearance",
      "Keys & Limits",
    ]);
  });

  it("persists web-search mode and appearance preferences", async () => {
    openWebSettings();
    await vi.waitFor(() => expect(document.querySelector<HTMLSelectElement>('[data-setting="model"]')?.value).toBeTruthy());

    const searchMode = document.querySelector('[data-setting="web-search-mode"]') as HTMLSelectElement;
    const accent = document.querySelector('[data-setting="accent"]') as HTMLSelectElement;
    searchMode.value = "always";
    accent.value = "violet";

    (document.querySelector(".settings-save") as HTMLButtonElement).click();
    await Promise.resolve();

    const preferences = getWebPreferences();
    expect(preferences.webSearchMode).toBe("always");
    expect(preferences.accent).toBe("violet");
  });

  it("refreshes the catalog without silently changing a filtered selection", async () => {
    openWebSettings();
    await vi.waitFor(() => expect(document.querySelector<HTMLSelectElement>('[data-setting="model"]')?.options.length).toBeGreaterThan(0));
    const model = document.querySelector<HTMLSelectElement>('[data-setting="model"]')!;
    model.value = "openai/gpt-5.5";
    model.dispatchEvent(new Event("change"));
    const search = document.querySelector<HTMLInputElement>('input[type="search"]')!;
    search.value = "no matching model";
    search.dispatchEvent(new Event("input"));
    expect(model.value).toBe("openai/gpt-5.5");
    const refresh = [...document.querySelectorAll("button")].find((button) => button.textContent === "Refresh model catalog")!;
    refresh.click();
    await vi.waitFor(() => expect(refresh.disabled).toBe(false));
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(model.value).toBe("openai/gpt-5.5");
  });

  it("can add a configurable subagent card", async () => {
    openWebSettings();
    await Promise.resolve();
    const subagentsTab = [...document.querySelectorAll(".settings-tab")].find(
      (node) => node.textContent === "Subagents"
    ) as HTMLButtonElement;
    subagentsTab.click();

    const before = document.querySelectorAll(".subagent-card").length;
    (document.querySelector('[data-action="add-subagent"]') as HTMLButtonElement).click();
    expect(document.querySelectorAll(".subagent-card").length).toBe(before + 1);
  });

  it("explains that Exa and Firecrawl are optional enhancements", async () => {
    openWebSettings();
    await Promise.resolve();
    expect(document.body.textContent).toContain("works without Exa or Firecrawl keys");
  });
});
