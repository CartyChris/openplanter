// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import { openArtifactPreview } from "./ArtifactPreview";

afterEach(() => { document.body.replaceChildren(); vi.restoreAllMocks(); });

describe("isolated artifact previews", () => {
  it("isolates scripts from app origin and disables network access", () => {
    vi.spyOn(HTMLDialogElement.prototype, "showModal").mockImplementation(() => {});
    const dialog = openArtifactPreview('<h1>Report</h1><script>window.test = true</script>');
    const frame = dialog.querySelector("iframe")!;
    expect(frame.getAttribute("sandbox")).toBe("allow-scripts");
    expect(frame.getAttribute("referrerpolicy")).toBe("no-referrer");
    expect(frame.srcdoc).toContain("connect-src 'none'");
    expect(frame.srcdoc.indexOf("Content-Security-Policy")).toBeLessThan(frame.srcdoc.indexOf("<h1>Report"));
    expect(frame.getAttribute("allow")).toContain("camera 'none'");
  });

  it("removes generated code on close and restores focus", () => {
    vi.spyOn(HTMLDialogElement.prototype, "showModal").mockImplementation(() => {});
    const opener = document.createElement("button");
    document.body.append(opener);
    opener.focus();
    const dialog = openArtifactPreview("<h1>Report</h1>");
    const frame = dialog.querySelector("iframe")!;
    dialog.dispatchEvent(new Event("close"));
    expect(dialog.isConnected).toBe(false);
    expect(frame.srcdoc).toBe("");
    expect(document.activeElement).toBe(opener);
  });
});
