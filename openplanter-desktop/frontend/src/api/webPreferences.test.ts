// @vitest-environment happy-dom
import { beforeEach, describe, expect, it } from "vitest";
import {
  DEFAULT_WEB_PREFERENCES,
  applyWebAppearance,
  getWebPreferences,
  normalizePreferences,
  updateWebPreferences,
} from "./webPreferences";

const KEY = "openplanter:web:v2";

describe("browser preferences", () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.removeAttribute("data-accent");
    document.documentElement.removeAttribute("data-density");
    document.documentElement.removeAttribute("data-message-width");
    document.documentElement.style.removeProperty("--font-scale");
  });

  it("migrates an existing v2 store without deleting user data", () => {
    const oldStore = {
      config: { provider: "openrouter", model: "model/x" },
      sessions: [{ id: "s1", created_at: "2026-08-23T00:00:00Z", turn_count: 1, last_objective: "x" }],
      history: { s1: [{ role: "user", content: "hello" }] },
      credentials: { openrouter: "secret" },
      documents: [{ name: "note.md", content: "note", createdAt: "now" }],
    };
    localStorage.setItem(KEY, JSON.stringify(oldStore));

    const preferences = getWebPreferences();
    expect(preferences.webSearchMode).toBe("auto");
    expect(preferences.maxSearchResults).toBe(8);
    expect(preferences.webFetchEnabled).toBe(true);

    updateWebPreferences({ webSearchMode: "always" });
    const saved = JSON.parse(localStorage.getItem(KEY)!);
    expect(saved.sessions).toEqual(oldStore.sessions);
    expect(saved.history).toEqual(oldStore.history);
    expect(saved.credentials).toEqual(oldStore.credentials);
    expect(saved.documents).toEqual(oldStore.documents);
    expect(saved.preferences.webSearchMode).toBe("always");
  });

  it("clamps unsafe numeric values and normalizes invalid enum values", () => {
    const preferences = normalizePreferences({
      maxSearchResults: 999,
      maxFetchTokens: 1,
      maxDelegations: 99,
      temperature: -2,
      maxOutputTokens: 999999,
      fontScale: 4,
      webSearchMode: "invalid" as any,
      density: "invalid" as any,
    });

    expect(preferences.maxSearchResults).toBe(20);
    expect(preferences.maxFetchTokens).toBe(2000);
    expect(preferences.maxDelegations).toBe(10);
    expect(preferences.temperature).toBe(0);
    expect(preferences.maxOutputTokens).toBe(64000);
    expect(preferences.fontScale).toBe(1.2);
    expect(preferences.webSearchMode).toBe("auto");
    expect(preferences.density).toBe("comfortable");
  });

  it("provides deterministic default subagent profiles", () => {
    expect(DEFAULT_WEB_PREFERENCES.subagentsEnabled).toBe(false);
    expect(DEFAULT_WEB_PREFERENCES.subagents.map((worker) => worker.id)).toEqual([
      "research-scout",
      "verifier",
    ]);
    expect(DEFAULT_WEB_PREFERENCES.subagents[0].webSearch).toBe(true);
    expect(DEFAULT_WEB_PREFERENCES.subagents[0].webFetch).toBe(true);
  });

  it("persists nested subagent profile updates", () => {
    const worker = {
      ...DEFAULT_WEB_PREFERENCES.subagents[0],
      model: "z-ai/glm-5.2",
      instructions: "Search broadly and summarize evidence.",
    };

    updateWebPreferences({ subagentsEnabled: true, subagents: [worker] });
    const loaded = getWebPreferences();
    expect(loaded.subagentsEnabled).toBe(true);
    expect(loaded.subagents).toHaveLength(1);
    expect(loaded.subagents[0].model).toBe("z-ai/glm-5.2");
  });

  it("applies persisted appearance to document root", () => {
    applyWebAppearance(normalizePreferences({
      accent: "violet",
      density: "compact",
      messageWidth: "readable",
      fontScale: 1.1,
      reducedMotion: true,
    }));

    expect(document.documentElement.dataset.accent).toBe("violet");
    expect(document.documentElement.dataset.density).toBe("compact");
    expect(document.documentElement.dataset.messageWidth).toBe("readable");
    expect(document.documentElement.dataset.reducedMotion).toBe("true");
    expect(document.documentElement.style.getPropertyValue("--font-scale")).toBe("1.1");
  });
});
