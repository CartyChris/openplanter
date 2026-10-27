import { researchSnapshot, restoreResearchSnapshot } from "../api/web";

async function request(path: string, method = "GET", body?: unknown) {
  const response = await fetch(path, { method, credentials: "same-origin", headers: body ? { "Content-Type": "application/json" } : undefined, body: body ? JSON.stringify(body) : undefined });
  if (!response.headers.get("content-type")?.includes("application/json")) throw new Error("Cloud services are unavailable on this preview. Use a Vercel deployment with server functions.");
  const data = await response.json();
  if (!response.ok) throw new Error(path.startsWith("/api/auth") ? "Authentication failed. Check your details and try again." : data.error || "Cloud request failed.");
  return data;
}

export function openCloudWorkspace() {
  const dialog = document.createElement("dialog");
  dialog.setAttribute("aria-label", "Private research storage");
  Object.assign(dialog.style, { width: "min(480px, calc(100vw - 24px))", maxHeight: "calc(100dvh - 24px)", overflowY: "auto", padding: "20px", borderRadius: "12px", background: "#111827", color: "#f9fafb", border: "1px solid #64748b" });
  const heading = document.createElement("h2"); heading.textContent = "Private research storage";
  const note = document.createElement("p"); note.textContent = "Save sessions, messages, and finding documents to your account. Provider API keys stay on this device. Cloud saves are manual, not automatic.";
  const status = document.createElement("p"); status.setAttribute("role", "status"); status.setAttribute("aria-live", "polite");
  const content = document.createElement("div"); Object.assign(content.style, { display: "flex", flexDirection: "column", gap: "12px" });
  const close = document.createElement("button"); close.textContent = "Close"; close.onclick = () => dialog.close(); close.style.minHeight = "44px";
  dialog.append(heading, note, status, content, close);
  dialog.addEventListener("close", () => dialog.remove(), { once: true });
  document.body.append(dialog); dialog.showModal();
  let busy = false;
  const run = async (action: () => Promise<void>) => {
    if (busy) return;
    busy = true; status.textContent = "Working…";
    try { await action(); } catch (error) { status.textContent = error instanceof Error ? error.message : "Request failed."; }
    finally { busy = false; }
  };
  const button = (label: string, action: () => Promise<void>) => {
    const element = document.createElement("button"); element.textContent = label; element.style.minHeight = "44px";
    element.onclick = () => { void run(action); }; return element;
  };
  async function refresh() {
    const session = await request("/api/auth/get-session");
    content.replaceChildren();
    if (!session?.user) { renderForm(); status.textContent = "Sign in to access your private research."; return; }
    const cloud = await request("/api/workspace");
    let revision: number = cloud.revision;
    status.textContent = `Signed in as ${session.user.email}. Cloud revision: ${revision}.`;
    content.append(
      button("Save this device to cloud", async () => {
        if (revision && !confirm("Replace the cloud workspace with this device's research? Other devices may contain different research. Export a backup first if needed.")) { status.textContent = "Save cancelled."; return; }
        const saved = await request("/api/workspace", "PUT", { revision, data: researchSnapshot() });
        revision = saved.revision; status.textContent = `Saved securely. Cloud revision ${revision}.`;
      }),
      button("Load cloud research onto this device", async () => {
        const latest = await request("/api/workspace");
        if (!latest.data) { status.textContent = "No saved research yet."; return; }
        if (!confirm("Replace this device's sessions and findings with the cloud copy? Export any unsaved local work first.")) { status.textContent = "Load cancelled."; return; }
        restoreResearchSnapshot(latest.data); location.reload();
      }),
      button("Sign out", async () => { await request("/api/auth/sign-out", "POST", {}); await refresh(); }),
    );
  }
  function renderForm() {
    const form = document.createElement("form"); Object.assign(form.style, { display: "flex", flexDirection: "column", gap: "12px" });
    const field = (labelText: string, type: string, autocomplete: string) => {
      const label = document.createElement("label"); label.textContent = labelText;
      const input = document.createElement("input"); input.type = type; input.autocomplete = autocomplete as AutoFill; input.required = true;
      Object.assign(input.style, { width: "100%", minHeight: "44px", fontSize: "16px", display: "block", boxSizing: "border-box" }); label.append(input); form.append(label); return input;
    };
    const email = field("Email", "email", "email");
    const password = field("Password (at least 8 characters)", "password", "current-password"); password.minLength = 8;
    const signin = document.createElement("button"); signin.type = "submit"; signin.textContent = "Sign in"; signin.style.minHeight = "44px";
    const signup = button("Create account", async () => {
      if (!form.reportValidity()) { status.textContent = "Enter a valid email and password."; return; }
      await request("/api/auth/sign-up/email", "POST", { email: email.value.trim(), password: password.value, name: email.value.trim().split("@")[0] });
      password.value = ""; await refresh();
    }); signup.type = "button";
    form.onsubmit = (event) => { event.preventDefault(); void run(async () => { await request("/api/auth/sign-in/email", "POST", { email: email.value.trim(), password: password.value }); password.value = ""; await refresh(); }); };
    form.append(signin, signup); content.append(form);
  }
  void run(refresh);
}
