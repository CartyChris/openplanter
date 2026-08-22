import { listModels, updateConfig } from "../api/invoke";
import { downloadText, webSaveCredential, webRefreshOpenRouterModels } from "../api/web";
import { appState } from "../state/store";

const profiles = ["planning", "coding", "fast research", "document extraction", "verification", "private analysis"];
const providers = ["openrouter", "openai", "anthropic", "google", "cerebras", "ollama", "lmstudio"];

export function openWebSettings() {
  const overlay = document.createElement("div"); overlay.className = "settings-overlay";
  const panel = document.createElement("section"); panel.className = "settings-panel"; panel.setAttribute("role", "dialog"); panel.setAttribute("aria-label", "OpenPlanter settings");
  const title = document.createElement("h2"); title.textContent = "Control center"; panel.appendChild(title);
  const close = document.createElement("button"); close.textContent = "Close"; close.className = "settings-close"; close.onclick = () => overlay.remove(); panel.appendChild(close);
  const provider = document.createElement("select"); providers.forEach((p) => { const o = document.createElement("option"); o.value = p; o.textContent = p; provider.appendChild(o); }); provider.value = appState.get().provider || "openrouter";
  const search = document.createElement("input"); search.type = "search"; search.placeholder = "Search models...";
  const model = document.createElement("select"); model.setAttribute("aria-label", "AI model");
  const favorites = new Set<string>(JSON.parse(localStorage.getItem("openplanter:favorites") || "[]"));
  const profile = document.createElement("select"); profiles.forEach((p) => { const o = document.createElement("option"); o.value = p; o.textContent = p; profile.appendChild(o); }); profile.value = localStorage.getItem("openplanter:profile") || profiles[0];
  const key = document.createElement("input"); key.type = "password"; key.placeholder = "Provider API key (stored in this browser)";
  const exaKey = document.createElement("input"); exaKey.type = "password"; exaKey.placeholder = "Exa API key (optional, stored locally)";
  const firecrawlKey = document.createElement("input"); firecrawlKey.type = "password"; firecrawlKey.placeholder = "Firecrawl API key (optional, stored locally)";
  const limit = document.createElement("input"); limit.type = "number"; limit.min = "0"; limit.step = "1"; limit.placeholder = "Daily spend limit (USD)"; limit.value = localStorage.getItem("openplanter:spend-limit") || "";
  const appearance = document.createElement("select"); ["dark", "light", "high-contrast"].forEach((p) => { const o = document.createElement("option"); o.value = p; o.textContent = p; appearance.appendChild(o); }); appearance.value = localStorage.getItem("openplanter:theme") || "dark"; appearance.onchange = () => { localStorage.setItem("openplanter:theme", appearance.value); document.documentElement.dataset.theme = appearance.value; };
  const fields: [string, HTMLElement][] = [["Provider", provider], ["Model search", search], ["Model", model], ["Task profile", profile], ["API key", key], ["Exa web research", exaKey], ["Firecrawl web research", firecrawlKey], ["Spend limit", limit], ["Appearance", appearance]];
  for (const [label, el] of fields) { const l = document.createElement("label"); l.textContent = label; l.appendChild(el); panel.appendChild(l); }
  const status = document.createElement("p"); status.className = "settings-status"; panel.appendChild(status);
  let allModels: { id: string; name: string | null }[] = [];
  const renderModels = () => { const q = search.value.toLowerCase(); model.replaceChildren(...allModels.filter((m) => m.id.toLowerCase().includes(q) || (m.name || "").toLowerCase().includes(q)).map((m) => { const o = document.createElement("option"); o.value = m.id; o.textContent = `${favorites.has(m.id) ? "★ " : "☆ "}${m.id}`; return o; })); };
  const loadModels = async () => { try { allModels = await listModels(provider.value); if (provider.value === "openrouter") { try { allModels = await webRefreshOpenRouterModels(); } catch { status.textContent = "Using built-in model catalog; refresh unavailable."; } } renderModels(); } catch { status.textContent = "Could not load models."; } };
  search.oninput = renderModels; model.onclick = () => { if (model.value) { favorites.has(model.value) ? favorites.delete(model.value) : favorites.add(model.value); localStorage.setItem("openplanter:favorites", JSON.stringify([...favorites])); renderModels(); } };
  provider.onchange = () => void loadModels();
  const save = document.createElement("button"); save.textContent = "Save settings"; save.className = "settings-save"; save.onclick = async () => { try { const config = await updateConfig({ provider: provider.value, model: model.value }); appState.update((s) => ({ ...s, provider: config.provider, model: config.model })); if (key.value) webSaveCredential(provider.value, key.value); if (exaKey.value) webSaveCredential("exa", exaKey.value); if (firecrawlKey.value) webSaveCredential("firecrawl", firecrawlKey.value); localStorage.setItem("openplanter:profile", profile.value); localStorage.setItem("openplanter:spend-limit", limit.value); status.textContent = "Saved locally."; key.value = ""; } catch { status.textContent = "Settings could not be saved."; } }; panel.appendChild(save);
  const exportBtn = document.createElement("button"); exportBtn.textContent = "Download current chat"; exportBtn.onclick = () => downloadText("openplanter-report.md", appState.get().messages.map((m) => `## ${m.role}\n\n${m.content}`).join("\n\n")); panel.appendChild(exportBtn);
  overlay.appendChild(panel); overlay.onclick = (e) => { if (e.target === overlay) overlay.remove(); }; document.body.appendChild(overlay); void loadModels();
}
