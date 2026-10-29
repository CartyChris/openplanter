import { afterEach, describe, expect, it, vi } from "vitest";
import { CloudSync } from "./cloudSync";

afterEach(() => vi.useRealTimers());
describe("private cloud synchronization", () => {
  it("keeps guest changes unsaved without transmitting", async () => {
    const send = vi.fn(); const sync = new CloudSync(send, () => {});
    sync.enqueue({ value: 1 });
    expect(sync.unsaved).toBe(true);
    await expect(sync.flush()).rejects.toThrow("Sign in");
    expect(send).not.toHaveBeenCalled(); sync.discard();
  });
  it("serializes in-flight changes against the latest revision", async () => {
    let release!: (revision: number) => void;
    const send = vi.fn().mockImplementationOnce(() => new Promise<number>((resolve) => { release = resolve; })).mockResolvedValueOnce(3);
    const sync = new CloudSync<{ value: number }>(send, () => {});
    sync.connect("owner-a", 1, { value: 0 }); sync.enqueue({ value: 1 });
    const saving = sync.flush(); sync.enqueue({ value: 2 });
    expect(() => sync.connect("owner-b", 0, { value: 0 })).toThrow("Wait");
    release(2); await saving;
    expect(send.mock.calls).toEqual([[{ value: 1 }, 1, "owner-a"], [{ value: 2 }, 2, "owner-a"]]);
    expect(sync.unsaved).toBe(false); expect(sync.state).toBe("saved"); sync.discard();
  });
  it("retains newer work on conflict without overwriting the cloud revision", async () => {
    const send = vi.fn().mockRejectedValue(new Error("A newer cloud revision exists."));
    const sync = new CloudSync(send, () => {}); sync.connect("a", 4, {}); sync.enqueue({ note: "keep me" });
    await expect(sync.flush()).rejects.toThrow("newer");
    expect(sync.state).toBe("paused"); expect(sync.unsaved).toBe(true);
    sync.enqueue({ note: "keep this too" });
    await expect(sync.flush()).rejects.toThrow("newer"); expect(send).toHaveBeenCalledTimes(1); sync.discard();
  });
  it("coalesces edits and cancels a reverted pending change", async () => {
    vi.useFakeTimers(); const send = vi.fn().mockResolvedValue(2);
    const sync = new CloudSync(send, () => {}); sync.connect("a", 1, { note: "original" });
    sync.enqueue({ note: "changed" }); sync.enqueue({ note: "original" });
    await vi.advanceTimersByTimeAsync(500);
    expect(send).not.toHaveBeenCalled(); expect(sync.unsaved).toBe(false); expect(sync.state).toBe("saved");
  });
});
