// @vitest-environment happy-dom
import { describe, expect, it, vi } from "vitest";
import { createMobileDock } from "./MobileDock";

describe("MobileDock", () => {
  it("renders portrait-accessible New, Threads, Research, Settings, and More actions", () => {
    const dock = createMobileDock({
      newSession: vi.fn(),
      renderThreads: vi.fn(),
      openResearch: vi.fn(),
      openSettings: vi.fn(),
      openDashboard: vi.fn(),
    });

    expect(dock.querySelector('[data-action="new-session"]')).not.toBeNull();
    expect(dock.querySelector('[data-action="threads"]')).not.toBeNull();
    expect(dock.querySelector('[data-action="research"]')).not.toBeNull();
    expect(dock.querySelector('[data-action="settings"]')).not.toBeNull();
    expect(dock.querySelector('[data-action="more"]')).not.toBeNull();
  });

  it("opens a thread sheet with a New Session action", async () => {
    const renderThreads = vi.fn(async (container: HTMLElement) => {
      const row = document.createElement("button");
      row.textContent = "Existing thread";
      container.appendChild(row);
    });
    const newSession = vi.fn();
    const dock = createMobileDock({
      newSession,
      renderThreads,
      openResearch: vi.fn(),
      openSettings: vi.fn(),
      openDashboard: vi.fn(),
    });
    document.body.appendChild(dock);

    (dock.querySelector('[data-action="threads"]') as HTMLButtonElement).click();
    await Promise.resolve();

    const sheet = document.querySelector(".mobile-sheet");
    expect(sheet).not.toBeNull();
    expect(sheet!.querySelector(".mobile-new-session")).not.toBeNull();
    expect(sheet!.querySelector(".mobile-session-list")!.textContent).toContain("Existing thread");

    (sheet!.querySelector(".mobile-new-session") as HTMLButtonElement).click();
    expect(newSession).toHaveBeenCalledTimes(1);
  });
});
