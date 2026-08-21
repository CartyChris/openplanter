import { listModels, updateConfig } from "../api/invoke";
import { downloadText, webSaveCredential } from "../api/web";
import { appState } from "../state/store";

export function openWebSettings() {
  const overlay = document.createElement("div"); overlay.className = "settings-overlay";
  const panel = document.createElement("section"); panel.className = "settings-panel"; panel.setAttribute("role", "dialog"); panel.setAttribute("aria-label", "OpenPlanter settings");
  const title = document.createElement("h2"); title.textContent = "Control center"; panel.appendChild(title);
  const close = document.createElement("button"); close.textContent = "Close"; close.className = "settings-close"; close.onclick = () => overlay.remove(); panel.appendChild(close);
  const provider = document.createElement("select"); ["openrouter", "openai", "anthropic", "google", "ollama", "lmstudio"].forEach((p) => { const o = document.createElement("option"); o.value = p; o.textContent = p; provider.appendChild(o); }); provider.value = appState.get().provider || "openrouter";
  const model = document.createElement("select"); model.setAttribute("aria-label", "AI model");
  const key = document.createElement("input"); key.type = "password"; key.placeholder = "API key (stored in this browser)";
  const profile = document.createElement("select"); ["planning", "coding", "fast research", "document extraction", "verification", "private analysis"].forEach((p) => { const o = document.createElement("option"); o.textContent = p; profile.appendChild(o); });
  const limit = document.createElement("input"); limit.type = "number"; limit.min = "0"; limit.step = "1"; limit.placeholder = "Daily spend limit (USD)";
  for (const [label, el] of [["Provider", provider], ["Model", model], ["Task profile", profile], ["API key", key], ["Spend limit", limit]] as const) { const l = document.createElement("label"); l.textContent = label; l.appendChild(el); panel.appendChild(l); }
  const status = document.createElement("p"); status.className = "settings-status"; panel.appendChild(status);
  const save = document.createElement("button"); save.textContent = "Save settings"; save.className = "settings-save"; save.onclick = async () => { const config = await updateConfig({ provider: provider.value, model: model.value }); appState.update((s) => ({ ...s, provider: config.provider, model: config.model })); if (key.value) webSaveCredential(provider.value, key.value); status.textContent = "Saved locally."; key.value = ""; }; panel.appendChild(save);
  const exportBtn = document.createElement("button"); exportBtn.textContent = "Download current chat"; exportBtn.onclick = () => downloadText("openplanter-report.md", appState.get().messages.map((m) => `## ${m.role}\n\n${m.content}`).join("\n\n")); panel.appendChild(exportBtn);
  provider.onchange = async () => { model.replaceChildren(...(await listModels(provider.value)).map((m) => { const o = document.createElement("option"); o.value = m.id; o.textContent = m.id; return o; })); }; void provider.onchange?.(new Event("change")); overlay.appendChild(panel); overlay.onclick = (e) => { if (e.target === overlay) overlay.remove(); }; document.body.appendChild(overlay);
}
