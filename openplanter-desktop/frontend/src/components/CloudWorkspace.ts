import { researchSnapshot, researchSync, exportLegacyResearch, downloadText } from "../api/web";
import { cloudRequest as request } from "../api/cloudSync";

export function openCloudWorkspace() {
  const dialog = document.createElement("dialog");
  dialog.className = "research-dialog";
  dialog.setAttribute("aria-label", "Private research storage");
  Object.assign(dialog.style, { width: "min(480px, calc(100vw - 24px))", maxHeight: "calc(100dvh - 24px)", overflowY: "auto", padding: "20px", borderRadius: "12px", background: "var(--bg-secondary)", color: "var(--text-primary)", margin: "auto", border: "1px solid #64748b" });
  const heading = document.createElement("h2"); heading.textContent = "Private research storage";
  const note = document.createElement("p"); note.textContent = "Signed-in research saves automatically. Guest research lasts only for this page. Provider API keys are never uploaded. Export unsaved work before switching accounts or loading a cloud copy.";
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
    content.replaceChildren(
      button("Export current research", async () => { downloadText("openplanter-research.json", JSON.stringify(researchSnapshot(), null, 2), "application/json"); status.textContent = "Research export downloaded without API keys."; }),
      button("Recover legacy browser backup", async () => { exportLegacyResearch(); status.textContent = "Legacy research downloaded. Import it after signing in to migrate it to cloud storage."; }),
    );
    const session = await request("/api/auth/get-session");
    if (!session?.user) { renderForm(); status.textContent = "Sign in to access your private research."; return; }
    status.textContent = `Signed in as ${session.user.email}. ${researchSync.message}`;
    content.append(
      button("Save now / retry", async () => { await researchSync.retry(); status.textContent = researchSync.message; }),
      button("Reload cloud research", async () => {
        if (!confirm("Reload the cloud copy? Export unsaved work first. Unsaved changes on this page will be discarded.")) { status.textContent = "Reload cancelled."; return; }
        researchSync.discard(); location.reload();
      }),
      button("Sign out", async () => {
        if (researchSync.unsaved) await researchSync.flush();
        await request("/api/auth/sign-out", "POST", {}); researchSync.discard(); location.reload();
      }),
    );
  }
  async function finishLogin() {
    if (researchSync.unsaved) {
      downloadText("openplanter-guest-recovery.json", JSON.stringify(researchSnapshot(), null, 2), "application/json");
      status.textContent = "Signed in. A guest research backup was downloaded. Load your cloud account to continue, then import the backup if needed.";
      content.replaceChildren(button("Load my cloud account", async () => { researchSync.discard(); location.reload(); }));
      return;
    }
    location.reload();
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
      password.value = ""; await finishLogin();
    }); signup.type = "button";
    form.onsubmit = (event) => { event.preventDefault(); void run(async () => { await request("/api/auth/sign-in/email", "POST", { email: email.value.trim(), password: password.value }); password.value = ""; await finishLogin(); }); };
    form.append(signin, signup); content.append(form);
  }
  void run(refresh);
}
