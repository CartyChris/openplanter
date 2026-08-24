// @vitest-environment happy-dom
import { describe, expect, it, vi } from "vitest";

vi.mock("@tauri-apps/api/event", () => ({
  listen: vi.fn(),
}));

import { onAgentStep } from "./events";

describe("browser event ownership", () => {
  it("uses agent-status instead of agent-step for browser run accounting", async () => {
    delete (window as any).__TAURI_INTERNALS__;
    const callback = vi.fn();
    const unlisten = await onAgentStep(callback);

    const payload = {
      type: "step",
      depth: 0,
      step: 1,
      tool_name: "web-ready",
      tokens: { input_tokens: 123, output_tokens: 45 },
      elapsed_ms: 500,
      is_final: false,
    };

    window.dispatchEvent(new CustomEvent("agent-step", { detail: payload }));
    expect(callback).not.toHaveBeenCalled();

    window.dispatchEvent(new CustomEvent("agent-status", { detail: payload }));
    expect(callback).toHaveBeenCalledTimes(1);
    expect(callback).toHaveBeenCalledWith(payload);

    unlisten();
  });
});
