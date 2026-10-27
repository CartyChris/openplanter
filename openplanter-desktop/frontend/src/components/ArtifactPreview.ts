export function openArtifactPreview(html: string): HTMLDialogElement {
  const dialog = document.createElement("dialog");
  dialog.setAttribute("aria-label", "HTML artifact preview");
  Object.assign(dialog.style, {
    width: "min(1100px, calc(100vw - 24px))",
    height: "min(800px, calc(100dvh - 24px))",
    padding: "12px",
    border: "1px solid #64748b",
    borderRadius: "12px",
    background: "#0f172a",
    color: "#f8fafc",
  });
  const controls = document.createElement("div");
  Object.assign(controls.style, { display: "flex", alignItems: "center", gap: "12px", marginBottom: "12px" });
  const description = document.createElement("p");
  description.textContent = "Isolated preview. External requests, popups, and forms are blocked.";
  Object.assign(description.style, { flex: "1", margin: "0", fontSize: "14px" });
  const close = document.createElement("button");
  close.textContent = "Close preview";
  Object.assign(close.style, { minHeight: "44px", padding: "8px 12px", cursor: "pointer" });
  close.addEventListener("click", () => dialog.close());
  controls.append(description, close);

  const frame = document.createElement("iframe");
  frame.title = "Generated HTML artifact";
  // Never add allow-same-origin: generated scripts must not access app storage.
  frame.setAttribute("sandbox", "allow-scripts");
  frame.setAttribute("referrerpolicy", "no-referrer");
  frame.setAttribute("allow", "camera 'none'; microphone 'none'; geolocation 'none'; clipboard-read 'none'; clipboard-write 'none'");
  Object.assign(frame.style, { width: "100%", height: "calc(100% - 80px)", border: "0", background: "white" });
  const policy = "default-src 'none'; script-src 'unsafe-inline' 'unsafe-eval'; style-src 'unsafe-inline'; img-src data: blob:; media-src data: blob:; font-src data:; connect-src 'none'; frame-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'";
  frame.srcdoc = `<!doctype html><html><head><meta http-equiv="Content-Security-Policy" content="${policy}"><meta name="viewport" content="width=device-width, initial-scale=1"></head><body>${html}</body></html>`;
  dialog.append(controls, frame);
  const previousFocus = document.activeElement;
  dialog.addEventListener("close", () => {
    frame.srcdoc = "";
    dialog.remove();
    if (previousFocus instanceof HTMLElement && previousFocus.isConnected) previousFocus.focus();
  }, { once: true });
  document.body.appendChild(dialog);
  dialog.showModal();
  close.focus();
  return dialog;
}
